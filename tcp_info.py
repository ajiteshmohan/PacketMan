"""Best-effort reader for the Linux kernel's TCP_INFO socket option.

Gives the *real* congestion window, ssthresh, kernel RTT, retransmission counters, CA state
and delivery rate of a live connection. Works on Linux and WSL2. On Windows/macOS it returns
None and the client falls back to application-level measurements.
"""
import socket
import struct
import sys

# (name, struct format, byte offset in struct tcp_info)   -- see include/uapi/linux/tcp.h
_FIELDS = [
    ("state", "B", 0), ("ca_state", "B", 1), ("retransmits", "B", 2), ("probes", "B", 3),
    ("backoff", "B", 4), ("options", "B", 5),
    ("rto", "I", 8), ("snd_mss", "I", 16), ("unacked", "I", 24), ("sacked", "I", 28),
    ("lost", "I", 32), ("retrans", "I", 36),
    ("rtt", "I", 68), ("rttvar", "I", 72), ("snd_ssthresh", "I", 76), ("snd_cwnd", "I", 80),
    ("total_retrans", "I", 100), ("pacing_rate", "Q", 104), ("bytes_acked", "Q", 120),
    ("segs_out", "I", 136), ("data_segs_out", "I", 156), ("delivery_rate", "Q", 160),
    ("bytes_sent", "Q", 200), ("bytes_retrans", "Q", 208),
]
_SIZES = {"B": 1, "I": 4, "Q": 8}


def parse_tcp_info(raw: bytes) -> dict:
    """Parse a raw struct tcp_info buffer; fields beyond the kernel's struct size are omitted."""
    out = {}
    for name, fmt, off in _FIELDS:
        if off + _SIZES[fmt] <= len(raw):
            out[name] = struct.unpack_from("=" + fmt, raw, off)[0]
    return out


def read_tcp_info(sock):
    """Return a dict of TCP_INFO fields for `sock`, or None if unsupported."""
    if not sys.platform.startswith("linux"):
        return None
    try:
        raw = sock.getsockopt(socket.IPPROTO_TCP, socket.TCP_INFO, 256)
    except (OSError, AttributeError):
        return None
    return parse_tcp_info(raw)


if __name__ == "__main__":
    # quick self-test on loopback
    srv = socket.socket(); srv.bind(("127.0.0.1", 0)); srv.listen(1)
    cli = socket.create_connection(srv.getsockname()); conn, _ = srv.accept()
    print(read_tcp_info(cli) or "TCP_INFO not available on this platform")
