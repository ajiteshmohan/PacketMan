# TCP Performance under Dynamic Wi-Fi Packet Loss

A two-PC measurement framework that opens a **real TCP session over Wi-Fi**, applies **controlled, changing packet loss**, reads TCP's internal state straight from the Linux kernel, and then **detects, classifies and explains the errors** it sees: with graphs, a CSV error report and an optional Random Forest classifier.

*Computer Networks Lab project: Bassil H · Ajitesh Mohan N · Abijith VK*

![architecture](docs/figures/architecture.png)

## What it measures

| Metric | Source |
|---|---|
| Throughput (unique bytes ACKed) | kernel `tcpi_bytes_acked` |
| Goodput (bytes the receiver app got) | `server.py`, reported back every 0.5 s |
| Round-trip time | kernel `tcpi_rtt` **and** application ping frames (includes head-of-line blocking) |
| Congestion window, ssthresh | kernel `tcpi_snd_cwnd`, `tcpi_snd_ssthresh` |
| Retransmissions, measured loss rate | kernel `tcpi_total_retrans` / `tcpi_data_segs_out` |
| TCP state (Open / Disorder / CWR / Recovery / Loss), RTO back-off | kernel `tcpi_ca_state`, `tcpi_backoff` |
| Delivery rate | kernel `tcpi_delivery_rate` |
| Wi-Fi signal strength (optional) | `/proc/net/wireless` or `netsh wlan` |

## What errors does it detect?

Every 0.5 s window is checked for TCP *symptoms* and mapped to a *likely cause* and the *TCP recovery mechanism* in use.

| Likely cause | TCP signature | Typical real-world reason | TCP's response |
|---|---|---|---|
| `wireless_loss` | retransmissions / RTO, **RTT stays flat** | interference, weak signal (split with RSSI: `< -75 dBm` → weak signal) | fast retransmit + fast recovery, or RTO + slow start |
| `congestion` | RTT ≥ 2× the run minimum (+ retransmissions = tail drop) | queue build-up, buffer overflow, too many users | congestion avoidance, window halving |
| `link_interruption` | throughput ≈ 0, RTO timers backing off | hand-off between APs, deep fade | RTO back-off, slow-start restart |
| `normal` | none of the above | | slow start / congestion avoidance |

**Honest limits:** TCP statistics alone cannot separate *interference from weak signal* (both are random loss) or a *hand-off from a deep fade* (both are an outage). The framework therefore reports `interference_or_weak_signal` unless RSSI is available, and `handoff_or_deep_fade`. A heavily loss-stricken flow can also briefly look like an outage (a long RTO back-off), so a few isolated `link_interruption` windows at 10 % loss are expected.

## Repository layout

```
server.py         PC-1: receives data, echoes pings, measures goodput, logs CSV
client.py         PC-2: sends data + pings, polls TCP_INFO, drives loss schedule, logs CSV
framing.py        length-prefixed protocol (S start / D data / P ping / R report / E end)
tcp_info.py       kernel TCP_INFO reader (Linux / WSL2)
netem.py          tc/netem wrapper;  netem_helper.sh = same thing from the shell
scenarios.py      baseline, loss1/5/10, dynamic (1→5→10→5→1 %), congestion, blackout, mixed
wifi_stats.py     optional RSSI reader
classifier.py     rule engine + Random Forest (200 trees, depth 15, grouped 5-fold CV)
analyze.py        graphs + summary.csv + error_report.csv
simulate.py       model-based generator with the same CSV schema (demo / testing only)
tests/            20 unit + integration tests (incl. real loopback TCP sessions)
examples/         a real measured loopback run
demo_data/        simulated example data + figures        models/  demo Random Forest
docs/             report.pdf and the script that builds it
```

## Quick start

```bash
git clone <your-repo-url> && cd <your-repo>
pip install -r requirements.txt
make test            # 20 tests
make demo            # full pipeline on SIMULATED data, no testbed needed
```

### A. Check your install with real TCP on one machine
```bash
make loopback        # server + client over 127.0.0.1, then graphs in outputs/figures/
```

### B. Real two-PC Wi-Fi experiment
1. Put both PCs on the same Wi-Fi network; note PC-1's IP (`ipconfig` / `ip a`).
2. **PC-1:** `python server.py --host 0.0.0.0 --port 5201` (allow the port in the firewall).
3. **PC-2:** `python client.py --host <PC-1 IP> --scenarios baseline,loss1,loss5,loss10,dynamic --duration 60 --rate-mbps 10`
   *(ambient loss only. On Windows cwnd/retransmits are blank because there is no `TCP_INFO`; use Linux or WSL2 with bridged networking for full data.)*
4. **PC-2:** `python analyze.py --input outputs`  → `outputs/figures/`

`--rate-mbps` caps the sender at roughly 50–70 % of your Wi-Fi capacity. Without it a saturating flow fills the router's buffer and *causes its own* congestion, which is indistinguishable from external congestion.

### C. Controlled, dynamic loss with tc/netem (Linux/WSL2 client, root)
```bash
sudo apt install iproute2
sudo python3 client.py --host <PC-1 IP> --iface wlan0 --scenarios dynamic,congestion,blackout --duration 100 --rate-mbps 10
```
Loss is applied to the client's **egress** (the data direction); ACKs are unaffected. netem is always cleared at the end (`sudo ./netem_helper.sh clear wlan0` if a run is killed).

### D. Train the Random Forest on your own labelled data
With `--iface`, every window is logged with the impairment that was injected (ground truth). Record several `mixed` runs, then:
```bash
sudo python3 client.py --host <PC-1 IP> --iface wlan0 --scenarios mixed --duration 120 --repeats 5
python classifier.py train --data "outputs/client_*.csv" --model models/rf.joblib
python analyze.py --input outputs --model models/rf.joblib --metrics models/rf_metrics.json
```
`models/rf.joblib` shipped here was trained on **simulated** data. Retrain on your own network before trusting its output.

## Output files

`client_<scenario>_run<N>_<time>.csv` columns: `t_s, scenario, run, impairment, loss_target_pct, throughput_kbps, goodput_kbps, delivery_kbps, app_rtt_ms, krtt_ms, cwnd, ssthresh, ca_state, rto_ms, rto_backoff, retrans_delta, total_retrans, loss_est_pct, rssi_dbm`

`analyze.py` writes `throughput_vs_time.png`, `rtt_vs_time.png`, `cwnd_vs_time.png`, `delivery_vs_time.png`, `dynamic_timeline.png`, `summary.png`, `throughput_vs_loss.png` (with the Mathis model), `error_causes.png`, `summary.csv`, `error_report.csv`.

## Validation status (please read)

| Component | Status |
|---|---|
| Server/client TCP path, framing, `TCP_INFO`, CSV logging, analysis | **Tested on real TCP over loopback** (Linux). A 20 Mbps-capped run measured 20,002 kbps at the sender and 19,999 kbps at the server, 0 retransmissions, 0 false alarms. |
| `tc/netem` loss injection | Command construction is unit-tested; **not executed in the authors' build environment** (no `tc`). Test it on your Linux/WSL2 client first with `sudo tc qdisc show dev wlan0` while a run is active. |
| Wi-Fi behaviour | **Not measured here.** Graphs in `demo_data/` come from `simulate.py` (a simplified Reno/SACK round model) and demonstrate the pipeline, not real Wi-Fi. |
| Random Forest accuracy (≈ 97 %) | On **simulated** data, grouped 5-fold CV. It measures how separable the impairments are in the model, not real-world accuracy. |

## Limitations

* Loopback RTT from the kernel is inflated by delayed ACKs when a flow is application-limited; that is why the app-level RTT is logged as well.
* The default congestion control (CUBIC/BBR) differs from the Reno-style behaviour assumed in the Mathis model; BBR in particular reacts much less to random loss.
* The rule thresholds (2× RTT, 2 % stall, −75 dBm) are sensible defaults, not universal constants. Tune them in `classifier.py`.
* Link-layer (802.11) retries hide some loss from TCP and add RTT jitter, which weakens loss-vs-congestion separation on real Wi-Fi.

## Push to GitHub

```bash
./push_to_github.sh https://github.com/<your-user>/<your-repo>.git
```
(create an empty repository on github.com first). GitHub Actions will run the test suite automatically (`.github/workflows/ci.yml`).

## Future scope
Compare TCP variants (`setsockopt TCP_CONGESTION`: cubic vs reno vs bbr) · more clients and access points · live dashboard · classroom-scale trials.

## Licence
MIT, see `LICENSE`.
