#!/usr/bin/env python3
"""PC-1 (server): accepts client sessions, measures real goodput, echoes ping frames,
and writes one CSV per session.

    python server.py --host 0.0.0.0 --port 5201 --outdir outputs
"""
import argparse
import csv
import json
import os
import socket
import threading
import time
from datetime import datetime

import framing as fr

SERVER_COLUMNS = ["t_s", "scenario", "run", "bytes", "goodput_kbps", "pings_echoed"]


def handle_client(conn, addr, outdir, interval, log=print):
    conn.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    reader = fr.FrameReader(conn)
    meta, fh, writer = {}, None, None
    t0 = last = next_report = None
    win_bytes = win_pings = total_bytes = 0
    try:
        while True:
            frame = reader.read(timeout=0.1)
            now = time.monotonic()
            if frame is not None:
                ftype, payload = frame
                if ftype == fr.DATA:
                    win_bytes += len(payload)
                    total_bytes += len(payload)
                elif ftype == fr.PING:
                    fr.send_frame(conn, fr.PING, payload)  # echo unchanged
                    win_pings += 1
                elif ftype == fr.START:
                    meta = json.loads(payload.decode() or "{}")
                    os.makedirs(outdir, exist_ok=True)
                    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    name = f"server_{meta.get('scenario', 'session')}_run{meta.get('run', 0)}_{stamp}.csv"
                    fh = open(os.path.join(outdir, name), "w", newline="")
                    writer = csv.writer(fh, lineterminator="\n")
                    writer.writerow(SERVER_COLUMNS)
                    t0 = last = now
                    next_report = now + interval
                    log(f"[server] session from {addr[0]}:{addr[1]}  scenario={meta.get('scenario')} -> {name}")
                elif ftype == fr.END:
                    break
            if t0 is not None and now >= next_report:
                dt = now - last
                gp = win_bytes * 8 / 1000.0 / dt
                writer.writerow([round(now - t0, 3), meta.get("scenario"), meta.get("run"),
                                 win_bytes, round(gp, 3), win_pings])
                fh.flush()
                try:
                    conn.sendall(fr.pack_json(fr.REPORT, {"goodput_kbps": gp, "t": now - t0}))
                except OSError:
                    break
                win_bytes = win_pings = 0
                last = now
                while next_report <= now:
                    next_report += interval
    except (ConnectionError, OSError, ValueError):
        pass
    finally:
        if t0 is not None:
            elapsed = max(time.monotonic() - t0, 1e-9)
            log(f"[server] done: {total_bytes / 1e6:.2f} MB in {elapsed:.1f}s "
                f"(avg goodput {total_bytes * 8 / 1000 / elapsed:.0f} kbps)")
        if fh:
            fh.close()
        conn.close()


def serve(host, port, outdir, interval=0.5, stop_event=None, ready_event=None, log=print):
    stop_event = stop_event or threading.Event()
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((host, port))
    srv.listen(8)
    srv.settimeout(0.5)
    log(f"[server] listening on {host}:{srv.getsockname()[1]}  (logs -> {outdir}/)")
    if ready_event:
        ready_event.port = srv.getsockname()[1]
        ready_event.set()
    threads = []
    try:
        while not stop_event.is_set():
            try:
                conn, addr = srv.accept()
            except socket.timeout:
                continue
            t = threading.Thread(target=handle_client, args=(conn, addr, outdir, interval, log), daemon=True)
            t.start()
            threads.append(t)
    finally:
        srv.close()
        for t in threads:
            t.join(timeout=2)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=5201)
    ap.add_argument("--outdir", default="outputs")
    ap.add_argument("--interval", type=float, default=0.5, help="reporting window in seconds")
    a = ap.parse_args(argv)
    try:
        serve(a.host, a.port, a.outdir, a.interval)
    except KeyboardInterrupt:
        print("\n[server] stopped")


if __name__ == "__main__":
    main()
