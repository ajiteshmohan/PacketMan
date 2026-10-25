#!/usr/bin/env python3
"""Model-based TCP simulator that writes the SAME CSV schema as client.py.

IMPORTANT: output of this file is *simulated*, not measured. It exists so that the analysis,
error-detection and classification pipeline can be developed, demonstrated and unit-tested
without a Wi-Fi testbed. Use client.py/server.py for real measurements.

Model: one round per RTT of a SACK-capable Reno-style sender.
  * clean round ........ slow start (cwnd doubles) or congestion avoidance (+1 segment)
  * losses, >=3 delivered  fast retransmit / fast recovery: ssthresh=cwnd/2, cwnd=ssthresh
  * losses, <3 delivered   retransmission timeout: cwnd=1, RTO back-off doubles each failure
  * queue: rate-limited bottleneck with a drop-tail buffer -> RTT inflation and overflow loss
  * application rate limit (like client.py --rate-mbps), cwnd only grows when cwnd-limited

    python simulate.py --outdir demo_data --duration 100 --seed 1
"""
import argparse
import math
from pathlib import Path

import numpy as np
import pandas as pd

from scenarios import SCENARIOS, phase_index_at, phase_schedule
from schema import COLUMNS

MSS = 1448


def simulate_run(scenario, run=1, duration=60.0, seed=0, link_mbps=20.0, base_rtt_ms=20.0,
                 buffer_pkts=60, app_rate_mbps=8.0, interval=0.5) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    sched = phase_schedule(scenario, duration)
    app_pps = app_rate_mbps * 1e6 / 8 / MSS
    n_win = int(round(duration / interval))
    acc = [dict(bytes=0.0, retx=0, segs=0, rtts=[], app=[], rates=[]) for _ in range(n_win)]
    snaps = [None] * n_win

    t, cwnd, ssthresh = 0.0, 10.0, 1e9
    srtt, rttvar = base_rtt_ms / 1000, base_rtt_ms / 2000
    backoff, ca, total_retx = 0, 0, 0
    next_b, bi = interval, 0

    while t < duration and bi < n_win:
        ph = sched[phase_index_at(sched, t)][2]
        cap_pps = (ph.rate_mbit or link_mbps) * 1e6 / 8 / MSS
        base = (base_rtt_ms + ph.delay_ms) / 1000
        buf = ph.limit_pkts or buffer_pkts
        bdp = cap_pps * base
        w_app = max(1, int(round(app_pps * max(base, srtt))))
        w = max(1, min(int(cwnd), w_app))
        cwnd_limited = int(cwnd) <= w_app

        over = max(0, w - int(bdp + buf))                       # tail drops at the bottleneck
        queue = min(max(0.0, w - bdp), buf)
        rtt = base * (1 + abs(rng.normal(0, 0.06))) + queue / cap_pps
        p = ph.loss_pct / 100
        n_rand = (w - over) if p >= 1 else (int(rng.binomial(w - over, p)) if p > 0 else 0)
        lost = min(w, over + n_rand)
        delivered = w - lost

        if lost == 0:
            dt, nbytes, segs, retx, apprtt = rtt, w * MSS, w, 0, rtt
            ca, backoff = 0, 0
            srtt = 0.875 * srtt + 0.125 * rtt                    # Karn: only clean samples
            rttvar = 0.75 * rttvar + 0.25 * abs(srtt - rtt)
            if cwnd_limited:
                cwnd = min(cwnd * 2, ssthresh) if cwnd < ssthresh else cwnd + 1
        elif delivered >= 3 and p < 1:                           # fast retransmit + recovery
            dt, nbytes, segs, retx, apprtt = 2 * rtt, w * MSS, w + lost, lost, 2 * rtt
            ssthresh = max(cwnd / 2, 2.0)
            cwnd, ca, backoff = ssthresh, 3, 0
        else:                                                    # retransmission timeout
            rto = min(max(0.2, srtt + 4 * rttvar) * 2 ** backoff, 60.0)
            dt, nbytes, segs, retx = rto, delivered * MSS, w + lost, lost
            apprtt = math.nan if delivered == 0 else rto
            ssthresh = max(cwnd / 2, 2.0)
            cwnd, ca = 1.0, 4
            backoff = min(backoff + 1, 8)

        te = t + dt
        total_retx += retx
        if te < duration:
            a = acc[min(int(te / interval), n_win - 1)]
            a["bytes"] += nbytes
            a["retx"] += retx
            a["segs"] += segs
            a["rtts"].append(rtt * 1000)
            if not math.isnan(apprtt):
                a["app"].append(apprtt * 1000)
            a["rates"].append(nbytes * 8 / dt / 1000)
        state = dict(cwnd=cwnd, ssthresh=ssthresh, ca=ca, backoff=backoff, srtt=srtt,
                     rto=max(0.2, srtt + 4 * rttvar) * 2 ** backoff * 1000, total=total_retx)
        while next_b <= te and bi < n_win:
            snaps[bi] = state
            bi += 1
            next_b += interval
        t = te

    rows, prev_tp = [], 0.0
    for i in range(n_win):
        a, s = acc[i], snaps[i] or snaps[max(i - 1, 0)]
        tp = a["bytes"] * 8 / 1000 / interval
        mid = max(0.0, (i + 0.5) * interval)
        ph = sched[phase_index_at(sched, mid)][2]
        rows.append(dict(
            t_s=round((i + 1) * interval, 3), scenario=scenario, run=run, impairment=ph.kind,
            loss_target_pct=ph.loss_pct, throughput_kbps=round(tp, 3),
            goodput_kbps=round(0.8 * tp + 0.2 * prev_tp, 3),
            delivery_kbps=round(max(a["rates"]), 3) if a["rates"] else 0.0,
            app_rtt_ms=round(float(np.mean(a["app"])), 3) if a["app"] else math.nan,
            krtt_ms=round(s["srtt"] * 1000, 3), cwnd=int(s["cwnd"]),
            ssthresh=int(s["ssthresh"]) if s["ssthresh"] < 1e6 else math.nan,
            ca_state=s["ca"], rto_ms=round(s["rto"], 1), rto_backoff=s["backoff"],
            retrans_delta=a["retx"], total_retrans=s["total"],
            loss_est_pct=round(100 * a["retx"] / a["segs"], 3) if a["segs"] else math.nan,
            rssi_dbm=math.nan))
        prev_tp = tp
    return pd.DataFrame(rows, columns=COLUMNS)


def generate_training(n_rows=3000, seed=1, duration=60.0, scenarios=None):
    """Simulated labelled data with randomised link parameters (different 'networks')."""
    scenarios = scenarios or ["baseline", "loss1", "loss5", "loss10", "dynamic", "congestion",
                              "blackout", "mixed"]
    rng = np.random.default_rng(seed)
    frames, total, i = [], 0, 0
    while total < n_rows:
        name = scenarios[i % len(scenarios)]
        s = int(rng.integers(0, 2**31 - 1))
        df = simulate_run(name, run=i // len(scenarios) + 1, duration=duration, seed=s,
                          link_mbps=float(rng.uniform(15, 40)), base_rtt_ms=float(rng.uniform(10, 40)),
                          buffer_pkts=int(rng.integers(40, 100)), app_rate_mbps=float(rng.uniform(5, 10)))
        df["source"] = f"sim_{name}_{s}"
        frames.append(df)
        total += len(df)
        i += 1
    return pd.concat(frames, ignore_index=True).iloc[:n_rows]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--outdir", default="demo_data")
    ap.add_argument("--scenarios", default="baseline,loss1,loss5,loss10,dynamic,congestion,blackout")
    ap.add_argument("--duration", type=float, default=100.0)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args(argv)
    out = Path(a.outdir)
    out.mkdir(parents=True, exist_ok=True)
    for j, name in enumerate(a.scenarios.split(",")):
        df = simulate_run(name, duration=a.duration, seed=a.seed * 1000 + j)
        path = out / f"client_{name}_run1_sim.csv"
        df.to_csv(path, index=False, lineterminator="\n")
        print(f"{name:11s} mean throughput {df.throughput_kbps.mean():9.0f} kbps  "
              f"retrans {int(df.retrans_delta.sum()):5d}  -> {path}")


if __name__ == "__main__":
    main()
