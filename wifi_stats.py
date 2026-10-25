"""Optional Wi-Fi signal-strength (RSSI) reader.

RSSI lets the classifier separate *weak signal* from *interference*: both look like random
loss to TCP, but weak signal comes with a low RSSI. Returns None when it cannot be read
(e.g. WSL2, wired link), in which case the classifier reports 'interference_or_weak_signal'.
"""
import re
import subprocess
import sys
import time


class RssiReader:
    def __init__(self, min_interval: float = 2.0):
        self.min_interval = min_interval
        self._last_t = -1e9
        self._value = None

    def read(self):
        now = time.monotonic()
        if now - self._last_t >= self.min_interval:
            self._value = self._probe()
            self._last_t = now
        return self._value

    @staticmethod
    def _probe():
        try:
            if sys.platform.startswith("linux"):
                with open("/proc/net/wireless") as fh:
                    for line in fh.read().splitlines()[2:]:
                        parts = line.split()
                        if len(parts) >= 4:
                            v = float(parts[3].rstrip("."))
                            return v - 256 if v > 0 else v
            elif sys.platform == "win32":
                out = subprocess.run(["netsh", "wlan", "show", "interfaces"],
                                     capture_output=True, text=True, timeout=3).stdout
                m = re.search(r"Signal\s*:\s*(\d+)\s*%", out)
                if m:  # common approximation: dBm = quality/2 - 100
                    return int(m.group(1)) / 2.0 - 100.0
        except Exception:
            pass
        return None
