#!/bin/zsh
# Layer 1 launchd entry point: Layer 2 first, then the headless Claude review,
# then the compiler (always, so a partial review still produces a report).
# By hand: pdepapel-store/scripts/monitoring/run-weekly.sh [--opus] [YYYY-MM-DD]
# Sonnet by default (~cheaper); --opus or MONITOREO_MODEL=opus for a deeper review.
set -u
MODEL=${MONITOREO_MODEL:-sonnet}
if [[ "${1:-}" == "--opus" ]]; then
  MODEL=opus
  shift
fi
SCRIPT_DIR=${0:A:h}
STORE_DIR=${SCRIPT_DIR:h:h}
NODE=${MONITOREO_NODE:-$HOME/.nvm/versions/node/v24.15.0/bin/node}
CLAUDE_BIN=${MONITOREO_CLAUDE:-$HOME/.local/bin/claude}
TIMEOUT_MIN=${MONITOREO_TIMEOUT_MIN:-90}
export PATH="${NODE:h}:${CLAUDE_BIN:h}:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin"
# The user's shell wraps `claude` to pick a config dir; launchd must use the default one.
unset CLAUDE_CONFIG_DIR

REPO=$(cd "$STORE_DIR" && git rev-parse --path-format=absolute --git-common-dir)
REPO=${REPO:h}
OUT=${MONITOREO_DIR:-$REPO/output/monitoreo}
DATE=${1:-$(TZ=America/Bogota date +%Y-%m-%d)}
mkdir -p "$OUT/logs"
LOG="$OUT/logs/semanal-$DATE.claude.json"
echo "=== monitoreo semanal $DATE $(date '+%H:%M:%S %Z') · repo $REPO"

wait_for_daily_lock() {
  local waited=0
  while [[ -d "$OUT/.lock-diario" && $waited -lt 1200 ]]; do sleep 15; waited=$((waited + 15)); done
}

# 1) Layer 2 for today, unless it already ran (on Tuesdays both jobs fire at 07:17; e2e never runs alongside anything).
wait_for_daily_lock
if [[ ! -f "$OUT/diario/$DATE.json" ]]; then
  "$SCRIPT_DIR/run-daily.sh"
  wait_for_daily_lock
fi

# 2) Chrome must be running with the Claude extension connected; open it in the background if not.
if ! pgrep -x "Google Chrome" >/dev/null; then
  open -g -a "Google Chrome"
  sleep 25
fi

# File writes only under output/monitoreo (drafts); save-raw.mjs validates and scrubs them.
# The output folder must not live under ~/.claude: Claude Code treats that tree as sensitive and denies writes.
ALLOWED=(
  "ToolSearch"
  "Read(/$OUT/**)" "Edit(/$OUT/**)"
  "Bash(node pdepapel-store/scripts/monitoring/save-raw.mjs:*)"
  "Bash(node pdepapel-store/scripts/monitoring/weekly-context.mjs:*)"
  "Bash(node pdepapel-store/scripts/monitoring/psi-run.mjs:*)"
  "Bash(node pdepapel-store/scripts/monitoring/weekly-report.mjs:*)"
  "mcp__claude-in-chrome__tabs_context_mcp" "mcp__claude-in-chrome__tabs_create_mcp" "mcp__claude-in-chrome__tabs_close_mcp"
  "mcp__claude-in-chrome__navigate" "mcp__claude-in-chrome__get_page_text" "mcp__claude-in-chrome__read_page"
  "mcp__claude-in-chrome__find" "mcp__claude-in-chrome__computer"
  "mcp__plugin_vercel_vercel__list_projects" "mcp__plugin_vercel_vercel__get_project"
  "mcp__plugin_vercel_vercel__list_deployments" "mcp__plugin_vercel_vercel__get_deployment"
  "mcp__plugin_vercel_vercel__get_runtime_errors" "mcp__plugin_vercel_vercel__get_runtime_logs"
)
# Reads inside the checkout are implicitly allowed, so env files need explicit denies.
DISALLOWED=(
  "Read(./.env*)" "Read(./**/.env*)" "Grep" "Glob"
  "mcp__claude-in-chrome__javascript_tool" "mcp__claude-in-chrome__form_input"
  "mcp__claude-in-chrome__file_upload" "mcp__claude-in-chrome__upload_image"
  "WebFetch" "WebSearch" "Agent" "NotebookEdit"
)

# 3) The headless review, with a watchdog (macOS has no `timeout`). It runs in the checkout that holds
#    these scripts and the /monitoreo-semanal command; output still lands in the main checkout's output/.
cd "${STORE_DIR:h}" || exit 2
BEFORE=$(git status --porcelain)
"$CLAUDE_BIN" -p "/monitoreo-semanal $DATE" \
  --model "$MODEL" \
  --chrome --no-session-persistence --add-dir "$OUT" \
  --permission-mode dontAsk --permission-prompts none \
  --allowedTools "${ALLOWED[@]}" \
  --disallowedTools "${DISALLOWED[@]}" \
  --max-turns 300 --output-format json \
  --append-system-prompt "You are running unattended from launchd; nobody can answer questions. Follow the hard rules of /monitoreo-semanal literally: read-only, own tabs only, no personal data, never guess numbers. If a tool is denied, record the source as failed and continue." \
  > "$LOG" 2> "$OUT/logs/semanal-$DATE.claude.err" &
CLAUDE_PID=$!
( sleep $((TIMEOUT_MIN * 60)); kill -TERM $CLAUDE_PID 2>/dev/null ) &
WATCHDOG=$!
wait $CLAUDE_PID
CLAUDE_CODE=$?
kill $WATCHDOG 2>/dev/null
echo "claude terminó con código $CLAUDE_CODE (log $LOG)"

# Tripwire: output/ is gitignored, so any change in git status means the review touched the code.
AFTER=$(git status --porcelain)
if [[ "$AFTER" != "$BEFORE" ]]; then
  echo "ALERTA: el checkout cambió durante la revisión semanal:"
  diff <(echo "$BEFORE") <(echo "$AFTER")
  osascript -e 'display notification "La revisión semanal cambió archivos del repositorio. Revisa git status." with title "P de Papel · monitoreo"' 2>/dev/null
fi

# 4) Compile from whatever was collected. If Claude already compiled and notified, recompiling is idempotent; only notify here when it did not.
cd "$STORE_DIR" || exit 2
RUN_STATS=$("$NODE" -e 'try { const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log([d.total_cost_usd ?? "-", Math.round((d.duration_ms ?? 0) / 60000), d.num_turns ?? "-"].join(" ")); } catch { console.log("- - -"); }' "$LOG")
read -r RUN_COST RUN_MINUTES RUN_TURNS <<< "$RUN_STATS"
RUN_ARGS=(--run-model "$MODEL" --run-cost "$RUN_COST" --run-minutes "$RUN_MINUTES" --run-turns "$RUN_TURNS" --run-exit "$CLAUDE_CODE")
if [[ -f "$OUT/$DATE.md" && $CLAUDE_CODE -eq 0 ]]; then
  "$NODE" scripts/monitoring/weekly-report.mjs --date "$DATE" --no-notify "${RUN_ARGS[@]}"
else
  "$NODE" scripts/monitoring/weekly-report.mjs --date "$DATE" "${RUN_ARGS[@]}"
fi
echo "=== fin $(date '+%H:%M:%S %Z')"
