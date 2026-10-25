#!/usr/bin/env bash
# Usage:  ./push_to_github.sh https://github.com/<your-user>/<your-repo>.git
# 1. Create an EMPTY repository on github.com (no README/licence), copy its URL.
# 2. Run this script from the project folder.
set -euo pipefail
[[ $# -ne 1 ]] && { echo "usage: $0 <github-repo-url>"; exit 1; }
git init -b main
git add .
git commit -m "TCP performance under dynamic Wi-Fi packet loss: framework, analysis and report"
git remote add origin "$1"
git push -u origin main
