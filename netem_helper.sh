#!/usr/bin/env bash
# Stand-alone helper for controlled packet loss with Linux tc/netem.
# Run on the SENDER (client) PC. Needs root and the iproute2 package (sudo apt install iproute2).
#
#   ./netem_helper.sh apply    wlan0 5            # 5 % random loss
#   ./netem_helper.sh apply    wlan0 5 40         # 5 % loss + 40 ms extra delay
#   ./netem_helper.sh schedule wlan0 "1:20 5:20 10:20 5:20 1:20"   # loss%:seconds ... (dynamic)
#   ./netem_helper.sh show     wlan0
#   ./netem_helper.sh clear    wlan0              # ALWAYS clear when you are done
set -euo pipefail

cmd="${1:-}"; iface="${2:-}"
[[ -z "$cmd" || -z "$iface" ]] && { sed -n '2,10p' "$0"; exit 1; }
[[ $EUID -ne 0 ]] && { echo "Please run with sudo"; exit 1; }

case "$cmd" in
  apply)
    loss="${3:-0}"; delay="${4:-0}"
    args=(qdisc replace dev "$iface" root netem)
    [[ "$delay" != "0" ]] && args+=(delay "${delay}ms")
    args+=(loss "${loss}%")
    tc "${args[@]}"; echo "applied: loss=${loss}% delay=${delay}ms on $iface" ;;
  schedule)
    trap 'tc qdisc del dev "$iface" root 2>/dev/null || true; echo; echo "cleared"' EXIT INT TERM
    for step in ${3:?need schedule like "1:20 5:20 10:20"}; do
      loss="${step%%:*}"; secs="${step##*:}"
      tc qdisc replace dev "$iface" root netem loss "${loss}%"
      echo "$(date +%T)  loss=${loss}% for ${secs}s"; sleep "$secs"
    done ;;
  show)  tc qdisc show dev "$iface" ;;
  clear) tc qdisc del dev "$iface" root 2>/dev/null && echo "cleared $iface" || echo "nothing to clear" ;;
  *) echo "unknown command: $cmd"; exit 1 ;;
esac
