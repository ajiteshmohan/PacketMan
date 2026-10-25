#!/usr/bin/env python3
"""Error detection and classification for TCP measurement windows (0.5 s each).

Two layers
  1. Rule engine (always on, explainable, no training): decides whether the window shows a
     TCP error *symptom*, infers the *likely cause* from RTT / loss / stall signatures, and
     reports which TCP *recovery mechanism* was active (read from the kernel CA state).
  2. Random Forest (optional, learned): 200 trees, depth 15 - same inputs, trained on labelled
     windows (ground truth = the netem impairment that was injected). Evaluated with 5-fold
     cross-validation grouped by run so that windows from one run never leak into the test fold.

What can and cannot be known from TCP statistics alone
  * random loss      vs  queue build-up/overflow  vs  total outage      -> separable (RTT and stall differ)
  * interference     vs  weak signal                                    -> NOT separable without RSSI
  * hand-off         vs  deep fade                                      -> NOT separable (both = outage)

    python classifier.py train --synthetic --model models/rf.joblib
    python classifier.py train --data "outputs/client_*.csv" --model models/rf.joblib
    python classifier.py predict --data "outputs/client_*.csv" --model models/rf.joblib --out outputs/classified.csv
"""
import argparse
import glob
import json
import os

import numpy as np
import pandas as pd

CLASSES = ["normal", "wireless_loss", "congestion", "link_interruption"]
LABEL_MAP = {"none": "normal", "random_loss": "wireless_loss",
             "congestion": "congestion", "blackout": "link_interruption"}
FEATURES = ["loss_est_pct", "krtt_ms", "rtt_ratio", "throughput_kbps", "cwnd", "retrans_delta",
            "rto_backoff", "ca_state", "d_cwnd_ratio", "d_rtt_ratio", "d_tp_ratio"]

RTT_INFLATION = 2.0     # RTT >= 2x the run's minimum (and >= 10 ms above it) => queue building
STALL_FRAC = 0.02       # throughput <= 2% of the run's 95th-percentile => stalled
WEAK_RSSI_DBM = -75.0   # below this, loss is attributed to weak signal rather than interference


def load_logs(pattern: str) -> pd.DataFrame:
    files = sorted(glob.glob(pattern))
    if not files:
        raise FileNotFoundError(f"no files match {pattern!r}")
    frames = []
    for f in files:
        d = pd.read_csv(f)
        d["source"] = os.path.basename(f)
        frames.append(d)
    return pd.concat(frames, ignore_index=True)


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    d = df.copy()
    if "source" not in d:
        d["source"] = d["scenario"].astype(str) + "_" + d["run"].astype(str)
    d = d.sort_values(["source", "t_s"]).reset_index(drop=True)
    g = d.groupby("source", sort=False)
    d["rtt_ms"] = d["krtt_ms"].fillna(d["app_rtt_ms"])
    base = g["rtt_ms"].transform("min").replace(0, np.nan)
    d["rtt_base_ms"] = base
    d["rtt_ratio"] = (d["rtt_ms"] / base).fillna(1.0)
    d["run_peak_kbps"] = g["throughput_kbps"].transform(lambda s: s.quantile(0.95))
    prev_cwnd, prev_rtt, prev_tp = g["cwnd"].shift(1), g["rtt_ms"].shift(1), g["throughput_kbps"].shift(1)
    d["d_cwnd_ratio"] = (d["cwnd"] / prev_cwnd.replace(0, np.nan)).fillna(1.0)
    d["d_rtt_ratio"] = (d["rtt_ms"] / prev_rtt.replace(0, np.nan)).fillna(1.0)
    d["d_tp_ratio"] = ((d["throughput_kbps"] + 1) / (prev_tp + 1)).fillna(1.0)
    for c in ["loss_est_pct", "retrans_delta", "rto_backoff", "ca_state", "cwnd"]:
        d[c] = d[c].fillna(0)
    d["krtt_ms"] = d["rtt_ms"].fillna(0)
    return d


def rule_based(df: pd.DataFrame) -> pd.DataFrame:
    """Annotate every window with: error_detected, symptom, likely_cause, cause_detail, tcp_response."""
    d = add_features(df)
    retrans = d["retrans_delta"] > 0
    timeouts = (d["rto_backoff"] >= 1) | (d["ca_state"] == 4)
    stalled = (d["run_peak_kbps"] > 0) & (d["throughput_kbps"] <= STALL_FRAC * d["run_peak_kbps"])
    queue = (d["rtt_ratio"] >= RTT_INFLATION) & ((d["rtt_ms"] - d["rtt_base_ms"]) >= 10)
    collapse = d["d_cwnd_ratio"] <= 0.5

    # --- symptom: what is visibly going wrong at TCP level (highest priority first)
    d["symptom"] = np.select(
        [stalled, timeouts, retrans | (d["ca_state"] == 3), collapse, queue],
        ["stall", "timeout_rto", "fast_retransmit", "cwnd_collapse", "rtt_inflation"], "none")
    d["error_detected"] = d["symptom"] != "none"

    # --- likely cause: loss-differentiation heuristic on RTT and delivery
    d["likely_cause"] = np.select(
        [stalled & (timeouts | retrans), queue, retrans | timeouts | collapse],
        ["link_interruption", "congestion", "wireless_loss"], "normal")

    rssi = d["rssi_dbm"] if "rssi_dbm" in d else pd.Series(np.nan, index=d.index)
    detail = np.select(
        [d["likely_cause"] == "link_interruption",
         (d["likely_cause"] == "congestion") & retrans,
         d["likely_cause"] == "congestion",
         (d["likely_cause"] == "wireless_loss") & rssi.notna() & (rssi < WEAK_RSSI_DBM),
         (d["likely_cause"] == "wireless_loss") & rssi.notna(),
         d["likely_cause"] == "wireless_loss"],
        ["handoff_or_deep_fade", "buffer_overflow", "queue_building", "weak_signal",
         "interference", "interference_or_weak_signal"], "none")
    d["cause_detail"] = detail

    # --- the TCP recovery mechanism, read from the kernel congestion-avoidance state
    in_slow_start = (d["ssthresh"].isna() | (d["cwnd"] < d["ssthresh"])) if "ssthresh" in d else False
    d["tcp_response"] = np.select(
        [timeouts, d["ca_state"] == 3, retrans, d["ca_state"] == 2, in_slow_start],
        ["rto_timeout_then_slow_start", "fast_recovery", "fast_retransmit", "cwr_backoff", "slow_start"],
        "congestion_avoidance")
    return d


def _xy(d):
    return d[FEATURES].to_numpy(float)


def train(df: pd.DataFrame, n_estimators=200, max_depth=15, seed=42, folds=5):
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import classification_report, confusion_matrix
    from sklearn.model_selection import GroupKFold

    d = add_features(df)
    d["label"] = d["impairment"].map(LABEL_MAP)
    d = d.dropna(subset=["label"]).reset_index(drop=True)
    if d.empty:
        raise ValueError("no labelled windows (impairment must be none/random_loss/congestion/blackout; "
                         "run client.py with --iface so ground truth is recorded)")
    X, y, groups = _xy(d), d["label"].to_numpy(), d["source"].to_numpy()
    make = lambda: RandomForestClassifier(n_estimators=n_estimators, max_depth=max_depth,
                                          class_weight="balanced", random_state=seed, n_jobs=-1)
    n_groups = len(set(groups))
    oof = np.empty(len(y), dtype=object)
    if n_groups >= 2:
        for tr, te in GroupKFold(n_splits=min(folds, n_groups)).split(X, y, groups):
            m = make().fit(X[tr], y[tr])
            oof[te] = m.predict(X[te])
    else:
        oof[:] = make().fit(X, y).predict(X)   # single run: resubstitution only (optimistic!)
    labels = [c for c in CLASSES if c in set(y)]
    rules = rule_based(df)
    rules["label"] = rules["impairment"].map(LABEL_MAP)
    rules = rules.dropna(subset=["label"])
    model = make().fit(X, y)
    metrics = {
        "n_windows": int(len(y)), "n_runs": int(n_groups), "cv": f"{min(folds, n_groups)}-fold, grouped by run",
        "class_counts": {k: int(v) for k, v in pd.Series(y).value_counts().items()},
        "cv_accuracy": float((oof == y).mean()),
        "rule_engine_accuracy": float((rules["likely_cause"] == rules["label"]).mean()),
        "report": classification_report(y, oof, labels=labels, output_dict=True, zero_division=0),
        "labels": labels, "confusion_matrix": confusion_matrix(y, oof, labels=labels).tolist(),
        "feature_importance": dict(sorted(zip(FEATURES, map(float, model.feature_importances_)),
                                          key=lambda kv: -kv[1])),
        "params": {"n_estimators": n_estimators, "max_depth": max_depth},
    }
    return {"model": model, "features": FEATURES, "classes": CLASSES}, metrics


def predict(bundle, df: pd.DataFrame) -> pd.DataFrame:
    d = rule_based(df)
    model = bundle["model"]
    proba = model.predict_proba(_xy(d))
    d["rf_cause"] = model.classes_[proba.argmax(1)]
    d["rf_confidence"] = proba.max(1)
    return d


def main(argv=None):
    import joblib
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train")
    t.add_argument("--synthetic", action="store_true", help="train on simulated labelled data (demo only)")
    t.add_argument("--data", help="glob of labelled client CSVs recorded with --iface")
    t.add_argument("--n", type=int, default=3000, help="windows for --synthetic")
    t.add_argument("--seed", type=int, default=1)
    t.add_argument("--model", default="models/rf.joblib")
    t.add_argument("--metrics", default="models/rf_metrics.json")
    p = sub.add_parser("predict")
    p.add_argument("--data", required=True)
    p.add_argument("--model", default="models/rf.joblib")
    p.add_argument("--out", default="outputs/classified.csv")
    a = ap.parse_args(argv)

    if a.cmd == "train":
        if a.synthetic:
            from simulate import generate_training
            df = generate_training(a.n, seed=a.seed)
            print(f"[train] {len(df)} SIMULATED windows (demo data - not measured)")
        elif a.data:
            df = load_logs(a.data)
        else:
            ap.error("give --synthetic or --data")
        bundle, m = train(df)
        os.makedirs(os.path.dirname(a.model) or ".", exist_ok=True)
        joblib.dump(bundle, a.model)
        with open(a.metrics, "w") as fh:
            json.dump(m, fh, indent=2)
        print(f"[train] windows={m['n_windows']} runs={m['n_runs']} classes={m['class_counts']}")
        print(f"[train] {m['cv']}: accuracy {m['cv_accuracy']:.3f}   (rule engine alone: {m['rule_engine_accuracy']:.3f})")
        print(f"[train] model -> {a.model}   metrics -> {a.metrics}")
    else:
        bundle = joblib.load(a.model)
        out = predict(bundle, load_logs(a.data))
        os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
        out.to_csv(a.out, index=False)
        print(out.groupby("likely_cause").size().to_string())
        print(f"-> {a.out}")


if __name__ == "__main__":
    main()
