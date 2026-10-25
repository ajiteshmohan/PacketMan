"""Shared CSV schema for client logs (real runs and simulated runs use the same columns)."""

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
