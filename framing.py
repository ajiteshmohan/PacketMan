"""Length-prefixed wire protocol shared by server.py and client.py.

Frame layout:  | type (1 byte) | payload length (uint32, big-endian) | payload |

Types
  S  session start   JSON metadata  client -> server
  D  bulk data       filler bytes   client -> server
  P  ping / echo     seq + timestamp client -> server, echoed back unchanged
  R  rate report     JSON goodput    server -> client (every 0.5 s)
  E  end of session  empty           client -> server
"""
import json
import select
import struct
import time

HEADER = struct.Struct("!cI")
START, DATA, PING, REPORT, END = b"S", b"D", b"P", b"R", b"E"
VALID_TYPES = {START, DATA, PING, REPORT, END}
MAX_PAYLOAD = 16 * 1024 * 1024


def pack(ftype: bytes, payload: bytes = b"") -> bytes:
    if ftype not in VALID_TYPES:
        raise ValueError(f"unknown frame type {ftype!r}")
    if len(payload) > MAX_PAYLOAD:
        raise ValueError("payload too large")
    return HEADER.pack(ftype, len(payload)) + payload


def send_frame(sock, ftype: bytes, payload: bytes = b"") -> None:
    sock.sendall(pack(ftype, payload))


def pack_json(ftype: bytes, obj) -> bytes:
    return pack(ftype, json.dumps(obj).encode())


class FrameReader:
    """Incremental frame parser. read(timeout) returns (type, payload) or None on timeout.

    Raises ConnectionError if the peer closes, ValueError on a corrupt header.
    """

    def __init__(self, sock):
        self.sock = sock
        self.buf = bytearray()

    def _try_parse(self):
        if len(self.buf) < HEADER.size:
            return None
        ftype, length = HEADER.unpack_from(self.buf)
        if ftype not in VALID_TYPES or length > MAX_PAYLOAD:
            raise ValueError("corrupt frame header")
        end = HEADER.size + length
        if len(self.buf) < end:
            return None
        payload = bytes(self.buf[HEADER.size:end])
        del self.buf[:end]
        return ftype, payload

    def read(self, timeout=None):
        deadline = None if timeout is None else time.monotonic() + timeout
        while True:
            frame = self._try_parse()
            if frame is not None:
                return frame
            if deadline is not None:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None
                ready, _, _ = select.select([self.sock], [], [], remaining)
                if not ready:
                    return None
            chunk = self.sock.recv(262144)
            if not chunk:
                raise ConnectionError("peer closed connection")
            self.buf.extend(chunk)
