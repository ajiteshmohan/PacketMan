#!/usr/bin/env python3
"""Interactive Web Dashboard for TCP Wi-Fi Performance Analysis.

Run with:
    python -m streamlit run dashboard.py
"""
import glob
import os
import socket
import sys
import tempfile
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import streamlit as st

import analyze
import classifier
import scenarios
import schema
import simulate
from wifi_stats import RssiReader

st.set_page_config(
    page_title="TCP Wi-Fi Loss Analysis",
    page_icon="📡",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling
st.markdown("""
<style>
    .main-header { font-size: 26px; font-weight: bold; color: #1E3A8A; margin-bottom: 2px; }
    .sub-header { font-size: 15px; color: #4B5563; margin-bottom: 20px; }
    .card { background-color: #F8FAFC; border-radius: 8px; padding: 15px; border-left: 4px solid #3B82F6; margin-bottom: 15px; }
    .metric-value { font-size: 22px; font-weight: bold; color: #1E3A8A; }
</style>
""", unsafe_allow_html=True)


def check_system():
    wifi_rssi = RssiReader().read()
    return {
        "platform": sys.platform,
        "python": sys.version.split()[0],
        "tcp_info_available": sys.platform.startswith("linux"),
        "wifi_rssi": f"{wifi_rssi:.1f} dBm" if wifi_rssi is not None else "Unavailable (Wired / VM)",
    }


# Sidebar
st.sidebar.title("📡 TCP Wi-Fi Analyzer")
st.sidebar.markdown("**Educational Networks Project**")
menu = st.sidebar.radio("Navigation", [
    "🏠 Project Overview",
    "🧪 Run Experiment",
    "📈 Performance Analytics",
    "🤖 AI Error Classification",
    "🗄️ SQLite Database Browser"
])

st.sidebar.markdown("---")
sys_info = check_system()
st.sidebar.markdown(f"**OS:** `{sys_info['platform']}`")
st.sidebar.markdown(f"**Python:** `{sys_info['python']}`")
st.sidebar.markdown(f"**Wi-Fi RSSI:** `{sys_info['wifi_rssi']}`")
st.sidebar.caption("Bassil H · Ajitesh Mohan N · Abijith V K")

# -------------------------------------------------------------------------------------------------
# PAGE 1: Overview
# -------------------------------------------------------------------------------------------------
if menu == "🏠 Project Overview":
    st.markdown('<div class="main-header">Performance Analysis of TCP under Dynamic Wi-Fi Packet Loss</div>', unsafe_allow_html=True)
    st.markdown('<div class="sub-header">A Network Simulation and Monitoring Framework for Educational Networks</div>', unsafe_allow_html=True)

    col1, col2 = st.columns([2, 1])
    with col1:
        st.markdown("""
        ### Problem Statement
        In educational Wi-Fi environments (lecture halls, labs, campuses), wireless packet drops frequently occur due to:
        * **Electromagnetic interference** (crowded 2.4 GHz spectrum, Bluetooth, microwaves).
        * **Distance & signal attenuation** (weak RSSI < -75 dBm).
        * **AP roaming / handoffs & deep fades** (link interruption).

        Standard TCP treats **all packet loss as network congestion**, causing drastic window reductions (`cwnd` collapse) and performance degradation even when network bandwidth is completely free.

        ### Key Project Capabilities
        1. **Multi-Scenario Experimentation:** Baseline (0%), Low (1%), Moderate (5%), High (10%), and Dynamic loss transitions (1% → 5% → 10% → 5% → 1%).
        2. **Multi-Layer Telemetry:** Kernel RTT vs App Ping RTT, Goodput vs Throughput, cwnd, ssthresh, and retransmission counters.
        3. **Mathis Model Validation:** Theoretical verification of throughput degradation:
           $$Throughput \\le \\frac{1.22 \\times MSS}{RTT \\times \\sqrt{p}}$$
        4. **AI & Rule-Based Error Classification:** Distinguishes wireless packet drops from queue congestion and outage stalls, with actionable remediation recommendations.
        """)

    with col2:
        st.markdown("### Team Members")
        st.info("""
        * **Bassil H** (24BCE0904)
        * **Ajitesh Mohan N** (24BCE0887)
        * **Abijith V K** (24BKT0070)
        """)
        st.markdown("### System Readiness")
        st.write(f"✅ **Platform:** `{sys_info['platform']}`")
        st.write(f"✅ **Wi-Fi Monitoring:** `{sys_info['wifi_rssi']}`")
        if sys_info['tcp_info_available']:
            st.success("Kernel TCP_INFO: Fully supported (Linux)")
        else:
            st.warning("Kernel TCP_INFO: Linux/WSL2 only (Using App-level metrics on Windows)")

# -------------------------------------------------------------------------------------------------
# PAGE 2: Run Experiment
# -------------------------------------------------------------------------------------------------
elif menu == "🧪 Run Experiment":
    st.title("🧪 Experiment Execution Center")
    st.markdown("Execute controlled TCP experiments under dynamic loss conditions.")

    tab1, tab2 = st.tabs(["⚡ Fast Simulation Mode", "🌐 Local Loopback TCP Session"])

    with tab1:
        st.subheader("Generate Multi-Scenario Simulation Dataset")
        sim_scenarios = st.multiselect(
            "Select Scenarios",
            list(scenarios.SCENARIOS.keys()),
            default=["baseline", "loss1", "loss5", "loss10", "dynamic", "congestion", "blackout"]
        )
        duration = st.slider("Duration per scenario (seconds)", 20, 120, 60, step=10)
        seed = st.number_input("Random Seed", 1, 9999, 42)

        if st.button("🚀 Run Simulation Batch", type="primary"):
            with st.spinner("Generating TCP rounds and kernel states..."):
                out_dir = Path("demo_data")
                out_dir.mkdir(parents=True, exist_ok=True)
                db_path = out_dir / "experiments.db"
                results = []
                for j, s in enumerate(sim_scenarios):
                    df = simulate.simulate_run(s, duration=float(duration), seed=int(seed) * 100 + j)
                    csv_path = out_dir / f"client_{s}_run1_sim.csv"
                    df.to_csv(csv_path, index=False)
                    schema.save_rows_to_sqlite(str(db_path), df.to_dict(orient="records"), source_file=csv_path.name)
                    results.append({
                        "Scenario": s,
                        "Mean Throughput (kbps)": round(df["throughput_kbps"].mean(), 1),
                        "Total Retransmissions": int(df["retrans_delta"].sum()),
                        "Mean RTT (ms)": round(df["krtt_ms"].mean(), 1)
                    })
                st.success(f"Generated {len(sim_scenarios)} scenario runs successfully! Saved to demo_data/ and demo_data/experiments.db")
                st.dataframe(pd.DataFrame(results), use_container_width=True)

    with tab2:
        st.subheader("Run Real TCP Over Localhost (Loopback)")
        st.markdown("Tests the real application wire protocol, sockets, pings, and goodput reporting.")
        col_l1, col_l2 = st.columns(2)
        with col_l1:
            loop_scen = st.selectbox("Scenario", ["baseline", "dynamic", "congestion"], index=0)
            loop_dur = st.number_input("Duration (s)", 5, 60, 10)
        with col_l2:
            loop_rate = st.number_input("Sender Rate Limit (Mbps, 0=unlimited)", 0, 100, 20)

        if st.button("▶️ Execute Real TCP Loopback Transfer"):
            import client
            import server
            import threading
            import time

            with st.spinner("Running client and server TCP sessions..."):
                stop_event = threading.Event()
                ready_event = threading.Event()
                out_dir = Path("outputs")
                out_dir.mkdir(parents=True, exist_ok=True)

                srv_thread = threading.Thread(
                    target=server.serve,
                    args=("127.0.0.1", 0, str(out_dir), 0.5, stop_event, ready_event),
                    daemon=True
                )
                srv_thread.start()
                ready_event.wait(timeout=3.0)
                port = ready_event.port

                rssi = RssiReader()
                class MockArgs:
                    pass
                args = MockArgs()
                args.host = "127.0.0.1"
                args.port = port
                args.duration = float(loop_dur)
                args.chunk = 16384
                args.ping_interval = 0.2
                args.rate_mbps = float(loop_rate)
                args.lowat = 131072
                args.interval = 0.5
                args.iface = None
                args.outdir = str(out_dir)
                args.sqlite = str(out_dir / "experiments.db")

                path, rows = client.run_scenario(args, loop_scen, 1, rssi)
                stop_event.set()
                srv_thread.join(timeout=3.0)

                st.success(f"Loopback TCP session completed! Log saved: {path}")
                st.dataframe(pd.DataFrame(rows).head(10), use_container_width=True)

# -------------------------------------------------------------------------------------------------
# PAGE 3: Performance Analytics
# -------------------------------------------------------------------------------------------------
elif menu == "📈 Performance Analytics":
    st.title("📈 Performance Analytics & Comparative Graphs")

    data_dir = "demo_data" if os.path.exists("demo_data/figures") else "outputs/figures"
    fig_dir = Path(data_dir) / "figures" if "figures" not in data_dir else Path(data_dir)

    # Check for summary
    summary_path = fig_dir / "summary.csv"
    if summary_path.exists():
        st.subheader("Scenario Comparison Summary")
        summary_df = pd.read_csv(summary_path, index_col=0)
        st.dataframe(summary_df, use_container_width=True)

    st.subheader("Generated Visualizations")
    plots = {
        "Throughput vs. Time": fig_dir / "throughput_vs_time.png",
        "Round-Trip Time (RTT)": fig_dir / "rtt_vs_time.png",
        "Congestion Window (cwnd)": fig_dir / "cwnd_vs_time.png",
        "Dynamic Loss Timeline": fig_dir / "dynamic_timeline.png",
        "Mathis Model Validation": fig_dir / "throughput_vs_loss.png",
        "Packet Loss vs Retransmissions": fig_dir / "loss_vs_retrans.png",
        "Packet Loss vs RTT": fig_dir / "loss_vs_rtt.png",
        "Scenario Comparison Bars": fig_dir / "summary.png",
        "Error Cause Breakdown": fig_dir / "error_causes.png",
    }

    selected_plot = st.selectbox("Select Graph to View", list(plots.keys()))
    plot_file = plots[selected_plot]
    if plot_file.exists():
        st.image(str(plot_file), caption=selected_plot, use_container_width=True)
    else:
        st.warning(f"Plot {plot_file.name} not found yet. Run an experiment or demo first!")

# -------------------------------------------------------------------------------------------------
# PAGE 4: AI Classification
# -------------------------------------------------------------------------------------------------
elif menu == "🤖 AI Error Classification":
    st.title("🤖 AI Diagnostic & Error Classification")
    st.markdown("""
    Diagnose network errors at each 0.5-second measurement window using:
    1. **Rule-Based Engine:** Deterministic, explainable heuristics.
    2. **Random Forest Classifier:** 200 trees, 5-fold cross-validation.
    """)

    csv_files = glob.glob("demo_data/client_*.csv") + glob.glob("outputs/client_*.csv")
    if not csv_files:
        st.warning("No client CSV logs found. Please generate or run an experiment first!")
    else:
        selected_csv = st.selectbox("Choose CSV file for diagnosis", csv_files)
        df_raw = pd.read_csv(selected_csv)
        model_path = Path("models/rf.joblib")

        if model_path.exists():
            bundle = joblib.load(str(model_path))
            classified = classifier.predict(bundle, df_raw)
        else:
            classified = classifier.rule_based(df_raw)

        errors = classified[classified["error_detected"]].copy()

        col_m1, col_m2, col_m3 = st.columns(3)
        col_m1.metric("Total Windows", len(classified))
        col_m2.metric("Detected Error Windows", len(errors))
        if "models_agree" in classified:
            col_m3.metric("Rule & ML Agreement", f"{(classified['models_agree'].mean() * 100):.1f}%")

        st.subheader("Diagnostic Breakdown")
        display_cols = [
            "t_s", "scenario", "loss_est_pct", "rtt_ms", "throughput_kbps",
            "symptom", "likely_cause", "cause_detail", "evidence", "recommended_action"
        ]
        if "rf_cause" in errors:
            display_cols += ["rf_cause", "rf_confidence"]

        st.dataframe(errors[[c for c in display_cols if c in errors.columns]], use_container_width=True)

        # Download report
        csv_data = errors.to_csv(index=False).encode('utf-8')
        st.download_button(
            "📥 Download Diagnostic Error Report (CSV)",
            data=csv_data,
            file_name="diagnostic_error_report.csv",
            mime="text/csv"
        )

# -------------------------------------------------------------------------------------------------
# PAGE 5: SQLite Database
# -------------------------------------------------------------------------------------------------
elif menu == "🗄️ SQLite Database Browser":
    st.title("🗄️ SQLite Experiment Database")

    db_paths = [p for p in ["demo_data/experiments.db", "outputs/experiments.db"] if os.path.exists(p)]
    if not db_paths:
        st.warning("No SQLite databases found. Run an experiment or demo with SQLite enabled!")
    else:
        chosen_db = st.selectbox("Select SQLite Database", db_paths)
        df_db = schema.load_from_sqlite(chosen_db)
        st.write(f"Total Records in `{chosen_db}`: **{len(df_db)}**")

        scenario_filter = st.multiselect(
            "Filter by Scenario",
            df_db["scenario"].unique(),
            default=list(df_db["scenario"].unique())
        )
        filtered = df_db[df_db["scenario"].isin(scenario_filter)]
        st.dataframe(filtered, use_container_width=True)

        db_csv = filtered.to_csv(index=False).encode('utf-8')
        st.download_button(
            "📥 Export Filtered Database to CSV",
            data=db_csv,
            file_name="sqlite_export.csv",
            mime="text/csv"
        )
