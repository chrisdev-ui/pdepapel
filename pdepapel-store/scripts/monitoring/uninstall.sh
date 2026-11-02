#!/bin/zsh
# Removes both launchd agents. Reports, history and logs in output/monitoreo/ are kept.
set -u
UID_NUM=$(id -u)
for label in com.pdepapel.monitoreo-diario com.pdepapel.monitoreo-semanal; do
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null && echo "detenido $label" || echo "$label no estaba cargado"
  plist="$HOME/Library/LaunchAgents/$label.plist"
  if [[ -f "$plist" ]]; then
    mv "$plist" "$plist.removed" && echo "plist movido a $plist.removed"
  fi
done
