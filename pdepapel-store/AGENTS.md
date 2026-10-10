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
- **Never run a real purchase flow against production.** For purchase E2E use a non-production URL and set `E2E_PURCHASABLE_PRODUCT_SLUG`.
- Playwright has desktop Chrome and Pixel 5 projects. Keep public visual and navigation regressions covered at both, including **no unintended horizontal scroll** on home, shop and category pages.
- For a bug fix, add the regression test that would have failed before the fix.
- Stop local servers when done, and run `git diff --check` before handing work back.
- Do not fix unrelated warnings during focused work; note them instead.

## Code style and conventions

- Next.js 14 App Router with heavy **RSC + ISR**, React 18, TypeScript strict, Tailwind 3, Radix + shadcn-style components, react-hook-form + Zod.
- Store-specific stack: TanStack Query, **nuqs** for URL state, Zustand, vaul drawers, `schema-dts` JSON-LD, `app/sitemap.ts` / `app/robots.ts`, per-route `opengraph-image` / `twitter-image`, Vercel Analytics (Speed Insights was removed on 2026-10-05 to cut Vercel spend; do not re-add it without approval).
- `next/image` optimization is **on** here (AVIF/WebP, long-cache headers), unlike the admin.
- Directory shape:

  ```text
  app/
  ├── (routes)/       # public pages: Spanish canonical + English redirect stubs
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

When adding a customer-navigable route:

1. Create the Spanish canonical segment.
2. Add a permanent redirect from any prior English path.
3. Update route helpers, navigation, metadata, canonical tags, JSON-LD, sitemap, robots and tests.
4. **Never remove an existing redirect or slug alias** (`ProductSlugAlias`, `CategorySlugAlias`) without a deliberate SEO migration plan.
5. Clerk route configuration must use the same Spanish canonical paths (`/iniciar-sesion`, `/crear-cuenta`); keep the public Clerk variables and `ClerkProvider` aligned with `STOREFRONT_ROUTES`, or the mounted auth form renders empty.

**Archived products redirect (308) to the closest thing still on sale** (policy change, 2026-10-05; until then they returned `404` and about 22 % of Google impressions landed on dead pages). The admin decides the destination in `lib/archived-product-redirect.ts`, in this order: a live sibling of the same product group (in stock first), the product's category if active, its type (`/tienda?typeId=…`) if active, otherwise `/tienda`. The store answers `permanentRedirect` with `#producto-no-disponible`, which shows a short notice and is never sent to the server, so it creates no new URLs. Google may treat a redirect to a non-equivalent page as a soft 404, which is why the sibling comes first; in October 2026 most archived products had no live sibling and went to their category. A product deleted from the panel resolves the same way (the admin keeps its URLs in `DeletedProductUrl`). A product or category that **never existed** must still return a real `404`, and both behaviours stay covered by the public health checks.

### Clerk middleware — the 500 that shipped

`middleware.ts` (Clerk v6 `clerkMiddleware` + `createRouteMatcher`) runs only on routes that read the session on the server and on the protected account routes. Public catalog routes bypass Clerk so genuine `notFound()` responses keep their HTTP `404` and ISR keeps working.

**Any new page that calls `auth()` or `currentUser()` on the server must be added to `requiresServerAuth` in `middleware.ts`, or Clerk throws and the page answers 500.** `/pedido/[id]` has shipped in that state.

When a change touches authentication or authorization, verify that route list **and** confirm the assumption the change rests on with a read-only query against production data rather than reading it off the schema. Most production orders carry the **owner's** `userId`: the owner registers WhatsApp orders on the customer's behalf. True in the schema, false in the data.

### Cache and revalidation

- After catalog mutations the admin calls this app's `POST /api/revalidate` to refresh ISR. It requires `REVALIDATION_SECRET` to be an **identical single printable line** in both Vercel projects: no quotes, spaces or embedded newlines; the store rejects a header that carries one, and revalidation then fails silently from the panel's point of view.
- The same secret authenticates the other direction once: the contact form (`app/api/send`) asks the admin `GET /notification-recipients` with `x-revalidate-secret` for the addresses the owner set in Configuración. Those addresses never go in `/public/storefront`, and no address is written in this app's code; without the secret or an answer, the form replies 503 and sends nothing.
- **A successful admin database write with a stale public page is still a customer-visible defect — verify both.**
- **Vercel Firewall on this project must not challenge `/api/revalidate`.** The admin calls it server to server, and Bot Protection set to «Challenge» answers 429 with `x-vercel-mitigated: challenge` before the route runs, so this app's logs show nothing and the catalog stays stale. Keep a Bypass custom rule for that path, or set Bot Protection to «Log». The same applies to any other non-browser client (Playwright in `public-health.yml`, uptime monitors).
- Public catalog fetches use a five-minute fallback cache. Do not shrink that window without measuring the extra server work.

### Payments and checkout

- Customer-facing text stays provider-neutral: **`Pago en línea`**, not "pay with Bold/Wompi/PayU". Keep useful payment icons; this rule is about text. Bold is the default, Wompi the fallback, PayU legacy and removed from this app.
- `lib/payment-router.ts` must stay in sync with the admin's `PaymentMethod` enum.
- Bank transfer is confirmed manually by an admin; the selector and instructions must say so.
- **Never mark an order paid from a client redirect.** Payment state comes from the admin's provider webhooks. Online payment keeps the cart until the order is genuinely `PAID`.
- The checkout sends an `Idempotency-Key`; do not remove it. Stock is re-checked right before submitting, and a 422 renders the inline sold-out block.
- Remove stale "Próximamente" copy for active payment methods.
- **Gift cards (2026-09-28):** `/tarjeta-regalo` sells a card through `POST /gift-cards/checkout` (`actions/gift-cards.ts`) and hands off exactly like the checkout (Bold from the order page with `?autoPay=true`, Wompi redirect, transfer instructions). In checkout step 3 the «Tarjeta de regalo» field validates through `POST /gift-cards/validate` (balance and last four only) and sends `giftCardCode` in the payload only when validated; the coupon applies first, the card covers the remainder, and the total shown is `amountDue`. A fully covered order comes back as an `Order` with status `PAID`. `/pedido/[id]` renders a `GIFT_CARD` purchase without a shipping card and shows only the code's last four; the code itself lives in the email.
- **Gift orders (2026-09-28):** step 1 offers «¿Es un regalo?». The buyer's own name, email, phone and document stay the order's identity; the recipient goes in `isGift`, `giftRecipientName` (required when on), `giftRecipientEmail`, `giftRecipientPhone` and `giftMessage` (all step-1 fields in `lib/checkout-steps.ts`). The payload sends the recipient fields **only** when the flag is on. The public order page (`/pedido/[id]`) receives only the flag, the name and the message, never the recipient's contact.

### Analytics and privacy

- GA4 and Microsoft Clarity load **only after explicit, revocable browser consent**. Preferences are versioned in local storage and mirrored into a cookie set by `POST /api/consent`; bump `ANALYTICS_CONSENT_VERSION` (storage key and cookie name together) whenever the consent scope changes.
- **Never put email, phone, address, document number, raw search text, payment credentials or any other personal data in analytics event parameters.** Keep them to step names, generic groups, counts and status classes. Never call Clarity `identify`.
- Keep Google's canonical GA4 bootstrap (`function gtag(){dataLayer.push(arguments);}`). An arrow function with a rest parameter loads `gtag.js` but silently drops every queued command.
- Essential checkout and security functions must not depend on analytics consent.
- Production analytics IDs must not be configured in Preview or Development.
- The newsletter uses explicit consent and double opt-in. **Never infer marketing consent** from an order, account, checkout or import. Confirmation links expire after 48 hours and every confirmed recipient keeps a no-login unsubscribe path. Current copy promises at most two messages a month; do not exceed that without new consent and a policy update.

### Images

One frozen Cloudinary transformation (`f_auto,q_auto,c_limit,w_≤1600`) in `lib/cloudinary-loader.ts`, used **only** through `components/ui/cloudinary-image.tsx`. Every distinct transformation and width is a derived copy that is stored forever and billed, so **do not add loaders, `quality` values, crops or wider `deviceSizes`**. Widths snap to `CLOUDINARY_DELIVERY_WIDTHS`. Fixed thumbnails use `width`/`height`; anything up to 64 px (sticky bar 48, gallery thumbs 64, design-option thumbnails 40 in `components/design-option.tsx`) lands on the same `w_128` copy, so pick a size that keeps it there. Runbook: `../docs/imagenes-cloudinary.md`.

**Design options (issue #3, 2026-10-07):** each design option on the product page shows the main photo of the variant the click leads to (`getDesignThumbnails` in `lib/product-variants.ts`; the page passes `image` in the sibling projection). A design whose target has no photo, or shares its photo with another design, keeps the text chip. A group with a single, already chosen design shows only the «Diseño: X» line.

**Colour swatches (issue #3, 2026-10-07):** every colour circle (product page picker, single-product dot, shop filter) goes through `components/ui/color-swatch.tsx`, which paints from `color.swatchType` (`lib/color-swatch.ts`, byte-identical to the admin copy; `tests/unit/lib/color-swatch-parity.test.ts`). A missing or unknown type paints the hex as a solid, never a type guessed from the name. Light solids (contrast < 3:1 against white) get a reinforced inner border; the hex is always declared as `backgroundColor` and the gradient separately, so a browser that rejects the gradient keeps the tone. The «Color: …» heading shows the hovered or focused colour name (the `title` tooltip is gone).

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
