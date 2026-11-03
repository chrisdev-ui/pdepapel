#!/bin/zsh
# Layer 2 launchd entry point. By hand: pdepapel-store/scripts/monitoring/run-daily.sh [--no-notify]
set -u
SCRIPT_DIR=${0:A:h}
STORE_DIR=${SCRIPT_DIR:h:h}
NODE=${MONITOREO_NODE:-$HOME/.nvm/versions/node/v24.15.0/bin/node}
export PATH="${NODE:h}:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
cd "$STORE_DIR" || exit 2
echo "=== monitoreo diario $(date '+%Y-%m-%d %H:%M:%S %Z')"
# A stale copy still runs the daily check (it only reads the public store), but the result says so.
CHECKOUT_WARNING=$("$NODE" scripts/monitoring/checkout-guard.mjs --daily)
[[ -n "$CHECKOUT_WARNING" ]] && echo "AVISO: $CHECKOUT_WARNING"
MONITOREO_CHECKOUT_WARNING="$CHECKOUT_WARNING" "$NODE" scripts/monitoring/daily-check.mjs "$@"
code=$?
echo "=== fin (código $code)"
exit $code
