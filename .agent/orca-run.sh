#!/usr/bin/env bash
# Robust wrapper: restore the Brave window (917) then run an orca computer command.
set -u
ORCA_CMD="${ORCA_CMD:-orca}"
WIN="917"
# First ensure window is on-screen & focused
"$ORCA_CMD" computer get-app-state --app com.brave.Browser --window-id "$WIN" --restore-window --no-screenshot --json >/dev/null 2>&1 || true
sleep 0.4
exec "$ORCA_CMD" computer "$@"