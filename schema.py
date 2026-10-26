"""Shared CSV and SQLite schema for client logs (real runs and simulated runs use the same columns)."""
import os
import sqlite3

COLUMNS = [
    "t_s",              # seconds since scenario start (end of the sampling window)
    "scenario",         # scenario name
    "run",              # repeat number
    "impairment",       # ground truth when netem is used: none|random_loss|congestion|blackout, else 'ambient'
    "loss_target_pct",  # loss rate injected by netem (blank when ambient)
    "throughput_kbps",  # sender-side: unique bytes ACKed per second (kernel bytes_acked)
    "goodput_kbps",     # receiver-side: bytes the server application actually received
    "delivery_kbps",    # kernel delivery-rate estimate (tcpi_delivery_rate)
    "app_rtt_ms",       # application-level RTT: ping frame -> echo, includes head-of-line blocking
    "krtt_ms",          # kernel smoothed RTT (tcpi_rtt)
    "cwnd",             # congestion window in segments (tcpi_snd_cwnd)
    "ssthresh",         # slow-start threshold in segments (blank = still 'infinite')
    "ca_state",         # 0 Open, 1 Disorder, 2 CWR, 3 Recovery, 4 Loss
    "rto_ms",           # retransmission timeout (tcpi_rto)
    "rto_backoff",      # exponential RTO back-off counter (tcpi_backoff)
    "retrans_delta",    # segments retransmitted during the window
    "total_retrans",    # cumulative retransmitted segments
    "loss_est_pct",     # 100 * retransmitted segments / data segments sent in window
    "rssi_dbm",         # Wi-Fi signal strength if readable (blank otherwise)
]

CA_STATES = {0: "Open", 1: "Disorder", 2: "CWR", 3: "Recovery", 4: "Loss"}


def init_sqlite_db(db_path: str, table_name: str = "measurements"):
    """Initialize an SQLite database with the standard schema."""
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        cols_def = ["id INTEGER PRIMARY KEY AUTOINCREMENT"]
        for c in COLUMNS:
            if c in ("run", "ca_state", "rto_backoff", "retrans_delta", "total_retrans"):
                cols_def.append(f"{c} INTEGER")
            elif c in ("scenario", "impairment"):
                cols_def.append(f"{c} TEXT")
            else:
                cols_def.append(f"{c} REAL")
        cols_def.append("source_file TEXT")
        conn.execute(f"CREATE TABLE IF NOT EXISTS {table_name} ({', '.join(cols_def)})")
        conn.commit()
    finally:
        conn.close()


def save_rows_to_sqlite(db_path: str, rows: list, source_file: str = "", table_name: str = "measurements"):
    """Save a list of row dicts into an SQLite database (pure Python stdlib)."""
    if not rows:
        return
    init_sqlite_db(db_path, table_name)
    conn = sqlite3.connect(db_path)
    try:
        fields = COLUMNS + ["source_file"]
        placeholders = ", ".join(["?"] * len(fields))
        sql = f"INSERT INTO {table_name} ({', '.join(fields)}) VALUES ({placeholders})"
        data = []
        for r in rows:
            record = []
            for c in COLUMNS:
                v = r.get(c)
                if v == "" or v is None:
                    record.append(None)
                else:
                    try:
                        record.append(float(v) if isinstance(v, (int, float, str)) and c not in ("scenario", "impairment") else v)
                    except ValueError:
                        record.append(v)
            record.append(source_file)
            data.append(record)
        conn.executemany(sql, data)
        conn.commit()
    finally:
        conn.close()


def load_from_sqlite(db_path: str, table_name: str = "measurements", scenario: str = None):
    """Load measurement rows from an SQLite database into a pandas DataFrame."""
    try:
        import pandas as pd
    except ImportError:
        raise ImportError("Reading SQLite into a DataFrame requires pandas. Please install pandas: pip install pandas")
    conn = sqlite3.connect(db_path)
    try:
        query = f"SELECT * FROM {table_name}"
        params = []
        if scenario:
            query += " WHERE scenario = ?"
            params.append(scenario)
        query += " ORDER BY t_s"
        df = pd.read_sql_query(query, conn, params=params)
        return df
    finally:
        conn.close()
