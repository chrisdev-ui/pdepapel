# AGENTS.md — pdepapel-store

Instructions for AI coding agents working in this application.

## Project overview

**P de Papel** (`papeleriapdepapel.com`) is a Colombian e-commerce business selling kawaii stationery, gifts and creative supplies. The product is **Spanish-first**: all customer-facing copy, navigation, SEO and route segments are Spanish.

The repository holds **two independent applications**, not an npm workspace. There is no root `package.json`, and every npm command runs from inside one application folder.

| Folder | Role | Dev port | Database | Production domain |
|---|---|---:|---|---|
| `pdepapel-store/` | Public customer-facing storefront | `3000` | **None** | `papeleriapdepapel.com` |
| `pdepapel-admin/` | Admin dashboard **and** the whole REST API, Prisma schema, database owner, webhooks, cron | `3001` | Direct via Prisma/MySQL | `admin.papeleriapdepapel.com` |

This application is the **presentation layer only**. It owns page composition, SEO metadata, ISR and cache tags, checkout UX, customer auth views and the revalidation endpoint.

### The critical architectural rule

**The storefront never talks to MySQL.** It reads and writes only through the admin REST API, through `axios` helpers in `actions/`. `NEXT_PUBLIC_API_URL` already embeds the store id (`https://admin…/api/<storeId>`), so helpers append `/products`, `/checkout` and so on.

**When a dynamic public page fails, suspect the admin API, its server environment, authentication, CORS or the data first — not the storefront UI.**

## Setup and dev environment

Runtime baseline is **Node 24** (`.nvmrc`, `engines`, CI and Vercel all agree). Do not lower it without a reviewed compatibility plan.

```bash
npm install            # from inside pdepapel-store/
npm run dev            # http://localhost:3000
```

Environment is validated at build time by `@t3-oss/env-nextjs` + Zod in `lib/env.mjs`, imported by `next.config.mjs`. A missing mandatory variable **fails the build**.

Code that can reach the browser reads public values from `lib/public-env.ts` (`import { publicEnv as env } from "@/lib/public-env"`), never from `lib/env.mjs`. `public-env.ts` reads each `process.env.NEXT_PUBLIC_*` **literally**, so Next inlines the value at build time; importing `env.mjs` from a client component put Zod and `@t3-oss/env-nextjs` on every page. Validation still happens only in `env.mjs` at build time. `tests/unit/lib/public-env-literals.test.ts` fails if an entry stops being a literal `process.env.<same name>` read (a dynamic `process.env[name]` read is not inlined and arrives empty in the browser, with no error). A new public variable goes in both files.

Baseline variables: Clerk keys and routes, `NEXT_PUBLIC_API_URL` (the admin API), `RESEND_API_KEY`, and the server-side `REVALIDATION_SECRET` that must match the admin's value exactly.

The analytics identifiers `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_CLARITY_PROJECT_ID` and `NEXT_PUBLIC_CLARITY_ENABLED` use `requiredInProduction` (`lib/env-rules.mjs`): optional locally, in CI and in Preview, mandatory when `VERCEL_ENV=production`. They are public identifiers, not secrets, and belong only to this project.

## Build, test, and lint commands

Run everything from `pdepapel-store/`.

```bash
npm run build
npm run lint
npm run type-check     # tsc --noEmit

npm run test:unit      # Vitest
npm run test:coverage  # thresholds enforced in CI
npx vitest run tests/unit/some-file.test.ts     # a single file
npx vitest run -t "name pattern"                # a single test

npm run test:e2e       # Playwright
npx playwright test tests/e2e/some.spec.ts

npm run email:dev      # React Email preview on :3002
```

CI (`.github/workflows/quality.yml`) runs `type-check` and `test:coverage`. `public-health.yml` runs this app's E2E suite against production after each production deploy and weekly.

**Testing rules that matter:**

- `npm run test:e2e` **defaults to production** (`https://papeleriapdepapel.com`) for read-only public checks. Override with `E2E_BASE_URL` for anything else. Pin references with `E2E_CATEGORY_SLUG` / `E2E_ARCHIVED_PRODUCT_SLUG`.
- `npm run test:e2e:local` (`playwright.local.config.ts`) runs against a local admin with a fake Upstash pinned to port 3199 (`LOCAL_FAKE_UPSTASH_PORT`). Local specs import `test` from `tests/e2e/local/helpers/local-test.ts`. Its auto fixture deletes the `orders:*` rate-limit counters before every test, so the run order never trips «Hiciste varios pedidos seguidos». The limit itself is unchanged, and the fake Redis only exists in e2e.
- **Never run a real purchase flow against production.** For purchase E2E use a non-production URL and set `E2E_PURCHASABLE_PRODUCT_SLUG`.
- Playwright has desktop Chrome and Pixel 5 projects. Keep public visual and navigation regressions covered at both, including **no unintended horizontal scroll** on home, shop and category pages.
- For a bug fix, add the regression test that would have failed before the fix.
- Stop local servers when done, and run `git diff --check` before handing work back.
- Do not fix unrelated warnings during focused work; note them instead.
- `npm run test:e2e:local` runs `scripts/ensure-admin-test-db.mjs` first. It waits for the panel's test MySQL, starts it with the admin's `docker-compose.test.yml` plus `db push` if it is down, and always seeds. A run never starts against a dead or empty database.
## Code style and conventions

- **Clipboard (2026-10-25):** copy through `useClipboard().onCopy(text, { success, failure })` or `writeClipboard(text)` from `hooks/use-clipboard.ts`, never `navigator.clipboard` directly. A refused copy shows «No se pudo copiar» (the bank-transfer copy, tracking number and share fallback no longer claim «Copiado» when the browser blocks it). Guard: `tests/unit/clipboard-scan.test.ts`.

- Next.js 14 App Router with heavy **RSC + ISR**, React 18, TypeScript strict, Tailwind 3, Radix + shadcn-style components, react-hook-form + Zod.
- Store-specific stack: TanStack Query, **nuqs** for URL state, Zustand, vaul drawers, `schema-dts` JSON-LD, `app/sitemap.ts` / `app/robots.ts`, per-route `opengraph-image` / `twitter-image`, Vercel Analytics (Speed Insights was removed on 2026-10-05 to cut Vercel spend; do not re-add it without approval).
- `next/image` optimization is **on** here (AVIF/WebP, long-cache headers), unlike the admin.
- Directory shape:

  ```text
  app/
  ├── (routes)/       # public pages: Spanish canonical + English redirect stubs (headless Clerk)
  ├── (cuenta)/       # iniciar-sesion, crear-cuenta, mi-cuenta, mis-pedidos, mis-busquedas (full Clerk)
  └── api/
      ├── revalidate/ # admin cache-refresh callback (shared secret)
      └── send/       # contact/email action
  actions/            # axios calls to the admin API
  components/ hooks/ providers/ constants/ types/ lib/ emails/ tests/
  ```

- Server data plus route-level `loading.tsx` and skeletons is preferred over client-only fetches that leave a blank content area. Product detail is the deliberate exception: it must resolve product existence before streaming so a missing or archived product returns a real HTTP `404`.
- Spanish for all customer-facing copy. English is fine in internal code and identifiers where already conventional.
- Commit messages: Spanish conventional commits (`fix(tienda): …`).

## Critical operational context

Everything in this section is a guardrail. Each one exists because it already went wrong or would be unrecoverable.

### Deployment and Git

- **Never `git push` without explicit user approval.** A push to `main` auto-deploys both Vercel projects, which is a production deployment action. Work local-first, validate, then hand off. Commit and push are separate gates.
- **Deployment budget (2026-10-05, `docs/ops/2026-10-05-vercel-spend-diagnosis.md`).** Every push to `main` builds each project whose folder changed, and build CPU minutes were the largest Vercel cost. Batch commits locally and push **once per work block**; never push a docs-only or ops-only commit on its own unless it is needed now. The Ignored Build Step lives in `ops/vercel-ignore-build.sh` (called by `ignoreCommand` in both `vercel.json`): it skips a build when the project folder changed only in `docs/`, `ops/`, `scripts/`, `tests/`, `e2e/`, `.github/`, `*.md` or `*.log`, and builds on any doubt. Widen that list only with a replay against recent deployments. Build machines are fixed **Standard**; the on-demand budget is $15 with 50/75/100 % alerts. **Never enable Spend Management «Pause production deployments»**: it answers 503 for every project. Verified 2026-10-05: a push touching only this file and `docs/` skipped both builds («Canceled by Ignored Build Step»).
- **Never stage `.env*` files, scratch output, or local agent-instruction files** (`CLAUDE.md`) unless the user explicitly asks. The three `AGENTS.md` files are tracked and are updated in the same commit as the change they describe.
- **Never run `vercel env rm` / `vercel env add` or edit variables in the dashboard without explicit per-variable approval.** `vercel env rm NAME` with no environment argument deletes the variable from **all** environments, and deleted values are unrecoverable, and a deleted analytics or feature key does not fail anything — the feature just goes dark until someone notices. To scope a variable, re-add it for the environment you want; never delete first.
- **Secrets never enter Git, this repository's docs, terminal history, screenshots, email or chat.** Ask in chat before reading a production secret, even read-only. Client-visible `NEXT_PUBLIC_*` values are public by design; **never `NEXT_PUBLIC_`-prefix a secret**.
- **Never run `vercel deploy` (or `vercel`, `vercel --prod`) from the local working tree.** The CLI uploads every file on disk that `.vercelignore` does not exclude, including `.env`, `.env.prod-write` and other untracked secrets (incident 2026-10-06: `docs/ops/2026-10-06-incidente-env-subidos-a-vercel.md`). Deploys go through git only. To force an admin build that the Ignored Build Step would skip, change the one line in `pdepapel-admin/deploy-stamp.txt`, commit and push (with the usual push approval).
- Production environment changes need a new deployment to take effect.
- **Never disable the sandbox, not even for read-only database access** (main agent or sub-agent). This app has no database; production data is read only through the admin's read-only user `pdepapel_ro` with the documented script in `pdepapel-admin/AGENTS.md` («Production database writes»). If it cannot run inside the sandbox, stop and tell Christian.
- `tmp/` and `outputs/` are gitignored scratch. `output/` (singular) is **tracked** and holds deliberate artifacts; do not treat it as disposable.

### Routing and SEO — the part that breaks silently

Spanish route segments are **canonical**. English folders exist **only** as permanent redirects in `next.config.mjs`; they carry SEO equity from a completed ID/English → slug/Spanish migration.

| Canonical | Legacy English |
|---|---|
| `/tienda` | `/shop` |
| `/producto/[slug]` | `/product/[slug]` |
| `/carrito` | `/cart` |
| `/finalizar-compra` | `/checkout` |
| `/favoritos` | `/wishlist` |
| `/pedido/[orderId]` | `/order/[orderId]` |
| `/nosotros` | `/about` |
| `/contacto` | `/contact` |
| `/politicas/*` | `/policies/*` |
| `/politicas/terminos` | `/policies/terms` (2026-10) |
| `/marcas`, `/marcas/[slug]` | — (new in 2026-10; no English predecessor) |

**Brands (`/marcas`, 2026-10).** A product's `brand` is a `PublicBrand | null` object from the admin; the legacy brand text is never read. Two display rules live in `lib/brand-display.ts` (a copy of the admin's `lib/brand-rules.ts`): the store UI shows a brand only when `brand.isPublic` (card line, PDP «Original <Marca> ›», Detalles row, «Más de <Marca>» rail, filters, menu), and a logo only when `logoUrl` is set and `logoPermission` is not `PENDING`/`DENIED` (otherwise the name as text). JSON-LD `brand` and GA4 `item_brand` use the brand even when it is hidden. **Lines** (`brand.parent`, e.g. Flower Power → Primavera, one level): the UI shows the line (card line, PDP pill); JSON-LD `brand` is the top-level brand (`topLevelBrandName` in `lib/brand-display.ts`: `parent.name ?? name`, also for a hidden parent) while GA4 keeps the line; the Detalles row shows «Marca» (parent) + «Línea» only when the parent `isPublic`; a line's page header says «Una línea de <Madre>» and a parent's page lists its lines as chips (`components/brands/brand-lines.tsx`, from `BrandPageData.lines`). `?marca=<parent>` includes the lines' products server-side. `/tienda?marca=<one slug>` with no other parameter has canonical `/marcas/<slug>`; brand pages with fewer than `BRAND_PAGE_INDEX_MIN_PRODUCTS` (3) products are `noindex, follow`, and with none they show the empty state. An old slug answers `permanentRedirect` to the current one; a hidden or archived brand is a `404`. Brand UI is server-rendered (`components/brands/*`, `prefetch={false}`, lazy logos with a fixed box); the `/tienda` chip row is kept in sync with the sidebar by `ShopContent` through `data-brand-chip` attributes, not by new client components. Brand logos are the one exception to «photos only through `CloudinaryImage`»: `BrandLogo` (and the filter row) is a plain server `<img>` with a single URL from `getCloudinaryImageUrl` at the allowed width that covers 2× the box (always `w_128` for boxes ≤ 64 px, so no new derived copies) and a fixed size class (preflight's `height: auto` would otherwise cause CLS). `next/image` there added a client reference plus a `srcset` per logo to every page's HTML, and the menu payload is serialized twice per page (pre-existing). Measured budget: HTML of `/`, `/tienda` and the PDP within +5 % of `main` (`output/audits/marcas-perf/`). Tailwind is 3.3.5: opacity steps like `/15` and `min-h-<spacing>` (`min-h-11`…) don't exist and silently produce no CSS — use `/[0.15]` and `min-h-[2.75rem]` (pre-existing no-op uses are listed in `output/audits/2026-10-17-store-tailwind-noop-classes.md`, local). The menu (drawer and mega menu) lists brands as text links only; logos appear in the chips, the filter, the PDP pill and the brand page.

**Policy pages** (`/politicas/{envios,devoluciones,privacidad,terminos}`) are hard-coded JSX on `components/policy/policy-page.tsx`; `POLICY_LINKS` there drives «Otras políticas», the footer's «Términos Legales» column links all four, and `Store.policies` (admin) only feeds the PDF catalog. Terms and privacy carry the legally required identification of the responsable (Ley 1480 art. 50, Ley 1581): keep it identical on both pages (`tests/components/terms-page.test.tsx` compares them) and never copy it into docs, commits or logs; the admin sensitive-values guard exempts only those two files from the address pattern. Changing either page's text means bumping its `updatedAt` (and the privacy «vigente desde» sentence). **Consent (Ley 1581):** `components/legal/legal-consent.tsx` says «Al finalizar tu compra aceptas los Términos y condiciones y autorizas el tratamiento de tus datos según la Política de privacidad» with both links (new tab, so the form is not lost); it sits right above the checkout pay button (and in the phone's sticky pay bar) and above the gift-card pay button. Sign-up has no notice of ours: Clerk's «Require express consent to legal documents» (dashboard → Legal, on since 2026-10-22, needs ClerkJS components «Modern») shows a required checkbox linking /politicas/terminos and /politicas/privacidad, which fills `legal_accepted_at`. The checkout total says «Precio final, incluye los impuestos aplicables»; no store text claims «IVA incluido» (`tests/components/legal-consent.test.tsx`). The retracto refund is at most 30 calendar days from when it is exercised, on both the returns page and the terms. **Versions:** `lib/legal-versions.ts` is the single source of the Terms and Privacy versions (their dates); the pages, the checkout and gift-card payloads (`legalConsent`) and the Clerk `<SignUp unsafeMetadata>` all read it, and the admin validates against its mirror. The sign-in page shows its own notice because Google can create the account there.

When adding a customer-navigable route:

1. Create the Spanish canonical segment.
2. Add a permanent redirect from any prior English path.
3. Update route helpers, navigation, metadata, canonical tags, JSON-LD, sitemap, robots and tests.
4. **Never remove an existing redirect or slug alias** (`ProductSlugAlias`, `CategorySlugAlias`) without a deliberate SEO migration plan.
5. Clerk route configuration must use the same Spanish canonical paths (`/iniciar-sesion`, `/crear-cuenta`); keep the public Clerk variables and `ClerkProvider` aligned with `STOREFRONT_ROUTES`, or the mounted auth form renders empty.

**Archived products redirect (308) to the closest thing still on sale** (policy change, 2026-10-05; until then they returned `404` and about 22 % of Google impressions landed on dead pages). The admin decides the destination in `lib/archived-product-redirect.ts`, in this order: a live sibling of the same product group (in stock first), the product's category if active, its type (`/tienda?typeId=…`) if active, otherwise `/tienda`. The store answers `permanentRedirect` with `#producto-no-disponible`, which shows a short notice and is never sent to the server, so it creates no new URLs. Google may treat a redirect to a non-equivalent page as a soft 404, which is why the sibling comes first; in October 2026 most archived products had no live sibling and went to their category. A product deleted from the panel resolves the same way (the admin keeps its URLs in `DeletedProductUrl`). A product or category that **never existed** must still return a real `404`, and both behaviours stay covered by the public health checks.

- **Old-URL map (`lib/legacy-product-redirects.mjs`).**
  - Regenerate it with `pdepapel-admin/scripts/export-product-slug-redirects.ts --store-id=<production>` as `pdepapel_ro`; the script checks the user.
  - A source whose product was archived points in one hop to the sibling or the category, with `#producto-no-disponible`. A source is never deleted.
  - `legacy-redirect-map.spec.ts` (weekly `public-health.yml`) fails when a destination stops being a live page.
- `/tienda?q=` redirects (308) to `?search=`. A page past the last one redirects (307) to the last one.

### Clerk middleware — the 500 that shipped

`middleware.ts` (Clerk v6 `clerkMiddleware` + `createRouteMatcher`) runs only on routes that read the session on the server and on the protected account routes. Public catalog routes bypass Clerk so genuine `notFound()` responses keep their HTTP `404` and ISR keeps working.

**Any new page that calls `auth()` or `currentUser()` on the server must be added to `requiresServerAuth` in `middleware.ts`, or Clerk throws and the page answers 500.** `/pedido/[id]` has shipped in that state.

When a change touches authentication or authorization, verify that route list **and** confirm the assumption the change rests on with a read-only query against production data rather than reading it off the schema. Most production orders carry the **owner's** `userId`: the owner registers WhatsApp orders on the customer's behalf. True in the schema, false in the data.

### Clerk: headless on public pages, full only in `(cuenta)`

`components/storefront-shell.tsx` renders the header, footer, providers and `ClerkProvider` for both route groups, with a pinned `clerkJSVersion` and a `clerkVariant`:

- `app/(routes)` (every public page, including `not-found`) loads **headless** clerk-js: session, token and `signOut`, no UI components. `<SignIn>`, `<SignUp>`, `<UserButton>` and `openUserProfile()` do not work there. The header uses our own `components/account-menu.tsx`, and «Administrar cuenta» is the link `/mi-cuenta?perfil=1`, which opens the Clerk profile from `AccountHub`.
- `app/(cuenta)` (`/iniciar-sesion`, `/crear-cuenta`, `/mi-cuenta`, `/mis-pedidos`, `/mis-busquedas`) loads **full** clerk-js. New pages that need Clerk UI go here, and `isAccountGroupPath` in `lib/routes.ts` must list them.

**Entering or leaving the account pages is always a full page load.** A soft navigation between the two groups remounts the shell, keeps the wrong Clerk script, re-downloads Clerk and loses the GA4 page_view. The mechanisms:

- Outside `(cuenta)`, links to account pages use `components/storefront-link.tsx` (`StorefrontLink`, a drop-in for `next/link` that renders a plain `<a>` for account hrefs) or `window.location.assign`, never `next/link` or `router.push`. `tests/unit/security/account-links-scan.test.ts` enforces this; its allowlist holds only components rendered inside `(cuenta)`.
- Inside `(cuenta)`, `FullClerkGuard` turns clicks on internal links that leave the group into full loads, and reloads once if it finds the headless script.
- `HeadlessClerkGuard` in `(routes)` reloads once if a programmatic exit (the search box, Clerk's post-sign-in redirect) arrived with the full script.
- Covered end to end by `tests/e2e/local/account-session.spec.ts`: script variant per group, owner order → `PANEL` without analytics, customer order → `STORE` with `userId` and consent, wishlist PUT with the Bearer token, return to the original page after sign-in, sign-out from the menu, one page_view per crossing, no hydration errors.

### Cache and revalidation

- After catalog mutations the admin calls this app's `POST /api/revalidate` to refresh ISR. It requires `REVALIDATION_SECRET` to be an **identical single printable line** in both Vercel projects: no quotes, spaces or embedded newlines; the store rejects a header that carries one, and revalidation then fails silently from the panel's point of view.
- The same secret authenticates the other direction once: the contact form (`app/api/send`) asks the admin `GET /notification-recipients` with `x-revalidate-secret` for the addresses the owner set in Configuración. Those addresses never go in `/public/storefront`, and no address is written in this app's code; without the secret or an answer, the form replies 503 and sends nothing.
- **A successful admin database write with a stale public page is still a customer-visible defect — verify both.**
- **Vercel Firewall on this project must not challenge `/api/revalidate`.** The admin calls it server to server, and Bot Protection set to «Challenge» answers 429 with `x-vercel-mitigated: challenge` before the route runs, so this app's logs show nothing and the catalog stays stale. Keep a Bypass custom rule for that path, or set Bot Protection to «Log». The same applies to any other non-browser client (Playwright in `public-health.yml`, uptime monitors).
- Public catalog fetches use a five-minute fallback cache. Do not shrink that window without measuring the extra server work.
- **Purges are scoped (since 2026-10-13).** The full contract (tags, who carries them, who purges them) is in `../docs/revalidacion-catalogo.md`. Catalog fetches carry scoped tags from `lib/catalog-cache.ts`: `product:<slug|id|alias>` on the product page; `products:group|category|type:<…>`, `products:featured` and `products:list` on listings (derived from the query in `catalogListingTags`); the global `products` tag on all of them. A request to `/api/revalidate` with `version: 2` purges exactly the `tags`/`paths` it carries, against a tag allowlist with caps of 200 tags and 50 paths. A request **without** a version keeps the old full purge (`products` + `catalog` + `/tienda`), so an admin and a store from different deploys stay correct during skew. New catalog fetches must take their tags from `lib/catalog-cache.ts` and add any new tag shape to the route's allowlist and to the admin's `lib/storefront-cache-scope.ts`.
- **Brand data** (`actions/get-brands.ts`): the list (`GET /brands?conProductos=1`) carries `brands` + `catalog`; a brand page (`GET /brands/{slug}`) carries `brand:<slug>` + `brands` + `catalog`. Both tags are in the revalidate allowlist. Brand-filtered product lists always carry `products:list`, which a brand assignment purges.
- **`/tienda`, `/categoria/<slug>` and `/marcas/<slug>` without catalog parameters are served from an ISR copy.** `marca` is a catalog parameter. `middleware.ts` rewrites those requests to `/catalogo-cache/...`; tracking parameters such as `utm_*` and `fbclid` don't count as catalog parameters, and the rewrite drops the query. Any filter, search, sort or page keeps the dynamic route, and a direct visit to `/catalogo-cache/*` gets a 308 back to the public URL. The copies call the public pages with empty search params inside `StaticUrlState` (nuqs's React adapter; the Next adapter's `useSearchParams` would client-render the whole listing). Components read the path through `useStorefrontPathname`, never `usePathname`, so links and active states match between server and browser. Revalidating a public listing path also revalidates its cached twin.
- Links in the first mobile screen to static pages (the breadcrumb, the header logo) use `prefetch={false}`: a full static prefetch competes with the LCP image.

- **Upstream timeouts and ISR fallbacks (2026-10-25, after the 300 s hangs on `/tienda`).**
  - Every server `fetch` to the panel goes through `withUpstreamTimeout` (8 s, `lib/catalog-cache.ts`). Listing routes have `maxDuration = 30`.
  - `itemsPerPage`/`limit` are clamped to 60 in the store (`clampCatalogPageSize`) and to 100 in the panel's `GET /products`.
  - The ISR copies pass `CACHED_LISTING_PARAMS` (compared by identity, `lib/cached-listing.ts`). There `getListingProducts` throws if the panel fails, so Next keeps the last good copy; only renders with filters show «no disponible».
  - Consequence: if the panel fails during `next build`, the store deploy fails, and Vercel keeps the previous deployment.

### Payments and checkout

- Customer-facing text stays provider-neutral: **`Pago en línea`**, not "pay with Bold/Wompi/PayU". Keep useful payment icons; this rule is about text. Bold is the default, Wompi the fallback, PayU legacy and removed from this app.
- **Declined card (2026-10-26):** a decline no longer cancels the order; it stays PENDING for 2 h so the customer can retry from `/pedido/[id]`. The admin sends `paymentResult: "declined"` for such an order, so the return from the gateway shows «¡Hubo un fallo en tu intento de pago!» and `getOrderStage` shows «Pago no aprobado» (still `verifying`, so «Pagar ahora» stays). After 2 h the admin's reconciliation cancels it.
- `lib/payment-router.ts` must stay in sync with the admin's `PaymentMethod` enum.
- Bank transfer is confirmed manually by an admin; the selector and instructions must say so.
- **Bank-transfer data comes from the admin (2026-10-26).** `BankTransferInstructions` (`/pedido`) and the checkout's `BankTransferSteps` read `useStorefrontSettings().bankTransfer` (account, Bre-B key, WhatsApp), which `getStorefrontSettings()` takes from the admin's public storefront endpoint (`lib/bank-transfer.ts` parses it). No constants: `tests/unit/security/no-sensitive-values.test.ts` in the admin fails if the account or key appear quoted here. A missing field logs `[BANK_TRANSFER_INFO]` and shows «Escríbenos por WhatsApp para los datos de pago» with the WhatsApp button, never an empty card. The other WhatsApp links still use `SUPPORT_WHATSAPP_NUMBER` (admin «Known gaps»).
- **Never mark an order paid from a client redirect.** Payment state comes from the admin's provider webhooks. Online payment keeps the cart until the order is genuinely `PAID`.
- The checkout sends an `Idempotency-Key`; do not remove it. Stock is re-checked right before submitting, and a 422 renders the inline sold-out block.
- **Freight is never trusted from this app (2026-10-17).** Transfer and COD go to `POST /orders` (`actions/create-new-order.ts`), online payment to `/checkout`; both resolve the EnvioClick rate on the admin side (cached quote or a fresh one) and compare the total sent with it. The `shipping.cost` sent only helps recognise the chosen service. A 409 `SHIPPING_RATE_CHANGED` / `SHIPPING_RATE_UNAVAILABLE` from either path opens the recovery card in `multi-step-checkout-form.tsx`; keep that handler shared by both paths. «Se acuerda por WhatsApp» orders are saved with shipping 0.
- Remove stale "Próximamente" copy for active payment methods.
- **Checkout city and document (2026-10-26, `output/audits/checkout-abandono-fase0-2026-10-26.md`).**
  - The city field (`components/ui/autocomplete-location.tsx`) **never clears what the customer types**: it clears the text only when the selected city goes from set to empty from outside, never because results arrived. The parent passes a module-level empty list (`EMPTY_LOCATIONS`), and `useLocations` keeps the previous results while a search loads and does not search below two letters. The old version wiped the text on every result, so a phone typist could never hold more than one letter (all 8 checkout validation errors in 28 days were the city). Leaving without choosing keeps the text and says «Toca tu ciudad en la lista para elegirla.»; a single exact match is selected on blur or Enter. Regression tests: `tests/components/autocomplete-location.test.tsx`, `tests/e2e/local/checkout-ciudad-390.spec.ts` (400 ms per letter, 300 ms network).
  - City search is by words: «Medellín, Antioquia», «cali valle», «Bogotá DC», «Cartagena de Indias» (`lib/location-search.ts`, same rule as the admin's `lib/dane-search.ts`; change both together). `/api/locations` sends the admin only the longest word and filters by all of them, so it works whichever app deploys first. No result offers «¿No aparece? Escríbenos por WhatsApp» and sends `city_not_found` (sanitized term, once per search).
  - The address keeps EnvioClick's 50-character limit (`ADDRESS_MAX_LENGTH`); past it, «Apartamento, torre u oficina» opens and the message says where the rest goes.
  - **The identity document is not asked in step 1.** Nothing uses it except an invoice in the customer's name: step 3 has the optional «¿Necesitas factura a tu nombre? (cédula o NIT)», sent only when filled (spaces and dots stripped). It is never stored in the browser (`UNPERSISTED_FORM_FIELDS`; `checkout-storage` v3 drops any old value).
  - Step 1 shows «Envío gratis desde $X · el valor exacto en el siguiente paso» from `Store.freeShippingThreshold` (or «Tu envío es gratis.» / «El valor del envío, en el siguiente paso.»). Mirror any change above the first field in `checkout-skeleton.tsx` (CLS).
  - **WhatsApp updates (2026-10-26):** step 1 ends with the unchecked box «Recibir avisos de mi pedido por WhatsApp» (below the newsletter box; its row is mirrored in `checkout-skeleton.tsx`). Checked, the payload sends `whatsappOptIn: { version }` from `lib/whatsapp-opt-in.ts`; unchecked, nothing. It is consent, so it is never restored from a previous session. The version must match the admin's `WHATSAPP_OPT_IN_VERSION` (a test reads both files). The panel sends the WhatsApp only with that consent and its switch on; the email goes regardless. Known gaps owned by the admin (see its AGENTS.md): «BAJA» typed in the chat does not opt out yet (opt-out is the panel's «Quitar avisos por WhatsApp»), and only the guide and delivered templates are wired; in-transit, out-for-delivery and exception updates go by email only. The guide email says «ya tiene guía de envío», never «va en camino».
- **Gift cards (2026-09-28):** `/tarjeta-regalo` sells a card through `POST /gift-cards/checkout` (`actions/gift-cards.ts`) and hands off exactly like the checkout (Bold from the order page with `?autoPay=true`, Wompi redirect, transfer instructions). In checkout step 3 the «Tarjeta de regalo» field validates through `POST /gift-cards/validate` (balance and last four only) and sends `giftCardCode` in the payload only when validated; the coupon applies first, the card covers the remainder, and the total shown is `amountDue`. A fully covered order comes back as an `Order` with status `PAID`. `/pedido/[id]` renders a `GIFT_CARD` purchase without a shipping card and shows only the code's last four; the code itself lives in the email.
- **Gift orders (2026-09-28):** step 1 offers «¿Es un regalo?». The buyer's own name, email and phone stay the order's identity; the recipient goes in `isGift`, `giftRecipientName` (required when on), `giftRecipientEmail`, `giftRecipientPhone` and `giftMessage` (all step-1 fields in `lib/checkout-steps.ts`). The payload sends the recipient fields **only** when the flag is on. The public order page (`/pedido/[id]`) receives only the flag, the name and the message, never the recipient's contact.

### Analytics and privacy

- GA4 and Microsoft Clarity load **only after explicit, revocable browser consent**. Preferences are versioned in local storage and mirrored into a cookie set by `POST /api/consent`; bump `ANALYTICS_CONSENT_VERSION` (storage key and cookie name together) whenever the consent scope changes.
- **Consent v3 (2026-10-26): two purposes, `{ analytics, marketing }`.** Banner: one line («Usamos cookies para analizar la tienda y medir nuestros anuncios.»), «Solo necesarias» and «Aceptar todo» the same size, «Configurar» opens the dialog with «Analítica» and «Publicidad» switches, both off by default, and «Guardar». A v2 «sí» never carries over to advertising. Withdrawing either reloads the page so loaded scripts stop. `hasMarketingConsent()` is the only gate for advertising.
- **TikTok Pixel (2026-10-26)**, `lib/analytics/tiktok.ts`:
  - Loads only with `NEXT_PUBLIC_TIKTOK_PIXEL_ID` (optional, Production only, plain var) **and** «Publicidad»: `holdConsent` → `load` → `grantConsent` → `page()` once, from `CustomerAnalyticsProvider`, scheduled on browser idle like Clarity so the SDK never competes with LCP (local A/B vs main 2026-10-26, no consent: LCP within noise, same JS; `output/audits/tiktok-perf/`). Later App Router navigations call `ttq.page()`, never the first again. A «no» calls `revokeConsent` and drops the queue.
  - Events next to the GA4 ones, GA untouched: ViewContent (`product-info`), AddToCart (`use-add-product-to-cart`, `product-card`, `reorder-button`), InitiateCheckout / AddPaymentInfo (checkout), Search (sanitized term only), CompletePayment (`/pedido`).
  - `content_id` is the feeds' id (`sku || id`, via `toAnalyticsItem`). The reorder button's GA event still sends `product.id`; TikTok there uses the feed id on purpose.
  - Payload allowlist: `contents` (id, type, name, quantity, price), `content_type`, `value`, `currency`, `query`. Never email, phone, name, address, document, `ttq.identify` or advanced matching. Every event carries `event_id` for a future Events API.
  - CompletePayment only when the order is `PAID` and paid by Bold/Wompi/PayU or fully by gift card (`GiftCard`), never transfer or COD. Once per order per browser (`pdepapel:tiktok-complete-payment:<id>`), `event_id = CompletePayment-<orderNumber>`, and the order number appears only there. Retried if «Publicidad» is granted with the page open.
  - Tests: `tests/unit/lib/tiktok-pixel.test.ts`, `tests/components/single-order-page-tiktok.test.tsx`, `tests/components/customer-analytics-provider.test.tsx`, local e2e `tests/e2e/local/consent-v3.spec.ts` (build with test `NEXT_PUBLIC_GA_MEASUREMENT_ID` and `NEXT_PUBLIC_TIKTOK_PIXEL_ID`).
  - Backlog: the TikTok Events API (server) to count paid orders that no consenting browser sees.
- **Never name an event parameter `source`, `medium`, `campaign`, `campaign_id`, `term` or `content`.** GA4 reads them as the session's campaign: `add_to_cart { source: "product_card" }` rewrote sessions to «product_card / (not set)», 31 % «Unassigned» until 2026-10-26. Use `ui_source`; `sendOrQueueGoogleEvent` strips those keys and warns in development (`withoutReservedCampaignParams`).
- `checkout_validation_error` carries `invalid_fields` (field names, sorted, ≤ 100 characters, never values) besides the groups; the document is the group `facturacion`.
- `cart_reminder_view` counts only when the strip is actually shown (home) and once per visit (`CART_REMINDER_VIEWED_KEY`).
- **Team browsers (2026-10-26):** the owner marks a browser from the admin (Configuración › Avanzado › «Navegador del equipo») → `/equipo?t=<exp.signature>` (5-minute link, HMAC with `REVALIDATION_SECRET` and the purpose `pdepapel:team-browser:v1`, `lib/team-browser-token.ts`) sets the non-HttpOnly cookie `pdepapel_equipo=1` for 400 days; `/equipo?salir=1` removes it. With it, GA4's `config` carries `traffic_type: "internal"` (excluded by the «Internal Traffic» data filter once it is Active) and Clarity is not loaded. The TikTok pixel is not affected.
- **Never put email, phone, address, document number, raw search text, payment credentials or any other personal data in analytics event parameters.** Keep them to step names, generic groups, counts and status classes. Never call Clarity `identify`.
- Keep Google's canonical GA4 bootstrap (`function gtag(){dataLayer.push(arguments);}`). An arrow function with a rest parameter loads `gtag.js` but silently drops every queued command.
- Essential checkout and security functions must not depend on analytics consent.
- Production analytics IDs must not be configured in Preview or Development.
- The newsletter uses explicit consent and double opt-in. **Never infer marketing consent** from an order, account, checkout or import. Confirmation links expire after 48 hours and every confirmed recipient keeps a no-login unsubscribe path. Current copy promises at most two messages a month; do not exceed that without new consent and a policy update.

### WhatsApp buttons

- Every WhatsApp link goes through `lib/whatsapp-prefill.ts` (`buildWhatsAppUrl`): product (name + SKU, from `hooks/use-whatsapp-context.ts`, set by `ProductInfo`), cart (up to 5 SKUs, then «y más»), order (`getOrderSupportWhatsAppUrl`), and general (footer, Contacto, every other page). Under 200 characters, `encodeURIComponent`, never names, emails, phones, addresses or totals. The policy, bank-transfer and error pages keep their own specific texts.
- **The admin bot parses these exact texts** (`pdepapel-admin/lib/whatsapp/web-origin.ts`) to greet by page. Changing a text here means changing that parser in the same deploy; the parser also accepts the legacy texts.
- GA4/Vercel `whatsapp_cta_clicked` carries `page_path`, `placement`, `page_type` and `product_ref` (SKU) only.

### Images

One frozen Cloudinary transformation (`f_auto,q_auto,c_limit,w_≤1600`) in `lib/cloudinary-loader.ts`, used **only** through `components/ui/cloudinary-image.tsx`. Every distinct transformation and width is a derived copy that is stored forever and billed, so **do not add loaders, `quality` values, crops or wider `deviceSizes`**. Widths snap to `CLOUDINARY_DELIVERY_WIDTHS`. Fixed thumbnails use `width`/`height`; anything up to 64 px (sticky bar 48, gallery thumbs 64, design-option thumbnails 40 in `components/design-option.tsx`) lands on the same `w_128` copy, so pick a size that keeps it there. Runbook: `../docs/imagenes-cloudinary.md`.

**Design options (issue #3, 2026-10-07):** each design option on the product page shows the main photo of the variant the click leads to (`getDesignThumbnails` in `lib/product-variants.ts`; the page passes `image` in the sibling projection). A design whose target has no photo, or shares its photo with another design, keeps the text chip. A group with a single, already chosen design shows only the «Diseño: X» line.

**Colour swatches (issue #3, 2026-10-07):** every colour circle (product page picker, single-product dot, shop filter) goes through `components/ui/color-swatch.tsx`, which paints from `color.swatchType` (`lib/color-swatch.ts`, byte-identical to the admin copy; `tests/unit/lib/color-swatch-parity.test.ts`). A missing or unknown type paints the hex as a solid, never a type guessed from the name. Light solids (contrast < 3:1 against white) get a reinforced inner border; the hex is always declared as `backgroundColor` and the gradient separately, so a browser that rejects the gradient keeps the tone. The «Color: …» heading shows the hovered or focused colour name (the `title` tooltip is gone).

### Social networks

`lib/social-links.ts` is the only list of the store's networks (`STORE_SOCIAL_LINKS`): Instagram, TikTok, Facebook, YouTube, in that order. The footer, /nosotros (hero and «Síguenos»), «Entre ediciones», the Organization JSON-LD `sameAs` and the Facebook fallback for embedded posts all read it. Icons come from `components/social-icon.tsx` (monochrome `currentColor` marks in `components/icons.tsx`). Every link opens in a new tab with `rel="noopener noreferrer"` and `aria-label` «<Red> de P de Papel». The admin has the same list in `pdepapel-admin/lib/social-links.ts`, and a test checks that the two match. Customer emails (admin `emails/components.tsx` `Shell`) carry them as text links in the footer and in the plain-text part.

### Capsule editions (`/capsulas/[edicion]`)

- The page is `force-dynamic`. It is **indexable only while it is the LIVE edition, viewed without a preview link** (`index, follow` + canonical). Every other case is `noindex`. It renders only what the admin's public edition endpoint returns: a 404 there (sales off without a preview link, CLOSED, unknown) is `notFound()` here. `?vista=<token>` is Paula's signed preview link from the panel. Never cache it or send it to analytics: GA4 and Vercel strip it, and Clarity does not record a `/capsulas/` page that carries `vista` (`isClarityEligiblePath`).
- **Entry points (launch 2026-10-20).** The edition product stays archived, so the catalog never lists it. The entry points read `getCurrentCapsuleEdition` (`actions/get-current-capsule-edition.ts`, `/capsulas/actual`, `revalidate 300` + tag `capsules`, never `no-store`, because it runs in the shell of every page):
  - «Cápsulas» in the desktop row and the drawer (only with a LIVE edition; at `lg` it takes one type's slot so the row does not wrap).
  - `CapsuleEditionBanner` below the hero on the home page (no slot counts or value claims).
  - The sitemap entry: the LIVE edition, or `/capsulas` between editions.
  - **`/capsulas`** is the stable bio URL. With sales off it is a 404. With a LIVE edition it is a 307 to it, forwarding only `utm_*` (`withUtmParams`; `redirect()` does not keep the query). With no LIVE edition it is the indexable «Entre ediciones» page (the four networks, newsletter double opt-in). It reads `searchParams`, so it is dynamic; the inner fetch is still cached.
  - `/capsules` and `/capsules/:path*` → `/capsulas…` (308).
- «Cómo funciona y condiciones» (`components/capsules/capsule-conditions.tsx`) is plain Spanish: slips, minimum 5, equivalent capsules, the gallery, fixed gifts, daily slots, the draw after payment, the retracto (5 business days, Ley 1480 art. 47, linked to `/politicas/devoluciones` and `/politicas/terminos`) and the video/first name (linked to `/politicas/privacidad#videos-de-capsulas`). No peso values and no «suerte».
- The gallery shows names and photos only — never per-item prices or peso value claims, and no «Lucky» wording. Packs show total, per-capsule price, «Ahorras» and the gift label; a pack is disabled when the admin marks it unavailable (25 % rule).
- Buying (P4): only when the payload says `salesEnabled` and the edition is LIVE (a preview link never buys) and today has slots. «Comprar pack de N» stores the pack in `hooks/use-capsule-pack.ts` (sessionStorage, **not the cart**: the edition product is archived and the cart would drop it) and opens `/finalizar-compra?capsulas=1`, which pays that pack: online or bank transfer (never COD), no coupon field, no free shipping, no catalog stock pre-check (the admin validates pack, slots and the 25 % rule), sends `capsuleVideoConsent`, and leaves the cart untouched. The receipt shows `OrderCapsuleCard` (pack, gift, and what came out after the draw).
- Local e2e: `npm run test:e2e:local -- tests/e2e/local/capsule-edition.spec.ts tests/e2e/local/capsule-purchase.spec.ts tests/e2e/local/capsule-entry-points.spec.ts` (specs that change the edition purge the store's `capsules` tag with `purgeStoreCapsules`, because the admin e2e server purges another address) (seed through the admin's `scripts/seed-e2e-capsule-edition.ts`; the admin test server runs with sales forced on, `CAPSULE_SALES_TEST_OVERRIDE`).

### Accessibility, UX and performance

- Preserve responsive behaviour and verify at **390 / 768 / 820 / 1280 / 1440** with real device emulation, checking **both** page-level and container-level overflow. Header, menus, drawers, dialogs and tables break easily on tablet and mobile.
- Do not place text over imagery without a tested contrast layer. Category cards must stay readable over light or pastel images, and the category image is optional at the data level, so keep a graceful fallback.
- Category landing pages stay category-scoped: no selector inviting the shopper to leave the category, and in-category search stays constrained to it.
- **Keep product description HTML sanitized.** Never render unsanitized external HTML with `dangerouslySetInnerHTML`.
- Treat mobile **LCP and CLS as release requirements**. The critical first view renders without an entrance animation. Loading fallbacks reserve the same aspect ratio, spacing and card count as the resolved section. Never render a visible deterministic value (a price, a header control) as `null` until hydration; ship an equivalent shell in the initial HTML.
- Keep the document's header offset stable. A fixed header may animate, but it must not rewrite `body` padding while the visitor scrolls.
- Keep global client bundles lean: preview modals, cart details, chat, review forms and newsletter libraries load only when the visitor opens or approaches them.
- Do not mark below-the-fold assets as `priority`, and use only the fonts and weights actually used.
- **Server actions run one at a time (Next 14.2).** A server-action call issued while another is in flight can be dropped silently. Sequence them, or move one to a plain fetch.
- **Favorites keep the family.** The heart on a product-group card saves the group (`savedAsGroup`), and the favorites page must show it as the family with «Elegir opción», never as the variant that fronted it that day: refresh saved groups with `fetchCatalogFromClient({ groups })` by `productGroupId` and everything else with `ids`, keep the saved `id`/`slug` stable, and carry `savedAsGroup` through `slimStoredProduct`, the account sync (`items` in the PUT) and `mergeAccountProducts`. «Agregar al carrito» on a group still opens the preview: buying needs a variant.
- Seasonal decoration uses optimized local assets, stays `pointer-events-none`, respects `prefers-reduced-motion`, and sits below dialogs and privacy prompts.

- **Newsletter (2026-10-25).**
  - The forms post from the browser straight to the panel with `useBotTrap` (honeypot, clock, Turnstile on submit), so the panel sees the real IP for its rate limit. Turnstile never blocks a newsletter signup: the panel logs a failed or missing token and relies on the honeypot, the clock and the limits.
  - `/suscripcion/confirmar` only shows the state and a «Confirmar mi suscripción» button; only the click confirms (POST). Never confirm on load: mail scanners open links.
  - The checkout opt-in travels as `newsletterOptIn` with the order.
- **Client/server guard:** `tests/unit/security/client-server-boundary.test.ts` fails if a `"use client"` file reaches a `server-only` module, `next/headers` or `fs`.
- **Accessibility:**
  - Fixed bars that hide (`product-sticky-bar`, `mobile-cart-bar`) take `inert` along with `aria-hidden`.
  - The pagination edges carry their name as `sr-only` text, never `aria-label` on an `<a>` without `href`.

## Definition of done

Compiling locally is not done. For production-impacting work:

1. The root cause is addressed within the architecture and business rules above.
2. Relevant tests pass and a regression test covers the previously broken behaviour.
3. Responsive, SEO, cache and payment impacts were considered for the changed surface.
4. No secrets, scratch files, unrelated changes or local agent-instruction files are staged.
5. Required console actions (Vercel variables, firewall rules) are documented as plain steps.
6. Local servers are stopped.
7. The user has explicitly approved any push.
8. Post-deploy smoke verification is done or clearly handed to the owner.

## Where to read more

- `../pdepapel-admin/AGENTS.md` — the admin application and API, the data model, migrations, payments, inventory and Mercado Libre.
- `../docs/` — `testing.md`, `revalidacion-catalogo.md`, `seguimiento-seo.md`, `analitica-microsoft-clarity.md`, `imagenes-cloudinary.md`.
