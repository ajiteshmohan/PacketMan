# Performance Analysis of TCP under Dynamic Wi-Fi Packet Loss in Educational Networks

A Network Simulation, Monitoring, and Machine-Learning Diagnostic Framework for TCP Performance under Dynamic Wireless Conditions.

*Computer Networks Project: Bassil H (24BCE0904) · Ajitesh Mohan N (24BCE0887) · Abijith V K (24BKT0070)*

---

## 1. Overview & Problem Statement

In educational institutions (classrooms, lecture halls, computer labs, and campus Wi-Fi), wireless networks experience dynamically changing packet loss due to:
* **Co-channel RF interference** (Bluetooth, microwave appliances, congested 2.4 GHz channels).
* **Signal attenuation and distance** (weak RSSI < -75 dBm through campus walls).
* **Mobility and handoffs** (roaming between wireless Access Points or brief deep fades).

Because TCP was originally designed for wired links, it assumes **all packet loss indicates buffer overflow and network congestion**. As a result, TCP cuts its congestion window (`cwnd`) in half or resets it to 1, triggering drastic throughput collapse even when network bandwidth is completely available.

This project implements an end-to-end framework to:
1. Conduct real TCP sessions over Wi-Fi, localhost loopback, or high-fidelity simulated environments.
2. Inject controlled, dynamic packet-loss schedules using Linux `tc netem`.
3. Capture fine-grained telemetry at 0.5s intervals directly from the OS kernel (`TCP_INFO`) and application ping probes.
4. Detect errors, identify root causes, extract supporting evidence, and provide actionable remediation advice using a **Rule-Based Diagnostic Engine** and a **Random Forest ML Classifier** (200 trees, 5-fold cross-validation).
5. Validate degradation trends against the theoretical **Mathis throughput equation**:
   $$Throughput \le \frac{1.22 \times MSS}{RTT \times \sqrt{p}}$$
6. Persist results in both **CSV** and **SQLite** databases for longitudinal analysis.
7. Provide a lightweight, interactive **Streamlit Dashboard** for live visualization.

---

## 2. Technology Stack & Architecture

```
[ Client Device (PC-2) ]                          [ Server Device (PC-1) ]
  ├── client.py (Sender Thread)  ───(TCP / D)───>    ├── server.py (Receiver Thread)
  ├── client.py (Pinger Thread)  ───(TCP / P)───>    │     ├── Measures Goodput
  │                               <──(TCP / P)───    │     └── Echoes Pings
  ├── client.py (Stats Thread)   <──(TCP / R)───    │     └── Writes server_*.csv
  │     ├── Polls TCP_INFO (Kernel)                  └── Listens on Port 5201
  │     ├── Polls Wi-Fi RSSI (netsh/wireless)
  │     └── Drives tc/netem Loss Schedules
  └── Writes client_*.csv & SQLite DB
            │
            ├──> classifier.py (Rule Heuristics & Random Forest Diagnosis)
            ├──> analyze.py (Mathis Validation, Performance Curves & Reports)
            └──> dashboard.py (Streamlit Interactive Web UI)
```

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Networking** | Python 3 Sockets, `struct`, `select` | Custom binary length-prefixed protocol (`framing.py`) |
| **Traffic Control** | Linux `tc netem` | Controlled dynamic packet loss, latency jitter, bottleneck rate |
| **Telemetry** | Linux `TCP_INFO` & Windows `netsh` | Kernel `cwnd`, `ssthresh`, `krtt`, `ca_state`, Wi-Fi RSSI |
| **Machine Learning** | `scikit-learn`, `joblib` | Random Forest Classifier (200 estimators, max depth 15) |
| **Data & Storage** | `pandas`, `sqlite3` | Unified 19-column CSV schema and SQLite database |
| **Visualizations** | `matplotlib`, `Streamlit` | Multi-panel performance plots, confusion matrices, timelines |

---

## 3. Supported Scenarios

| Scenario | Loss Schedule | Description / Academic Purpose |
| :--- | :--- | :--- |
| **`baseline`** | 0% loss | Healthy baseline: measures maximum attainable Wi-Fi capacity. |
| **`loss1`** | 1% constant loss | **Low Loss**: Tests minor Wi-Fi channel impairments and initial TCP window throttling. |
| **`loss5`** | 5% constant loss | **Moderate Loss**: Demonstrates frequent Fast Retransmit / Fast Recovery cycles. |
| **`loss10`** | 10% constant loss | **High Loss**: Severe degradation triggering Retransmission Timeouts (RTO) and cwnd resets. |
| **`dynamic`** | 1% → 5% → 10% → 5% → 1% | **Review 1 Dynamic Schedule**: Evaluates real-time degradation and subsequent recovery. |
| **`dynamic2`** | 1% → 5% → 10% → 2% | **Review 2 Dynamic Schedule**: Asymmetric recovery pattern. |
| **`congestion`** | 20 ms delay + 3 Mbps limit | Bottleneck queue buildup: RTT inflates $\ge 2\times$ before drop-tail loss occurs. |
| **`blackout`** | 100% loss (few seconds) | Total outage: models Access Point roaming handoff or severe deep fade. |
| **`mixed`** | All impairments combined | Comprehensive sequence for training the Random Forest model. |

---

## 4. Telemetry & Metrics Schema

Measurements are sampled in 0.5-second windows and stored using the standard schema in `schema.py`:

| Column | Metric | Source | Platform Support |
| :--- | :--- | :--- | :--- |
| `t_s` | Elapsed time (seconds) | Application timer | All |
| `scenario` | Active scenario name | Experiment configuration | All |
| `throughput_kbps` | Unique data ACKed per second | Kernel `bytes_acked` (or socket bytes sent) | All |
| `goodput_kbps` | Effective payload received | Server application `server.py` | All |
| `delivery_kbps` | Kernel delivery rate estimate | Kernel `tcpi_delivery_rate` | Linux / WSL2 |
| `app_rtt_ms` | Round-Trip Time with Head-of-Line delay | Application timestamped ping frame echo | All |
| `krtt_ms` | Smoothed RTT without app queue delay | Kernel `tcpi_rtt` | Linux / WSL2 |
| `cwnd` | Congestion Window (segments) | Kernel `tcpi_snd_cwnd` | Linux / WSL2 |
| `ssthresh` | Slow-Start Threshold (segments) | Kernel `tcpi_snd_ssthresh` | Linux / WSL2 |
| `ca_state` | Congestion Avoidance state machine | Kernel `tcpi_ca_state` (0:Open, 3:Recovery, 4:Loss) | Linux / WSL2 |
| `rto_ms`, `rto_backoff`| Retransmission timeout and exponential backoff | Kernel `tcpi_rto`, `tcpi_backoff` | Linux / WSL2 |
| `retrans_delta` | Retransmissions in current window | Kernel `tcpi_total_retrans` delta | Linux / WSL2 (Simulated in demo) |
| `loss_est_pct` | Measured loss rate percentage | Retransmissions / Segments sent | Linux / WSL2 (Simulated in demo) |
| `rssi_dbm` | Wi-Fi Signal Strength (dBm) | Windows `netsh wlan` or Linux `/proc/net/wireless` | All physical Wi-Fi links |

---

## 5. Diagnostic & AI Classification Engine

The system analyzes each 0.5s measurement window and maps network symptoms to root causes and remedial actions:

| Likely Cause | Key TCP Signature | Distinguishing Logic | Recommended Action |
| :--- | :--- | :--- | :--- |
| **`wireless_loss`** | Retransmissions > 0, **flat RTT** ($\approx$ baseline) | Distinguishes from congestion because buffer queue does not build up. | Move closer to AP; switch to 5 GHz / 6 GHz band to eliminate RF interference. |
| **`congestion`** | RTT inflates $\ge 2\times$ baseline, tail-drop loss | Buffer queue builds up before packets drop. | Enable Active Queue Management (CoDel/FQ-CoDel) on router; rate-limit flow. |
| **`link_interruption`**| Throughput drops to $\le 2\%$ peak, RTO back-off | Complete link stall during roaming or obstacle fade. | Verify AP handoff thresholds; eliminate physical line-of-sight obstructions. |
| **`normal`** | High throughput, stable RTT, 0 retransmissions | Operating within link capacity. | Maintain current operational parameters. |

---

## 6. Installation & Quick Start

### Prerequisites
* Python 3.10 to 3.14
* Windows, Linux, or macOS

### Setup
```bash
# 1. Clone repository
git clone https://github.com/vkabijitho7/network_project.git
cd network_project

# 2. Install dependencies
pip install -r requirements.txt
```

---

## 7. Execution Modes

### Mode A: Automated PowerShell Master Runner (Windows)
```powershell
# Run the complete test suite (31 tests)
.\run.ps1 test

# Run the complete demonstration pipeline (Simulation + ML + Graphs + SQLite)
.\run.ps1 demo

# Run real TCP communication over localhost loopback
.\run.ps1 loopback

# Launch the interactive Streamlit Web Dashboard
.\run.ps1 dashboard
```

### Mode B: Command-Line Manual Commands

#### 1. Simulated Demo (No physical testbed needed)
```bash
# Generate simulated traffic across scenarios
python simulate.py --outdir demo_data --duration 100 --sqlite demo_data/experiments.db

# Train Random Forest model
python classifier.py train --synthetic --model models/rf.joblib --metrics models/rf_metrics.json

# Analyze results and plot all graphs
python analyze.py --input demo_data --out demo_data/figures --model models/rf.joblib --metrics models/rf_metrics.json --sqlite demo_data/experiments.db
```

#### 2. Localhost Real TCP Session (1 Machine)
```bash
# Terminal 1: Start receiver server
python server.py --host 127.0.0.1 --port 5201 --outdir outputs

# Terminal 2: Run client transfer
python client.py --host 127.0.0.1 --scenarios baseline,dynamic --duration 20 --rate-mbps 20 --sqlite outputs/experiments.db

# Generate plots from the recorded run
python analyze.py --input outputs --out outputs/figures --sqlite outputs/experiments.db
```

#### 3. Real 2-PC Wi-Fi Lab Experiment (Between Two Laptops)
1. Connect both laptops to the same Wi-Fi router. Note PC-1's IP (`ipconfig` on Windows, e.g., `192.168.1.50`).
2. **PC-1 (Server):**
   ```bash
   python server.py --host 0.0.0.0 --port 5201 --outdir outputs
   ```
3. **PC-2 (Client):**
   ```bash
   python client.py --host 192.168.1.50 --scenarios baseline,loss1,loss5,loss10,dynamic --duration 60 --rate-mbps 10 --sqlite outputs/experiments.db
   ```
4. *(Optional — Linux/WSL2 with root)*: Inject controlled dynamic loss using `tc netem`:
   ```bash
   sudo python3 client.py --host 192.168.1.50 --iface wlan0 --scenarios dynamic --duration 100 --rate-mbps 10
   ```
5. **Generate Final Reports:**
   ```bash
   python analyze.py --input outputs --out outputs/figures --sqlite outputs/experiments.db
   ```

#### 4. Launch Interactive Web Dashboard
```bash
python -m streamlit run dashboard.py
```

---

## 8. Generated Artifacts & Visualizations

Running `analyze.py` or `run.ps1 demo` automatically generates:

* 📊 **`throughput_vs_time.png`**: Sender ACKed throughput vs server goodput over time across scenarios.
* ⏱️ **`rtt_vs_time.png`**: Kernel smoothed RTT vs application ping RTT.
* 📦 **`cwnd_vs_time.png`**: Congestion window (`cwnd`) collapse and slow-start threshold (`ssthresh`) evolution.
* 📈 **`dynamic_timeline.png`**: 5-panel synchronized timeline across dynamic loss transitions showing cwnd halving and retransmission bursts.
* 📉 **`throughput_vs_loss.png`**: Measured throughput compared with the theoretical **Mathis model** curve.
* 🔁 **`loss_vs_retrans.png`**: Relationship between injected loss percentage and total retransmitted packets.
* 🌐 **`loss_vs_rtt.png`**: Mean and 95th-percentile RTT under increasing loss.
* 📊 **`summary.png`**: Comparative bar charts across all tested scenarios.
* 🥧 **`error_causes.png`**: Distribution and timeline of detected error causes.
* 🎯 **`confusion_matrix.png` & `feature_importance.png`**: Random Forest evaluation metrics and feature weights.
* 📋 **`error_report.csv`**: Detailed diagnosis of every impaired window with symptoms, root causes, evidence, and actions.
* 🗄️ **`summary.csv` & `experiments.db`**: Numerical summaries and queryable SQLite database.

---

## 9. Test Suite Verification

The framework includes a comprehensive test suite in `tests/` covering protocol framing, partial socket reads, telemetry unpacking, scenario scheduling, simulator accuracy, classification logic, SQLite persistence, and real localhost loopback sessions:

```bash
python -m unittest discover -s tests -t . -v
```

**Results:** 31 tests executed, **31 passed**, 0 failed, 0 skipped.

---

## 10. Authors & Academic Credits

* **Bassil H** (24BCE0904)
* **Ajitesh Mohan N** (24BCE0887)
* **Abijith V K** (24BKT0070)

*Computer Networks Lab Project — Performance Analysis of TCP under Dynamic Wi-Fi Packet Loss in Educational Networks.*
*Licensed under the MIT License (see `LICENSE`).*
