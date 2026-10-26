#!/usr/bin/env python3
"""Turn client logs into graphs, a summary table, an error report, and optional SQLite database.

Usage:
    python analyze.py --input outputs --out outputs/figures [--model models/rf.joblib] [--sqlite outputs/experiments.db]

Figures:
  * Throughput over time per scenario (ACKed throughput vs server goodput)
  * Round-trip time over time per scenario (kernel RTT vs app ping RTT)
  * Congestion window over time per scenario (cwnd vs ssthresh)
  * Delivery rate vs goodput over time per scenario
  * Retransmissions over time per scenario
  * Dynamic loss timeline (5-panel view across loss steps)
  * Scenario summary bar charts (throughput, RTT, retransmissions, loss)
  * Throughput vs loss with the theoretical Mathis model
  * Packet loss vs retransmissions
  * Packet loss vs RTT
  * Detected cause breakdown & timeline
  * Confusion matrix & Feature importance (when ML metrics supplied)
Tables:
  * summary.csv / summary.sqlite
  * error_report.csv (diagnostic errors with symptoms, root causes, evidence, and actions)
"""
import argparse
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from classifier import CLASSES, load_logs, predict, rule_based
from schema import save_rows_to_sqlite

ORDER = ["baseline", "loss1", "loss5", "loss10", "dynamic", "dynamic2", "congestion", "blackout", "mixed"]
SHADE = {"random_loss": "#f5a623", "congestion": "#4a90d9", "blackout": "#d0021b"}
CAUSE_COLOR = {
    "normal": "#7bb77b",
    "wireless_loss": "#f5a623",
    "congestion": "#4a90d9",
    "link_interruption": "#d0021b"
}
MSS_BYTES = 1448
plt.rcParams.update({
    "figure.dpi": 130,
    "axes.grid": True,
    "grid.alpha": 0.25,
    "font.size": 9,
    "axes.spines.top": False,
    "axes.spines.right": False
})


def scen_order(names):
    return sorted(names, key=lambda n: (ORDER.index(n) if n in ORDER else 99, n))


def first_run(df, scen):
    d = df[df.scenario == scen]
    if d.empty:
        return d
    return d[d.source == d.source.iloc[0]].sort_values("t_s")


def shade_phases(ax, d):
    if "impairment" not in d:
        return
    imp = d["impairment"].astype(str).to_numpy()
    t = d["t_s"].to_numpy()
    start = 0
    for i in range(1, len(d) + 1):
        if i == len(d) or imp[i] != imp[start]:
            if imp[start] in SHADE:
                ax.axvspan(t[start] - 0.5, t[i - 1], color=SHADE[imp[start]], alpha=0.14, lw=0)
            start = i


def grid_plot(df, series, ylabel, title, path, log=False):
    scens = scen_order(df.scenario.unique())
    n = len(scens)
    cols = 2 if n > 1 else 1
    rows = math.ceil(n / cols)
    fig, axes = plt.subplots(rows, cols, figsize=(11, 2.4 * rows + 0.6), sharex=False, squeeze=False)
    for ax, s in zip(axes.flat, scens):
        d = first_run(df, s)
        shade_phases(ax, d)
        for col, label, kw in series:
            if col in d and d[col].notna().any():
                ax.plot(d.t_s, d[col], label=label, **kw)
        ax.set_title(s, loc="left", fontsize=9, fontweight="bold")
        ax.set_ylabel(ylabel)
        if log:
            ax.set_yscale("log")
    for ax in axes.flat[n:]:
        ax.axis("off")
    for ax in axes[-1]:
        ax.set_xlabel("time (s)")
    axes.flat[0].legend(fontsize=7, loc="upper right")
    fig.suptitle(title, fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    fig.savefig(path)
    plt.close(fig)


def dynamic_timeline(df, path, scen="dynamic"):
    if scen not in set(df.scenario):
        return
    d = first_run(df, scen)
    if d.empty:
        return
    fig, ax = plt.subplots(5, 1, figsize=(9, 9), sharex=True)
    loss_target = d.loss_target_pct.fillna(0) if "loss_target_pct" in d else pd.Series(0, index=d.index)
    ax[0].step(d.t_s, loss_target, where="post", color="#d0021b")
    ax[0].set_ylabel("injected loss (%)")
    ax[1].plot(d.t_s, d.throughput_kbps / 1000, color="#2c7fb8")
    ax[1].set_ylabel("throughput (Mbps)")
    rtt_col = "krtt_ms" if "krtt_ms" in d and d["krtt_ms"].notna().any() else "app_rtt_ms"
    ax[2].plot(d.t_s, d[rtt_col], label="RTT (ms)", color="#31a354")
    if "app_rtt_ms" in d and rtt_col != "app_rtt_ms":
        ax[2].plot(d.t_s, d.app_rtt_ms, label="app ping RTT", color="#a1d99b", lw=0.9)
    ax[2].set_ylabel("RTT (ms)")
    ax[2].legend(fontsize=7)
    if "cwnd" in d and d["cwnd"].notna().any():
        ax[3].plot(d.t_s, d.cwnd, color="#756bb1")
        ax[3].set_ylabel("cwnd (segments)")
    else:
        ax[3].text(0.5, 0.5, "cwnd unavailable on Windows", ha="center", va="center", transform=ax[3].transAxes)
    if "retrans_delta" in d and d["retrans_delta"].notna().any():
        ax[4].bar(d.t_s, d.retrans_delta, width=0.4, color="#e6550d")
        ax[4].set_ylabel("retrans / 0.5 s")
    else:
        ax[4].text(0.5, 0.5, "retransmits unavailable on Windows", ha="center", va="center", transform=ax[4].transAxes)
    ax[4].set_xlabel("time (s)")
    fig.suptitle(f"Dynamic loss schedule: degradation and recovery ({scen})", fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    fig.savefig(path)
    plt.close(fig)


def summary_table(df):
    g = df.groupby("scenario")
    s = pd.DataFrame({
        "mean_throughput_kbps": g["throughput_kbps"].mean(),
        "mean_goodput_kbps": g["goodput_kbps"].mean() if "goodput_kbps" in df else np.nan,
        "mean_delivery_kbps": g["delivery_kbps"].mean() if "delivery_kbps" in df else np.nan,
        "mean_krtt_ms": g["krtt_ms"].mean() if "krtt_ms" in df else np.nan,
        "p95_app_rtt_ms": g["app_rtt_ms"].quantile(0.95) if "app_rtt_ms" in df else np.nan,
        "mean_cwnd": g["cwnd"].mean() if "cwnd" in df else np.nan,
        "total_retransmits": g["retrans_delta"].sum() if "retrans_delta" in df else 0,
        "mean_loss_est_pct": g["loss_est_pct"].mean() if "loss_est_pct" in df else np.nan,
        "stalled_windows": g["throughput_kbps"].apply(lambda col: int((col < 1).sum())),
    }).round(2)
    return s.loc[scen_order(s.index)]


def summary_plot(s, path):
    fig, ax = plt.subplots(2, 2, figsize=(10, 6))
    pal = plt.cm.viridis(np.linspace(0.15, 0.85, len(s)))
    metrics_to_plot = [
        ("mean_throughput_kbps", "mean throughput (kbps)"),
        ("mean_krtt_ms", "mean RTT (ms)"),
        ("total_retransmits", "total retransmissions"),
        ("mean_loss_est_pct", "mean measured loss (%)")
    ]
    for a, (col, lab) in zip(ax.flat, metrics_to_plot):
        vals = s[col].fillna(0)
        a.bar(s.index, vals, color=pal)
        a.set_ylabel(lab)
        a.tick_params(axis="x", rotation=40)
    fig.suptitle("Scenario Performance Comparison", fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    fig.savefig(path)
    plt.close(fig)


def throughput_vs_loss(df, path):
    d = df[(df.impairment == "random_loss") & df.loss_target_pct.notna()]
    if d.empty:
        d = df[df.loss_est_pct.notna() & (df.loss_est_pct > 0)].assign(
            loss_target_pct=lambda x: x.loss_est_pct.round()
        )
    if d.empty:
        return
    rtt_col = "krtt_ms" if "krtt_ms" in d and d["krtt_ms"].notna().any() else "app_rtt_ms"
    g = d.groupby("loss_target_pct").agg(
        tp=("throughput_kbps", "mean"),
        sd=("throughput_kbps", "std"),
        rtt=(rtt_col, "median")
    ).reset_index()
    fig, ax = plt.subplots(figsize=(6.5, 4))
    ax.errorbar(g.loss_target_pct, g.tp / 1000, yerr=g.sd.fillna(0) / 1000, fmt="o-", capsize=3,
                label="measured (mean ± sd)", color="#2c7fb8")
    rtt = float(np.nanmedian(g.rtt)) / 1000.0
    if rtt <= 0 or np.isnan(rtt):
        rtt = 0.02
    p = np.linspace(max(g.loss_target_pct.min(), 0.5), max(g.loss_target_pct.max(), 10.0), 100)
    mathis = MSS_BYTES * 8 / rtt * 1.22 / np.sqrt(p / 100) / 1e6
    ax.plot(p, mathis, "--", color="#d0021b", label="Mathis model: 1.22·MSS/(RTT·√p)")
    ax.set_xlabel("packet-loss rate (%)")
    ax.set_ylabel("throughput (Mbps)")
    ax.set_title("Packet Loss vs. Throughput (Mathis Validation)", fontweight="bold")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def loss_vs_retransmissions(df, path):
    """Plot packet loss rate vs. retransmissions (Review 2 requirement)."""
    d = df[(df.impairment == "random_loss") & df.loss_target_pct.notna()]
    if d.empty:
        d = df[df.loss_est_pct.notna() & (df.loss_est_pct > 0)].assign(
            loss_target_pct=lambda x: x.loss_est_pct.round()
        )
    if d.empty or "retrans_delta" not in d:
        return
    g = d.groupby("loss_target_pct").agg(
        retx=("retrans_delta", "sum"),
        retx_mean=("retrans_delta", "mean")
    ).reset_index()
    fig, ax = plt.subplots(figsize=(6.5, 4))
    ax.plot(g.loss_target_pct, g.retx, "s-", color="#e6550d", lw=2, markersize=6, label="Total Retransmissions")
    ax.set_xlabel("Packet Loss Rate (%)")
    ax.set_ylabel("Total Retransmitted Segments")
    ax.set_title("Packet Loss vs. Retransmissions", fontweight="bold")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def loss_vs_rtt(df, path):
    """Plot packet loss rate vs. RTT (Review 2 requirement)."""
    d = df[(df.impairment == "random_loss") & df.loss_target_pct.notna()]
    if d.empty:
        d = df[df.loss_est_pct.notna() & (df.loss_est_pct > 0)].assign(
            loss_target_pct=lambda x: x.loss_est_pct.round()
        )
    if d.empty:
        return
    rtt_col = "krtt_ms" if "krtt_ms" in d and d["krtt_ms"].notna().any() else "app_rtt_ms"
    g = d.groupby("loss_target_pct").agg(
        rtt_mean=(rtt_col, "mean"),
        rtt_p95=(rtt_col, lambda s: s.quantile(0.95))
    ).reset_index()
    fig, ax = plt.subplots(figsize=(6.5, 4))
    ax.plot(g.loss_target_pct, g.rtt_mean, "o-", color="#31a354", lw=2, label="Mean RTT (ms)")
    ax.plot(g.loss_target_pct, g.rtt_p95, "--", color="#74c476", label="95th %ile RTT (ms)")
    ax.set_xlabel("Packet Loss Rate (%)")
    ax.set_ylabel("Round-Trip Time (ms)")
    ax.set_title("Packet Loss vs. Round-Trip Time (RTT)", fontweight="bold")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def cause_plots(d, path):
    scens = scen_order(d.scenario.unique())
    frac = d.groupby(["scenario", "likely_cause"]).size().unstack(fill_value=0)
    frac = frac.reindex(columns=CLASSES, fill_value=0).reindex(scens, fill_value=0)
    total = frac.sum(axis=1).replace(0, 1)
    frac = frac.div(total, axis=0) * 100
    fig, ax = plt.subplots(1, 2, figsize=(12, 4.2), gridspec_kw={"width_ratios": [1, 1.25]})
    bottom = np.zeros(len(frac))
    for c in CLASSES:
        ax[0].bar(frac.index, frac[c], bottom=bottom, color=CAUSE_COLOR[c], label=c)
        bottom += frac[c].to_numpy()
    ax[0].set_ylabel("% of 0.5 s windows")
    ax[0].tick_params(axis="x", rotation=40)
    ax[0].legend(fontsize=7, loc="lower right")
    ax[0].set_title("Detected cause per scenario", fontweight="bold")
    for i, s in enumerate(scens):
        x = d[d.scenario == s].sort_values("t_s")
        t = x.t_s.to_numpy()
        for tt, c in zip(t, x.likely_cause):
            ax[1].barh(i, 0.5, left=tt - 0.5, color=CAUSE_COLOR.get(c, "#999999"), height=0.8, lw=0)
    ax[1].set_yticks(range(len(scens)))
    ax[1].set_yticklabels(scens)
    ax[1].invert_yaxis()
    ax[1].set_xlabel("time (s)")
    ax[1].set_title("Timeline of detected causes", fontweight="bold")
    ax[1].grid(False)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def confusion_plot(metrics, path):
    labels, cm = metrics["labels"], np.array(metrics["confusion_matrix"])
    fig, ax = plt.subplots(figsize=(5.2, 4.4))
    ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=30, ha="right")
    ax.set_yticks(range(len(labels)))
    ax.set_yticklabels(labels)
    ax.grid(False)
    for i in range(len(labels)):
        for j in range(len(labels)):
            ax.text(j, i, cm[i, j], ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() / 2 else "black")
    ax.set_xlabel("predicted")
    ax.set_ylabel("true (injected impairment)")
    ax.set_title(f"Random Forest, {metrics['cv']}\naccuracy {metrics['cv_accuracy']:.1%}", fontsize=9)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def importance_plot(metrics, path):
    items = list(metrics["feature_importance"].items())[::-1]
    fig, ax = plt.subplots(figsize=(5.2, 3.8))
    ax.barh([k for k, _ in items], [v for _, v in items], color="#2c7fb8")
    ax.set_xlabel("importance")
    ax.set_title("Random Forest feature importance", fontsize=9)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def error_report(d):
    e = d[d.error_detected].copy()
    out = pd.DataFrame({
        "scenario": e.scenario,
        "time_s": e.t_s,
        "loss_pct": e.loss_est_pct.round(2) if "loss_est_pct" in e else 0,
        "rtt_ms": e.rtt_ms.round(1) if "rtt_ms" in e else 0,
        "throughput_kbps": e.throughput_kbps.round(0) if "throughput_kbps" in e else 0,
        "retransmits": e.retrans_delta.astype(int) if "retrans_delta" in e else 0,
        "symptom": e.symptom,
        "likely_cause": e.likely_cause,
        "cause_detail": e.cause_detail,
        "evidence": e.evidence if "evidence" in e else "",
        "recommended_action": e.recommended_action if "recommended_action" in e else "",
        "tcp_response": e.tcp_response
    })
    if "rf_cause" in e:
        out["rf_cause"] = e.rf_cause
        out["rf_confidence"] = e.rf_confidence.round(2)
        out["models_agree"] = e.models_agree
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", default="outputs", help="folder containing client_*.csv")
    ap.add_argument("--out", default=None, help="figure/table folder (default <input>/figures)")
    ap.add_argument("--model", default=None, help="optional Random Forest bundle (joblib)")
    ap.add_argument("--metrics", default=None, help="optional rf_metrics.json to plot confusion matrix")
    ap.add_argument("--sqlite", default=None, help="optional SQLite database output path (e.g. outputs/experiments.db)")
    a = ap.parse_args(argv)
    out = Path(a.out or Path(a.input) / "figures")
    out.mkdir(parents=True, exist_ok=True)

    df = load_logs(str(Path(a.input) / "client_*.csv"))
    df = df.sort_values(["source", "t_s"]).reset_index(drop=True)
    if a.model:
        import joblib
        d = predict(joblib.load(a.model), df)
    else:
        d = rule_based(df)

    grid_plot(df, [("throughput_kbps", "throughput (ACKed)", dict(color="#2c7fb8")),
                   ("goodput_kbps", "goodput (server)", dict(color="#fd8d3c", lw=0.8, ls="--"))],
              "kbps", "TCP throughput over time", out / "throughput_vs_time.png")
    grid_plot(df, [("krtt_ms", "kernel RTT", dict(color="#31a354")),
                   ("app_rtt_ms", "app ping RTT", dict(color="#a1d99b", lw=0.8))],
              "ms", "Round-trip time over time", out / "rtt_vs_time.png")
    grid_plot(df, [("cwnd", "cwnd", dict(color="#756bb1")),
                   ("ssthresh", "ssthresh", dict(color="#bcbddc", lw=0.8, ls=":"))],
              "segments", "Congestion window over time", out / "cwnd_vs_time.png")
    grid_plot(df, [("delivery_kbps", "kernel delivery rate", dict(color="#c51b8a")),
                   ("goodput_kbps", "goodput (server)", dict(color="#fd8d3c", lw=0.9))],
              "kbps", "Delivery rate vs. goodput", out / "delivery_vs_time.png")
    grid_plot(df, [("retrans_delta", "retransmits / 0.5s", dict(color="#e6550d"))],
              "segments", "Retransmissions over time", out / "retrans_vs_time.png")

    dynamic_timeline(df, out / "dynamic_timeline.png")
    s = summary_table(df)
    s.to_csv(out / "summary.csv")
    summary_plot(s, out / "summary.png")
    throughput_vs_loss(df, out / "throughput_vs_loss.png")
    loss_vs_retransmissions(df, out / "loss_vs_retrans.png")
    loss_vs_rtt(df, out / "loss_vs_rtt.png")
    cause_plots(d, out / "error_causes.png")
    rep = error_report(d)
    rep.to_csv(out / "error_report.csv", index=False)

    if a.sqlite:
        sqlite_path = Path(a.sqlite)
        save_rows_to_sqlite(str(sqlite_path), df.to_dict(orient="records"), source_file="client_logs")
        print(f"[sqlite] saved {len(df)} measurements to {sqlite_path}")

    if a.metrics:
        import json
        m = json.load(open(a.metrics))
        confusion_plot(m, out / "confusion_matrix.png")
        importance_plot(m, out / "feature_importance.png")

    print(s.to_string())
    print(f"\n{len(rep)} of {len(d)} windows flagged as errors:")
    print(d[d.error_detected].groupby(["likely_cause", "symptom"]).size().to_string())
    print(f"\nfigures + tables -> {out}/")


if __name__ == "__main__":
    main()
