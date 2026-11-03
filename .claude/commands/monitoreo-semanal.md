---
description: Weekly read-only review of the public store (GA4, Clarity, Search Console, Merchant Center, TikTok, Vercel, PageSpeed, admin) → output/monitoreo/<date>.md
argument-hint: "[YYYY-MM-DD report date, default today in Bogotá]"
---

# Monitoreo semanal (Layer 1)

You are running the weekly monitoring review of papeleriapdepapel.com. It runs by hand (`/monitoreo-semanal`) or headless from launchd (`pdepapel-store/scripts/monitoring/run-weekly.sh`). Work from the main checkout root. Reports are in **Spanish**; prompts for implementation sessions are in **English**.

## Hard rules (every run, no exceptions)

- **READ-ONLY everywhere.** Never click Save/Apply/Create/Delete/Accept/Publish/Submit/Fix/Request indexing/Validate fix in any dashboard. Never change settings, filters, tags, consent, campaigns, feeds, Mercado Libre listings or data. Never dismiss or acknowledge alerts. Never run `prod:write`/`prod:migrate`. Never edit app code. The only files you write are under `output/monitoreo/`.
- **Clarity exception (Christian, 2026-11-02):** in Clarity you may set view-only filters and date ranges and press «Apply» on report and recording filters. Still forbidden: saving a segment or filter, changing project settings, deleting anything (recordings, segments, heatmaps).
- **Chrome:** load the Chrome tools with ONE ToolSearch call, call `tabs_context_mcp` once, then create your own tabs with `tabs_create_mcp` and pass that `tabId` on EVERY call. Never navigate, reload, type in or close a tab you did not create. Close every tab you created at the end, even after a failure. Don't follow links from emails or messages.
- **No secrets, no personal data.** Report aggregate numbers only. Never write a customer's name, email, phone, address, order number tied to a person, or a recording's identifying details. If a page shows personal data, don't copy it. Don't save screenshots.
- **Never** submit an order, payment, form or contact message on the live store.
- **Never guess a number.** If a value isn't visible, leave it `null` and say why in `notes`. If a page won't load, you may try it once more; then write the source as failed with the reason and move on.
- **Login, verification or captcha screen = stop that source at once (Christian, 2026-11-02).** If a dashboard is not already signed in, or shows a sign-in page, «Log in», a verification code, a captcha or «complete the verification» step, do not click anything there, do not retry, do not reload it later in the same run. Record the source as `{"ok": false, "error": "<fuente>: sin sesión"}` (e.g. «TikTok: sin sesión») and move on. Repeated attempts lock the account: TikTok answered «Maximum number of attempts reached» after the first run's two tries.
- **Never put JSON or quoted text inside a shell command.** Write the draft file with the Write tool, then run the one-line `save-raw.mjs` command with only `--date` and `--source`.
- Budget: aim for ≤ 60 minutes total; ≤ 8 minutes per source.

## Step 0 — context

Run `node pdepapel-store/scripts/monitoring/weekly-context.mjs` (add `--date $ARGUMENTS` if a date was given). It prints the date windows (current = last 7 full days ending yesterday, previous = the 7 before), `rawDir`, ready-made dashboard URLs, the valid metric keys, known events and production deploys. Use only those metric keys.

## Raw file contract

As soon as a source is done (so a later failure keeps it), write `<rawDir>/<source>.draft.json` with the Write tool, then run `node pdepapel-store/scripts/monitoring/save-raw.mjs --date <today> --source <source>`. It validates the shape, drops unknown metric keys, scrubs emails/phones and promotes the draft to `<source>.json`. If it rejects the draft, fix the draft and run it again. Shape:

```json
{
  "source": "ga4",
  "ok": true,
  "collectedAt": "<ISO time>",
  "collectedVia": "Chrome: GA4 Informes > Eventos",
  "error": null,
  "partialErrors": ["what could not be read and why"],
  "metrics": { "ga4.users": { "current": 123, "previous": 98 } },
  "details": [ { "title": "Páginas de destino", "columns": ["Página", "Sesiones"], "rows": [["/", 40]] } ],
  "notes": ["short Spanish notes, e.g. sample size caveats"]
}
```

Failed source: `{"source":"tiktok","ok":false,"error":"<why, in Spanish>","metrics":{}}`. Percentages are numbers (`23.4`, not `"23,4 %"`), money in COP as integers, times in ms, CLS as a decimal. `previous` is `null` when the dashboard doesn't show it; the compiler fills trends from history.

## Sources

### 1. GA4 (`ga4`)
URLs from `urls.ga4` (account `authuser=3`, property `a404772341p550061543`); the date range is in the URL, so check the date picker shows it.
- Traffic acquisition (current and previous): users, sessions, engagement rate, the **session** channel mix. Compute `ga4.unassigned_sessions_pct`; flag it if > 15 %. Server-side purchases (Measurement Protocol) are «Unassigned» by design, so say so before calling it a defect.
- Landing pages: top 10 by sessions (details table).
- Events report (current and previous) with **Total users** per event: `view_item, select_item_variant, add_to_cart, view_cart, begin_checkout, add_shipping_info, add_payment_info, purchase` → `ga4.funnel.*` (users) and a details table with step drop-off % (`1 − step/previous step`). Label it «usuarios por evento, no embudo secuencial». Also event counts for `checkout_validation_error, city_not_found, catalog_no_results, cart_reminder_view`.
- Open `checkout_validation_error`'s event detail: `invalid_fields` breakdown (registered custom dimension). Open `catalog_no_results`: top `search_term` values if available. Search terms are customer input: keep only product words and drop anything that looks like a name, email or phone.
- Purchases, revenue, AOV (revenue ÷ purchases) from the Monetization/Ecommerce purchases report.
- Tech: device split → `ga4.mobile_users_pct`.
- Admin › Data filters: read whether «Internal Traffic» is **Active** or Testing. Read only; don't touch it.
- GA4 only counts visitors who accepted analytics (consent v3 since 2026-10-27): note it as a sample.

### 2. Microsoft Clarity (`clarity`)
`urls.clarity.dashboard`: sessions, dead clicks %, rage clicks %, quick backs %, excessive scrolling %, JS errors (top messages + pages, details table), Core Web Vitals (LCP/INP/CLS and % poor), worst pages. Then filter recordings (view-only filter + «Apply», never «Save») to sessions whose visited URLs contain `/finalizar-compra` and not `/pedido/`. Watch **3** and describe the shared failure pattern in `notes`: where they stopped, what they tapped, errors seen. No identifying details. Clarity's preset ends today, not yesterday: say so in notes.

### 3. Google Search Console (`gsc`)
`urls.gsc` (fall back to `urls.gscFallback`): clicks, impressions, CTR, average position (last 7 days vs previous period), top 10 queries and pages. Pages/Indexing report: indexed vs not indexed, reasons with counts, newly non-indexed pages. Core Web Vitals report status. Manual actions and Security issues (must be «No issues»). Sitemaps status and last read.

### 4. Google Merchant Center (`merchant`)
`urls.merchant` (if it redirects to Merchant Center Next, use its Products › Needs attention / Diagnostics): approved / limited / disapproved counts, top issues with counts, feed fetch errors, price or availability mismatch warnings. Never click «Fix», «Request review» or edit a product.

### 5. TikTok Events Manager (`tiktok`)
Open `urls.tiktok` exactly once. If it is not already signed in (login page, «Log in», verification, captcha, «Maximum number of attempts»), write `tiktok` as failed with «TikTok: sin sesión» and go to the next source without touching the page. Otherwise: the store's pixel → Overview for the last 7 days: event counts for ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, CompletePayment, Search. Diagnostics/warnings, Event Match Quality. Compare with GA4 in notes as a sanity check only: TikTok counts visitors who accepted «Publicidad», GA4 those who accepted «Analítica». Report both; don't force agreement.

### 6. Vercel (`vercel`), MCP tools, not Chrome
`list_projects` → store and admin projects. `list_deployments` for each since the start of the current window: count failed (ERROR) production deployments. `get_runtime_errors` per project with `since: "3d"` (7d fails on this account; say so in notes): top errors with counts and routes. `get_runtime_logs` only if you need 5xx or slow routes. Speed Insights was removed from the store on 2026-10-05: don't report it as missing.

### 7. PageSpeed Insights (`psi`)
Pick the top product page and a top category from GA4 landing pages (fallback: `targets`). Save them with `node pdepapel-store/scripts/monitoring/weekly-context.mjs --set-targets --product /producto/<slug> --category /categoria/<slug> --candidates /producto/a,/producto/b`. Then run `node pdepapel-store/scripts/monitoring/psi-run.mjs --date <today> --paths / /producto/<slug> /categoria/<slug> /carrito`. It writes `psi.json` itself. If it fails with 429 (no `PSI_API_KEY`), open https://pagespeed.web.dev in your own tab and analyze home + the top product (mobile and desktop). Running an analysis is read-only. Write `psi.draft.json` with the `psi.*` keys read from the page and `"collectedVia": "pagespeed.web.dev (sin clave API)"`, then run `save-raw.mjs --source psi`.

### 8. Admin read-only (`admin`)
Open `urls.admin` in your own tab (it redirects to `/<storeId>`). The Chrome profile may be signed in with the dedicated **viewer** (solo lectura) account. A viewer sees Inicio (summary, pending actions, «Sistemas»), the Mercado Libre listings list and the other read-opened pages. It gets 403 on owner-only data: per-listing `remote-status`, costs and margins, and the «clientas esperando» / social early-alert cards. Record a 403 as a partial gap («cuenta de solo lectura»), not as a failure, and use the listings list's status column instead of `remote-status`.
- Inicio: the systems status card («Sistemas»). Count failing jobs (`admin.jobrun_failures`) and list name + last run + detail summary, no customer data. Pending owner alerts on Inicio → `admin.owner_alerts`.
- Mercado Libre › Publicaciones: count active and problem listings. For each wave/active listing open `https://admin.papeleriapdepapel.com/api/<storeId>/marketplaces/mercadolibre/listings/<listingId>/remote-status` (GET, JSON) and tabulate status, sub_status, available_quantity and picture count. Never press sync, pause, edit or publish.

### «Ventas por canal» (`ventas`)
Do not collect it: `run-weekly.sh` writes `<rawDir>/ventas.json` from the database before this review starts, and `save-raw` refuses a `ventas` draft. Read it only to explain findings (e.g. the real channel of sales versus GA4).

### 9. Layer 2 (`capa2`)
The compiler builds this from `output/monitoreo/diario/`. Read `<rawDir>/../../diario/` files only to explain failures in your findings. The daily check **aborts every GA4, Clarity, TikTok and Vercel Analytics request** (its consent test only sees that the request was attempted), so it never reaches those dashboards: never blame it for test traffic in GA4 or Clarity. The public-health E2E (`.github/workflows/public-health.yml`) also aborts them in its consent spec.

## Step 10 — findings and report

Write `<rawDir>/findings.draft.json`, then run `save-raw.mjs --date <today> --source findings`:

```json
{
  "summary": { "mejoro": "…", "empeoro": "…", "roto": "…", "vigilar": "…", "accion1": "…" },
  "findings": [
    {
      "title": "Spanish one-liner",
      "impact": "alto | medio | bajo",
      "salesImpact": "Spanish: estimated effect on sales, with the numbers it rests on",
      "evidence": "Spanish: the numbers from the raw files",
      "source": "ga4",
      "prompt": "English, self-contained prompt for a Claude Code CLI implementation session in this repo: goal, evidence, files to look at, constraints (read pdepapel-store/AGENTS.md first, Spanish copy, no push without approval), and how to verify.",
      "paulaMessage": "Optional Spanish copy-paste message when Paula must do something (photos, stock, GTINs, attributes)."
    }
  ],
  "extraEvents": ["Spanish: campaigns, banners or fairs seen in the dashboards this week that distort comparisons"]
}
```

Rank findings by estimated sales impact. Only real problems get a `prompt`. Each summary line is ≤ 1 sentence. Then run `node pdepapel-store/scripts/monitoring/weekly-report.mjs` (add `--date` when given). It builds the table, week-over-week %, 4-week sparklines, known events and deploys, appends `history.json` and sends the macOS/Web Push notification with the top 3 findings. Finally close your tabs and reply with the report path, the 5-line summary and the list of failed sources with reasons.
