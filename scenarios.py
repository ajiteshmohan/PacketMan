"""Impairment scenarios.

A scenario is a list of weighted phases; the run duration is split proportionally.
Each phase maps 1:1 to a Linux `tc netem` configuration and doubles as the *ground-truth label*
used to evaluate / train the error classifier.

  none         no impairment
  random_loss  independent random packet loss  (what interference / weak signal look like to TCP)
  congestion   rate-limited bottleneck + small queue + extra delay  (queue build-up and tail drops)
  blackout     100% loss for a few seconds      (what a hand-off / deep fade looks like to TCP)
"""
from dataclasses import dataclass
from typing import List, Optional


@dataclass(frozen=True)
class Phase:
    kind: str = "none"
    loss: float = 0.0        # % random loss
    delay_ms: int = 0
    jitter_ms: int = 0
    rate_mbit: float = 0.0   # 0 = unlimited
    limit_pkts: int = 0      # netem queue limit, 0 = default
    weight: float = 1.0

    @property
    def loss_pct(self) -> float:
        return 100.0 if self.kind == "blackout" else self.loss


def _loss(p, w=1.0):
    return Phase("random_loss", loss=p, weight=w)


NONE = Phase("none")
CONGEST = Phase("congestion", delay_ms=20, rate_mbit=3.0, limit_pkts=30)
BLACKOUT = Phase("blackout")

SCENARIOS = {
    "baseline":   [NONE],
    "loss1":      [_loss(1)],
    "loss5":      [_loss(5)],
    "loss10":     [_loss(10)],
    # Review 1 proposal: 1% -> 5% -> 10% -> 5% -> 1%
    "dynamic":    [_loss(1), _loss(5), _loss(10), _loss(5), _loss(1)],
    # Review 2 proposal: 1% -> 5% -> 10% -> 2%
    "dynamic2":   [_loss(1), _loss(5), _loss(10), _loss(2)],
    "congestion": [Phase("none", weight=2), Phase("congestion", delay_ms=20, rate_mbit=3.0,
                                                  limit_pkts=30, weight=3), Phase("none", weight=2)],
    "blackout":   [Phase("none", weight=3), Phase("blackout", weight=0.5), Phase("none", weight=3),
                   Phase("blackout", weight=0.5), Phase("none", weight=3)],
    # every impairment type in one run - the best scenario for collecting labelled training data
    "mixed":      [Phase("none", weight=1.5), _loss(5, 1.5), Phase("none", weight=1),
                   Phase("congestion", delay_ms=20, rate_mbit=3.0, limit_pkts=30, weight=2),
                   Phase("none", weight=1), Phase("blackout", weight=0.5), Phase("none", weight=1.5),
                   _loss(10, 1.5), Phase("none", weight=1)],
}


def register_custom_scenario(name: str, loss_sequence: List[float], weights: Optional[List[float]] = None):
    """Dynamically register a custom sequence of packet losses."""
    if weights is None:
        weights = [1.0] * len(loss_sequence)
    phases = [Phase("none", weight=w) if l <= 0 else _loss(l, w) for l, w in zip(loss_sequence, weights)]
    SCENARIOS[name] = phases
    return SCENARIOS[name]


def phase_schedule(name: str, duration: float):
    """Return [(start_s, end_s, Phase), ...] covering [0, duration]."""
    if name not in SCENARIOS:
        raise KeyError(f"Scenario {name!r} not found in SCENARIOS ({list(SCENARIOS.keys())})")
    phases = SCENARIOS[name]
    total = sum(p.weight for p in phases)
    out, t = [], 0.0
    for p in phases:
        d = duration * p.weight / total
        out.append((t, t + d, p))
        t += d
    return out


def phase_index_at(schedule, t: float) -> int:
    for i, (_, end, _) in enumerate(schedule):
        if t < end:
            return i
    return len(schedule) - 1
