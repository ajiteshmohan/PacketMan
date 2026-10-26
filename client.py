#!/usr/bin/env python3
"""PC-2 (client): sends bulk TCP data to the server, times its own ping RTT, polls the kernel
TCP_INFO every 0.5 s and logs one CSV per scenario run. Optionally shapes loss with tc/netem.

Ambient Wi-Fi only (no shaping):
    python client.py --host 192.168.1.10 --scenarios baseline --duration 60

Controlled, dynamic loss (Linux/WSL2, needs root + tc):
    sudo python3 client.py --host 192.168.1.10 --iface wlan0 --scenarios dynamic --duration 100
"""
import argparse
import atexit
import csv
import json
import math
import socket
import struct
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

import framing as fr
import netem
from schema import COLUMNS, save_rows_to_sqlite
from scenarios import SCENARIOS, phase_index_at, phase_schedule
from tcp_info import read_tcp_info
from wifi_stats import RssiReader

NAN = float("nan")


def fmt(x, nd=3):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return ""
    return round(x, nd) if isinstance(x, float) else x


class Flow:
    """One TCP connection: sender thread (bulk), pinger thread, receiver thread (echo + reports)."""

    def __init__(self, host, port, chunk=16384, ping_interval=0.2, rate_mbps=0.0, lowat=131072):
        self.sock = socket.create_connection((host, port), timeout=10)
        self.sock.settimeout(None)
        self.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        if lowat:  # keep pings from queueing behind megabytes of unsent bulk data
            try:
                self.sock.setsockopt(socket.IPPROTO_TCP, getattr(socket, "TCP_NOTSENT_LOWAT", 25), lowat)
            except OSError:
                pass
        self.data_frame = fr.pack(fr.DATA, b"\x00" * chunk)
        self.chunk = chunk
        self.ping_interval = ping_interval
        self.rate_mbps = rate_mbps
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.rtts, self.rtt_lock = [], threading.Lock()
        self.goodput_kbps = NAN
        self.app_bytes = 0
        self.threads = []

    def send(self, frame: bytes):
        with self.lock:
            self.sock.sendall(frame)

    def _sender(self):
        gap = self.chunk * 8 / (self.rate_mbps * 1e6) if self.rate_mbps > 0 else 0.0
        nxt = time.monotonic()
        while not self.stop.is_set():
            try:
                self.send(self.data_frame)
            except OSError:
                return
            self.app_bytes += self.chunk
            if gap:
                nxt += gap
                delay = nxt - time.monotonic()
                if delay > 0:
                    time.sleep(delay)
                elif delay < -1.0:      # don't try to "catch up" after a long stall
                    nxt = time.monotonic()

    def _pinger(self):
        seq = 0
        while not self.stop.wait(self.ping_interval):
            try:
                with self.lock:          # timestamp is taken when the ping is actually written
                    ts = time.perf_counter_ns()
                    self.sock.sendall(fr.pack(fr.PING, struct.pack("!QQ", seq, ts)))
            except OSError:
                return
            seq += 1

    def _receiver(self):
        reader = fr.FrameReader(self.sock)
        while True:
            try:
                frame = reader.read(None)
                if frame is None:
                    continue
                ftype, payload = frame
                if ftype == fr.PING:
                    _, ts = struct.unpack("!QQ", payload)
                    with self.rtt_lock:
                        self.rtts.append((time.perf_counter_ns() - ts) / 1e6)
                elif ftype == fr.REPORT:
                    self.goodput_kbps = json.loads(payload.decode())["goodput_kbps"]
            except (ConnectionError, OSError, ValueError):
                return

    def start(self):
        for fn in (self._sender, self._pinger, self._receiver):
            t = threading.Thread(target=fn, daemon=True)
            t.start()
            self.threads.append(t)

    def drain_rtts(self):
        with self.rtt_lock:
            vals, self.rtts = self.rtts, []
        return sum(vals) / len(vals) if vals else NAN

    def finish(self):
        self.stop.set()
        for t in self.threads[:2]:
            t.join(timeout=3)
        try:
            self.send(fr.pack(fr.END))
            time.sleep(0.3)
        except OSError:
            pass
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.sock.close()


def run_scenario(a, name, run_idx, rssi):
    sched = phase_schedule(name, a.duration)
    flow = Flow(a.host, a.port, a.chunk, a.ping_interval, a.rate_mbps, a.lowat)
    flow.send(fr.pack_json(fr.START, {"scenario": name, "run": run_idx, "duration": a.duration}))
    outdir = Path(a.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    path = outdir / f"client_{name}_run{run_idx}_{datetime.now():%Y%m%d_%H%M%S}.csv"
    rows = []
    cur = -1
    prev = read_tcp_info(flow.sock) or {}
    prev_app, k = 0, 1
    t0 = time.monotonic()
    prev_t = t0
    flow.start()
    try:
        with open(path, "w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=COLUMNS, lineterminator="\n")
            w.writeheader()
            while True:
                now = time.monotonic() - t0
                if now >= a.duration:
                    break
                idx = phase_index_at(sched, now)
                if idx != cur:
                    cur = idx
                    if a.iface:
                        netem.apply(a.iface, sched[cur][2])
                        print(f"  [{now:5.1f}s] phase {sched[cur][2].kind:11s} loss={sched[cur][2].loss_pct:g}%")
                next_sample = k * a.interval
                boundary = sched[cur][1] if cur < len(sched) - 1 else a.duration
                wake = min(next_sample, boundary)
                time.sleep(max(0.0, wake - (time.monotonic() - t0)))
                if (time.monotonic() - t0) < next_sample - 1e-3:
                    continue
                k += 1
                tnow = time.monotonic()
                dt = max(tnow - prev_t, 1e-6)
                info = read_tcp_info(flow.sock)
                ph = sched[phase_index_at(sched, max(0.0, tnow - t0 - a.interval / 2))][2]
                row = dict.fromkeys(COLUMNS)
                row.update(
                    t_s=fmt(tnow - t0),
                    scenario=name,
                    run=run_idx,
                    impairment=ph.kind if a.iface else "ambient",
                    loss_target_pct=fmt(float(ph.loss_pct)) if a.iface else "",
                    goodput_kbps=fmt(flow.goodput_kbps),
                    app_rtt_ms=fmt(flow.drain_rtts()),
                    rssi_dbm=fmt(rssi.read())
                )
                if info and "bytes_acked" in info and "bytes_acked" in prev:
                    tp = (info["bytes_acked"] - prev["bytes_acked"]) * 8 / 1000 / dt
                else:
                    tp = (flow.app_bytes - prev_app) * 8 / 1000 / dt
                row["throughput_kbps"] = fmt(tp)
                if info:
                    d_retx = info.get("total_retrans", 0) - prev.get("total_retrans", info.get("total_retrans", 0))
                    seg_key = "data_segs_out" if "data_segs_out" in info else "segs_out"
                    d_segs = info.get(seg_key, 0) - prev.get(seg_key, 0) if prev else 0
                    row.update(
                        delivery_kbps=fmt(info.get("delivery_rate", 0) * 8 / 1000.0),
                        krtt_ms=fmt(info.get("rtt", 0) / 1000.0),
                        cwnd=info.get("snd_cwnd"),
                        ssthresh=info["snd_ssthresh"] if info.get("snd_ssthresh", 0) < 1_000_000 else "",
                        ca_state=info.get("ca_state"),
                        rto_ms=fmt(info.get("rto", 0) / 1000.0),
                        rto_backoff=info.get("backoff"),
                        retrans_delta=d_retx,
                        total_retrans=info.get("total_retrans"),
                        loss_est_pct=fmt(100.0 * d_retx / d_segs) if d_segs > 0 else ""
                    )
                w.writerow(row)
                fh.flush()
                rows.append(row)
                if info:
                    prev = info
                prev_app, prev_t = flow.app_bytes, tnow
    finally:
        if a.iface:
            netem.clear(a.iface)
        flow.finish()

    if getattr(a, "sqlite", None):
        save_rows_to_sqlite(a.sqlite, rows, source_file=path.name)

    return path, rows


def summarize(name, rows):
    def vals(key):
        return [float(r[key]) for r in rows if r.get(key) not in (None, "")]
    tp = vals("throughput_kbps")
    rtt = vals("krtt_ms") or vals("app_rtt_ms")
    retx = vals("retrans_delta")
    mean = lambda v: sum(v) / len(v) if v else NAN
    print(f"  -> {name}: mean throughput {mean(tp):.0f} kbps | mean RTT {mean(rtt):.1f} ms | "
          f"retransmissions {sum(retx):.0f}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", required=True, help="server IP")
    ap.add_argument("--port", type=int, default=5201)
    ap.add_argument("--scenarios", default="baseline,loss1,loss5,loss10,dynamic",
                    help=f"comma list from: {', '.join(SCENARIOS)}")
    ap.add_argument("--duration", type=float, default=60.0, help="seconds per scenario run")
    ap.add_argument("--repeats", type=int, default=1)
    ap.add_argument("--iface", default=None, help="interface for tc/netem shaping (omit = ambient loss only)")
    ap.add_argument("--rate-mbps", type=float, default=0.0,
                    help="cap the sender (0 = as fast as possible). ~50-70%% of Wi-Fi capacity gives cleaner results")
    ap.add_argument("--interval", type=float, default=0.5)
    ap.add_argument("--ping-interval", type=float, default=0.2)
    ap.add_argument("--chunk", type=int, default=16384)
    ap.add_argument("--lowat", type=int, default=131072, help="TCP_NOTSENT_LOWAT bytes (0 = off)")
    ap.add_argument("--cooldown", type=float, default=3.0)
    ap.add_argument("--outdir", default="outputs")
    ap.add_argument("--sqlite", default=None, help="optional SQLite database output path (e.g. outputs/experiments.db)")
    a = ap.parse_args(argv)

    names = [s.strip() for s in a.scenarios.split(",") if s.strip()]
    bad = [n for n in names if n not in SCENARIOS]
    if bad:
        ap.error(f"unknown scenario(s): {bad}")
    if a.iface:
        if not netem.available():
            ap.error("--iface needs Linux with the `tc` command (sudo apt install iproute2)")
        atexit.register(netem.clear, a.iface)
    with socket.socket() as probe:
        no_info = read_tcp_info(probe) is None
    if no_info:
        print("note: TCP_INFO unavailable here (not Linux/WSL2) - cwnd/retransmissions will be blank.")

    rssi = RssiReader()
    for r in range(1, a.repeats + 1):
        for n in names:
            print(f"[client] scenario={n} run={r}/{a.repeats} duration={a.duration:g}s "
                  f"{'netem on ' + a.iface if a.iface else '(ambient loss)'}")
            try:
                path, rows = run_scenario(a, n, r, rssi)
                summarize(n, rows)
                print(f"  log: {path}")
            except (ConnectionRefusedError, socket.timeout) as e:
                print(f"  [ERROR] Connection failed to {a.host}:{a.port}: {e}")
                print("          Please ensure server.py is running on PC-1 and the firewall allows port 5201.")
                sys.exit(1)
            time.sleep(a.cooldown)


if __name__ == "__main__":
    main()
