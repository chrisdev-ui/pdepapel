#!/bin/zsh
# Installs (or reinstalls) both launchd agents for the checkout this script lives in.
#   pdepapel-store/scripts/monitoring/install.sh [--daily HH:MM] [--weekly D@HH:MM]   (D: 0/7=Sun, 1=Mon, 2=Tue …)
# Defaults: daily 07:17, weekly Tuesday 07:17 (Mac clock, America/Bogota).
# launchd runs a missed StartCalendarInterval once at the next wake; a Mac that was shut down skips it.
set -eu
SCRIPT_DIR=${0:A:h}
DAILY="07:17"
WEEKLY="2@07:17"
while [[ $# -gt 0 ]]; do
  case $1 in
    --daily) DAILY=$2; shift 2 ;;
    --weekly) WEEKLY=$2; shift 2 ;;
    *) echo "argumento desconocido: $1"; exit 2 ;;
  esac
done
[[ $DAILY =~ '^[0-2][0-9]:[0-5][0-9]$' ]] || { echo "--daily HH:MM"; exit 2; }
[[ $WEEKLY =~ '^[0-7]@[0-2][0-9]:[0-5][0-9]$' ]] || { echo "--weekly D@HH:MM"; exit 2; }

REPO=$(cd "$SCRIPT_DIR" && git rev-parse --path-format=absolute --git-common-dir)
REPO=${REPO:h}
if [[ "$SCRIPT_DIR" == *"/.claude/worktrees/"* ]]; then
  echo "Este script está en un worktree. Instala desde el checkout principal para que launchd no dependa de una carpeta temporal."
  exit 2
fi
LOGS="$REPO/output/monitoreo/logs"
mkdir -p "$LOGS" "$HOME/Library/LaunchAgents"
UID_NUM=$(id -u)

write_plist() {
  local label=$1 script=$2 calendar=$3 logname=$4
  local plist="$HOME/Library/LaunchAgents/$label.plist"
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>$script</string></array>
  <key>StartCalendarInterval</key>
  <dict>$calendar</dict>
  <key>StandardOutPath</key><string>$LOGS/$logname.out.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$logname.err.log</string>
  <key>EnvironmentVariables</key>
  <dict><key>HOME</key><string>$HOME</string><key>TZ</key><string>America/Bogota</string></dict>
  <key>ProcessType</key><string>Background</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
PLIST
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_NUM" "$plist"
  echo "instalado $label → $plist"
}

calendar_hm() { echo "<key>Hour</key><integer>$((10#${1%%:*}))</integer><key>Minute</key><integer>$((10#${1##*:}))</integer>"; }

write_plist com.pdepapel.monitoreo-diario "$SCRIPT_DIR/run-daily.sh" "$(calendar_hm $DAILY)" diario
write_plist com.pdepapel.monitoreo-semanal "$SCRIPT_DIR/run-weekly.sh" "<key>Weekday</key><integer>${WEEKLY%%@*}</integer>$(calendar_hm ${WEEKLY##*@})" semanal
echo "Registros: $LOGS"
echo "Probar ya: launchctl kickstart -k gui/$UID_NUM/com.pdepapel.monitoreo-diario"
