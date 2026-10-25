"""Thin wrapper around Linux `tc qdisc ... netem` (needs root and the `tc` binary).

Loss is applied to the *egress* of the interface it is attached to, i.e. to the data
direction when attached on the client (sender). ACKs coming back are not impaired.
"""
import os
import shutil
import subprocess
import sys


def build_args(iface: str, phase) -> list:
    """Return the tc argv for a phase (pure function, unit-tested)."""
    args = ["tc", "qdisc", "replace", "dev", iface, "root", "netem"]
    if phase.limit_pkts > 0:
        args += ["limit", str(phase.limit_pkts)]
    if phase.delay_ms > 0:
        args += ["delay", f"{phase.delay_ms}ms"]
        if phase.jitter_ms > 0:
            args.append(f"{phase.jitter_ms}ms")
    if phase.loss_pct > 0:
        args += ["loss", f"{phase.loss_pct:g}%"]
    if phase.rate_mbit > 0:
        args += ["rate", f"{phase.rate_mbit:g}mbit"]
    return args


def _prefix():
    if sys.platform.startswith("linux") and hasattr(os, "geteuid") and os.geteuid() != 0:
        return ["sudo", "-n"]
    return []


def available() -> bool:
    return sys.platform.startswith("linux") and shutil.which("tc") is not None


def apply(iface: str, phase, runner=subprocess.run) -> None:
    runner(_prefix() + build_args(iface, phase), check=True, capture_output=True)


def clear(iface: str, runner=subprocess.run) -> None:
    runner(_prefix() + ["tc", "qdisc", "del", "dev", iface, "root"], check=False, capture_output=True)
