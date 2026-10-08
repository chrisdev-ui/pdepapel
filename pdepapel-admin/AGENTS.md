# AGENTS.md — pdepapel-admin

Instructions for AI coding agents working in this application.

> **This file is the durable handoff document for this application.** It replaces `docs/AI_AGENT_CONTEXT.md`, which was transcribed into this file and into [`../pdepapel-store/AGENTS.md`](../pdepapel-store/AGENTS.md) and then removed. Read it before changing code, environment configuration, the database, integrations or deployment. Keep it updated in the same commit as any material architecture, operations, routing, payment, marketplace or deployment change.

## Project overview

**P de Papel** (`papeleriapdepapel.com`) is a Colombian e-commerce business selling kawaii stationery, gifts and creative supplies. The product is **Spanish-first**: all customer- and admin-facing copy, navigation, SEO and route segments are Spanish.

The repository holds **two independent applications**, not an npm workspace. There is no root `package.json`, and every npm command runs from inside one application folder.

| Folder | Role | Dev port | Database | Production domain |
|---|---|---:|---|---|
| `pdepapel-admin/` | Admin dashboard **and** the whole REST API, Prisma schema, database owner, webhooks, cron | `3001` | Direct via Prisma/MySQL | `admin.papeleriapdepapel.com` |
| `pdepapel-store/` | Public storefront | `3000` | **None**; calls the admin API | `papeleriapdepapel.com` |

This application owns the Prisma schema and all production data access, the REST JSON API consumed by both the dashboard and the storefront, catalog/inventory/orders/payments/shipping/tax/fairs/DIAN/marketplace/business-intelligence logic, inbound webhooks, cron tasks, and the cache-refresh requests sent to the storefront.

Everything is modelled **multi-store** even though one business uses it today. Respect `[storeId]` isolation in every query, endpoint, relation, uniqueness rule and mutation.

### Business vocabulary

- **Tienda en línea** — the public storefront. **Administración / panel** — this private dashboard and API.
- **Feria** — an in-person selling event; reserves stock before the event and records in-person sales. **Punto de venta** — everyday in-person sales outside a fair.
- **Cápsula sorpresa** — a randomized product sold at a fair, still tracked internally by the product actually packed (one unique QR per capsule).
- **Publicación** — a Mercado Libre listing, which is not a sale. **Venta de Mercado Libre** — a paid marketplace order, recorded at the **net actually collected**, never the buyer-facing gross.

## Setup and dev environment

Runtime baseline is **Node 24** (`.nvmrc`, `engines`, CI and Vercel all agree). Do not lower it without a reviewed compatibility plan.

```bash
npm install            # from inside pdepapel-admin/
npx prisma generate    # also runs on postinstall; rerun after any schema edit
npm run dev            # http://localhost:3001
```

Environment variables are validated at build time by `@t3-oss/env-nextjs` + Zod in `lib/env.mjs`, which `next.config.mjs` imports. A missing mandatory variable **fails the build**. Integration keys such as `GEMINI_API_KEY` and `OPENAI_API_KEY` are deliberately optional so a module can report "not configured" instead of blocking the build.

Some variables use `requiredInProduction` (`lib/env-rules.mjs`): optional locally, in CI and in Preview, but mandatory when `VERCEL_ENV=production`, so a deleted variable fails the deploy instead of silently disabling the feature.

## Build, test, and lint commands

Run everything from `pdepapel-admin/`.

```bash
npm run build          # production build; this app's only scripted type gate
npm run lint
npx tsc --noEmit       # what CI runs for types

npm run test:unit      # Vitest: tests/unit + tests/components
npm run test:coverage  # thresholds enforced in CI
npx vitest run tests/unit/some-file.test.ts     # a single file
npx vitest run -t "name pattern"                # a single test

# Database integration tests: local Docker MySQL only, serial, 30 s timeouts
npm run test:db:up && npm run test:db:push && npm run test:integration && npm run test:db:down

npm run test:e2e             # Playwright; boots its own app on :3101
npm run test:e2e:admin       # authenticated smoke via Clerk Agent Tasks (dev/staging keys only)
npm run test:e2e:fair-events
npm run test:e2e:shell

npx prisma studio
npm run email:dev
npm run export:products-merchant   # Google Merchant feed
npm run normalize:product-slugs    # read-only by default
```

CI (`.github/workflows/quality.yml`) runs `prisma generate`, `tsc --noEmit`, `test:coverage`, then a MySQL service with `test:db:push` and `test:integration`.

**Testing rules that matter:**

- Integration tests and `prisma db push` use the local Docker MySQL. `TEST_DATABASE_URL` must be local and end in `pdepapel_test`; the harness rejects anything else. **Never point a test at Railway or production.**
- Each Prisma integration test creates and cleans up its own data.
- Authenticated Playwright needs Clerk **development/staging** keys (`sk_test_`), never live credentials, plus an isolated test user and the test database.
- For a bug fix, add the regression test that would have failed before the fix.
- Stop local servers when done, and run `npm run test:db:down` after Docker integration tests.
- Run `git diff --check` before handing work back.
- Do not fix unrelated warnings during focused work; note them instead.

## Code style and conventions

- Next.js 14 App Router, React 18, TypeScript strict, Tailwind 3, Radix + shadcn-style components, `class-variance-authority`, `lucide-react`, react-hook-form + Zod.
- Dashboard route segments are Spanish (`pedidos`, `productos`, `atributos`, …) while their REST resources keep the established English API names (`/pedidos` uses `/api/{storeId}/orders`). Client mutations resolve the endpoint from a stable resource/model mapping, never from `usePathname()`.
- Per-resource folder shape when adding a dashboard resource:

  ```text
  app/(dashboard)/[storeId]/(routes)/<resource>/
  ├── page.tsx                        # server page
  ├── server/get-*.ts                 # server-only Prisma loaders
  └── components/
      ├── client.tsx                  # SWR/table wrapper
      ├── columns.tsx                 # TanStack Table definitions
      ├── cell-action.tsx             # row action menu
      └── [id]/components/*-form.tsx  # react-hook-form + Zod
  ```

  Most dashboard screens render from these server loaders, not from API routes. Changing what a screen shows usually means changing a loader.
- New navigation destinations go in `lib/admin-navigation.ts` (`NAV_GROUPS`, `SEGMENT_LABELS`), never into a second menu.
- Reuse the existing specialized inputs before adding a generic one: `CurrencyInput`, `PercentageInput`, `StockQuantityInput`, `CountInput`, `MeasurementInput`, `ImageUpload`, `Combobox` (beyond about eight options, instead of `Select`), `components/ui/date-field.tsx` (never a bare `<input type="date">`). If a domain input does not exist, create a reusable component from the installed primitives rather than styling a one-off control inside a route.
- The admin theme is **light only**; the palette has no dark variants. Do not reintroduce dark mode without restyling every surface.
- Chart colors come from `lib/chart-palette.ts`. No loose hex values in charts.
- Decorative Lucide icons carry `aria-hidden`; `Button` defaults to `type="button"`, so declare `type="submit"` on the one saving button.
- Every API route answers through `handleErrorResponse` (`lib/api-errors.ts`). A route with its own `catch` returning `error.message` leaks raw `ZodError` JSON and tends to pick one status for every failure. Do not reintroduce that pattern.
  - `.parse()` on a **request body** is safe: a schema failure becomes a readable 400 naming the field.
  - `.parse()` on **data read back from MySQL** is not: that is corrupt data of ours, not a bad request. Catch it and raise a 500 that says so (see `parseStoredSuggestionPayload` in `lib/catalog-migration.ts`).
- Spanish for all user-facing copy and error messages; English is fine in internal code and identifiers where already conventional.
- Commit messages: Spanish conventional commits (`fix(whatsapp): …`).
- `pdepapel-admin/.gitignore` ignores `*md`, so a new Markdown file here needs `git add -f` (or its own negation line) to be tracked.

## Critical operational context

Everything in this section is a guardrail. Each one exists because it already went wrong or would be unrecoverable.

### Deployment and Git

- **Never `git push` without explicit user approval.** A push to `main` auto-deploys both Vercel projects, which is a production deployment action. Work local-first, validate, then hand off. Commit and push are separate gates.
- **Deployment budget (2026-10-05, `docs/ops/2026-10-05-vercel-spend-diagnosis.md`).** Every push to `main` builds each project whose folder changed, and build CPU minutes were the largest Vercel cost. Batch commits locally and push **once per work block**; never push a docs-only or ops-only commit on its own unless it is needed now. The Ignored Build Step lives in `ops/vercel-ignore-build.sh` (called by `ignoreCommand` in both `vercel.json`): it skips a build when the project folder changed only in `docs/`, `ops/`, `scripts/`, `tests/`, `e2e/`, `.github/`, `*.md` or `*.log`, and builds on any doubt. Widen that list only with a replay against recent deployments. Build machines are fixed **Standard**; the on-demand budget is $15 with 50/75/100 % alerts. **Never enable Spend Management «Pause production deployments»**: it answers 503 for every project. Verified 2026-10-05: a push touching only this file and `docs/` skipped both builds («Canceled by Ignored Build Step»).
- **Never stage `.env*` files, scratch output, or local agent-instruction files** (`CLAUDE.md`) unless the user explicitly asks. The three `AGENTS.md` files are tracked and are updated in the same commit as the change they describe.
- `tmp/` and `outputs/` are gitignored scratch. `output/` (singular) is **tracked** and holds deliberate artifacts such as PDF guides; do not treat it as disposable.
- **If a change touches authentication or authorization, run two checks before asking for approval:**
  1. Every page or route that now calls `auth()`/`currentUser()` is in the middleware's route list (the public-route matcher here, `requiresServerAuth` in the store). Clerk throws outside its middleware, and the page answers 500.
  2. The assumption the change rests on is confirmed with a read-only query against production data, not read off the schema.

  Clerk throws outside its middleware and the page answers 500; and the data contradicts the schema in at least one known way — most production orders carry the **owner's** `userId`, because the owner registers WhatsApp orders on the customer's behalf, so «the order's user is the customer» is true in the schema and false in the data. One `SELECT` shows it. State both results in the approval request.
- After deployment, state the human follow-ups: migrations, Vercel variables, OAuth reconnect, webhook registration.

### Production database writes

The default credentials in `.env` are the read-only MySQL user `pdepapel_ro` (`SELECT`, `SHOW VIEW`), so any `--env-file=.env` script and a local dev server pointed at production can only read. The root URL lives in `.env.prod-write`, gitignored and not loaded by anything on its own.

- **Production data is only read through the read-only user.** Every read of production data uses `pdepapel_ro` from `.env`: run the script from `pdepapel-admin` with `node --env-file=.env <script>` (Prisma loaded with `createRequire` from this app's `package.json`, scripts kept in the session scratchpad, output limited to counts, ids and slugs — never customer PII). Never use `.env.prod-write` for a read.
- **Never disable the sandbox, not even for read-only database access.** Not the main agent and not a sub-agent. The documented read-only script above runs inside it; if it cannot reach Railway from the sandbox, stop and tell Christian instead of turning the sandbox off.

- A write runs through `npm run prod:write -- <script> --expect new|old [args]`, which requires a fresh approval token, a Railway host, a script under `scripts/` or the session scratchpad, and appends a line to the tracked `pdepapel-admin/ops/prod-writes.log`. Commit that log with the change.
- **`--expect new|old` is mandatory** (since the 2026-10 move to us-east4 there are two production databases). Before starting the script, the wrapper asks the target which database it is: the new one («MySQL US East») has the `migration_meta` schema, the old one (us-west2) does not. A missing `--expect`, a mismatch, or a user that cannot see the marker (no global SELECT, e.g. `pdepapel_ro`) refuses the run without spending the approval. The wrapper strips `--expect` from the script's arguments and passes it as `PROD_WRITE_EXPECT`.
- `.env.prod-write` holds the root URL of the **new** database. After the cutover, the old database's root URL lives only in `.env.prod-write.old-db` (git-ignored), which the wrapper uses only with `--expect old`: rollback, rotating the old credentials, or retiring it (`docs/runbooks/db-region-migration.md`).
- The approval token comes from `npm run prod:approve -- "<reason>"`, which **refuses to run without a TTY**, so an agent cannot mint it. One token, one use, 15 minutes.
- The token is consumed the moment the child process starts, whatever happens next, because a script that fails halfway may already have written.
- Scripts build Prisma through `scripts/lib/prod-client.mjs › createProdClient()`, which throws outside the wrapper and blocks `delete`/`update`/`upsert` on ledger models (`InventoryMovement`, `Order`, `OrderItem`, `PaymentDetails`, `Marketplace*`, `PaymentWebhookEvent`) unless the approved reason names the model.
- Production migrations use the same door: `npm run prod:migrate -- prisma/manual-migrations/<file>.sql --expect new`.
- **The standing rule outranks the tooling: any production write is asked for in chat first, every time.** The wrapper makes the ask mechanical; it does not replace it.
- **Never hand-edit production data as a substitute for a migration**, except for an explicitly approved, auditable repair procedure.
- **Production SQL that bypasses a domain guard** (delete checks, inventory helpers, payment state) **needs explicit approval in chat before it runs, every time.** Verification that creates ledger rows (stock intake, conversions, sales) runs against staging or the local Docker database; otherwise the disposable product is **archived and left in place** rather than deleted. Row counts before and after only prove the intended rows went away; they say nothing about rows nobody thought to count.

### Schema and migration protocol

The schema is `prisma/schema.prisma` (roughly 77 models) on MySQL at Railway.

- `relationMode = "prisma"` means **MySQL enforces no foreign keys** for these relations. Application code owns integrity, cascade-like behaviour and cleanup, and **every relation column needs an explicit `@@index`**. Preserve both conventions.
- Protocol: edit the schema → `npx prisma generate` → type/unit/integration tests locally → write reviewed SQL in `prisma/manual-migrations/` (dated file) → get explicit approval → apply to Railway deliberately → verify → record it in the operational docs. **There is no automatic production migration runner.**
- **Apply the migration before deploying the code that reads the new column.** This is not optional for `Store` columns in particular: `checkIfStoreOwner` does an unscoped `store.findFirst`, so Prisma names every scalar column, and `verifyStoreOwner` — which every admin mutation calls — would fail on an unknown column, taking the panel and the storefront's API down with it.
- **`Color.swatchType` (issue #3, migration `20261007_add_color_swatch_type.sql`) follows the same rule, and it takes the storefront down if broken.** `PUBLIC_COLOR_SELECT` names the column, so `GET /products`, `GET /colors`, product families and public orders all answer 500 against a database without it, and so does every un-selected `color.findFirst`. Order: apply the migration on the new database → deploy the code → run the backfill (`npm run prod:write -- scripts/backfill-color-swatch-type.mjs --expect new`, dry run by default, then `--apply`). The reverse direction is safe: the column is additive with a default, and the old client never selects it. `lib/color-swatch.ts` is byte-identical to the storefront copy (parity test in the store); the type is chosen in the colour form («Tipo de muestra») and is never derived from the name outside the one-off backfill map (`scripts/lib/color-swatch-backfill.mjs`).
- Never run integration tests or `prisma db push` against Railway.
- A product's live `stock` is never the authoritative historical quantity of an already-paid order. Order items and inventory movements are the audit record.

### The `VARIANT_CONVERSION` rollback trap

**A rollback of the variants-conversion work is not a plain `git revert`.**

With the pre-change Prisma client against a row of type `VARIANT_CONVERSION`: MySQL keeps the ENUM value after a code rollback, but the old Prisma client **throws** on any query that selects the `type` column of a row carrying that value (`Value 'VARIANT_CONVERSION' not found in enum 'InventoryMovementType'`), and **the whole `findMany` fails, not just that row**. `count`, selects that omit `type`, and `$queryRaw` still work; writes are unaffected.

In the pre-change code that breaks the Movimientos list (`movimientos-inventario/server/get-movements.ts`) for the entire store and the kardex of every product that went through a conversion (`get-product-kardex.ts`). The UI fallbacks (`typeLabels[type] || type`, `TONES[tone] ?? …`) are never reached, because the query itself fails.

So, to revert: **keep the enum value and its labels in the reverted schema and client** (`prisma/schema.prisma`, `lib/inventory-constants.ts`, `lib/kardex.ts`, the kardex filter), or first rewrite the affected rows to `MANUAL_ADJUSTMENT` keeping `reason` = «Conversión a variantes» and `referenceId`. That second path is production SQL and falls under the approval rule above.

The matching migration (`prisma/manual-migrations/20260918_add_variant_conversion_movement_type.sql`, an additive ENUM value) must be applied to Railway **before** deploying: if the code lands first, a conversion fails at the movement write and the whole transaction rolls back.

### Secrets and environment variables

- **Secrets never enter Git, this repository's docs, terminal history, screenshots, email or chat.** `.env*` files, Vercel environment screens, Railway connection strings, OAuth secrets, signing keys, payment keys and encryption keys are all secrets. Ask in chat before reading a production secret, even read-only.
- **Never run `vercel deploy` (or `vercel`, `vercel --prod`) from the local working tree.** The CLI uploads every file on disk that `.vercelignore` does not exclude, including `.env`, `.env.prod-write` and other untracked secrets (incident 2026-10-06: `docs/ops/2026-10-06-incidente-env-subidos-a-vercel.md`). Deploys go through git only. To force an admin build that the Ignored Build Step would skip, change the one line in `pdepapel-admin/deploy-stamp.txt`, commit and push (with the usual push approval).
- A Mercado Libre client secret was leaked previously and must be treated as compromised: rotate it, update Vercel, redeploy, then reconnect from the admin UI.
- **Never run `vercel env rm` / `vercel env add` or edit variables in the dashboard without explicit per-variable approval.** `vercel env rm NAME` with no environment argument deletes the variable from **all** environments, and deleted values are unrecoverable, and a deleted analytics or feature key does not fail anything — the feature just goes dark until someone notices. To scope a variable, re-add it for the environment you want; never delete first.
- Add mandatory new variables to `lib/env.mjs` or the build fails. **Never `NEXT_PUBLIC_`-prefix a secret.**
- `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY` and `CLOUDFLARE_R2_BUCKET_NAME` (admin project only) point at the **private** bucket that holds payment-proof photos. All four are optional on purpose: without them the fair sale hides «Adjuntar comprobante» and the proof routes answer 503; nothing else changes. The R2 API token should be scoped to that single bucket with object read/write only.
- `MERCADOLIBRE_TOKEN_ENCRYPTION_KEY` must stay stable: changing it makes every stored token unreadable.
- `REVALIDATION_SECRET` must be an **identical single printable line** in both Vercel projects: no quotes, spaces or embedded newlines.
- Mercado Libre and QStash variables belong **only** to the admin Vercel project, never the storefront's.
- Production environment changes need a new deployment to take effect.

### Authorization

- Clerk `middleware.ts` marks **every `/api/*` path public** and applies a CORS allowlist (`lib/cors.ts`). Authorization is enforced **inside each handler**. A new admin-only endpoint without that check is publicly writable.
- Order of operations in a dashboard handler, before reading the body: `auth()` → 401 without a session, then the store-ownership check → 403 for a signed-in customer of another store. The storefront and the panel share one Clerk instance, so **every shop customer already has a session on the panel's domain**.
- `lib/store-access.ts` is the authorization core: `requireStoreOwner` (writes and sensitive reads), `requireStoreRead` (owner **or** a read-only account), `getStoreAccess` (non-throwing, for UI), `requireAdminSession`, `parsePanelMetadata`. Ownership comes from `Store.userId` and is resolved **before** Clerk metadata, so an owner can never be downgraded by metadata; a read-only account is declared in Clerk `publicMetadata` as `{ "role": "viewer", "allowedStoreIds": [...] }`, and any unexpected shape fails closed.
- `hasAdminAccess` / `canCreateStore` (`lib/admin-access.ts`) gate panel access and store creation; creating a store requires being listed in `ADMIN_ALLOWED_USER_IDS`.
- **Add every new dashboard-only handler to the table in `tests/integration/api-authorization.test.ts`**, which loads each handler with a stranger's session and an anonymous request and asserts 403/401.
- `tests/unit/security/write-auth-scan.test.ts` fails if a mutating route under `/api/[storeId]` or a side-effecting server action loses its owner guard. Exceptions are listed one by one with a reason; add a new one only deliberately.
- **Public routes return data only through the public selects.** Every unauthenticated GET that returns a model uses an explicit `select` from `lib/public-catalog.ts` or `lib/public-orders.ts`, never `include` or a bare `findMany` on `Product`, `Order`, `Review` or `Supplier`. An `include` returns every scalar, which is how acquisition cost, transportation cost, supplier id, order tokens, internal notes and profit fields were once public. A column added to `Product` or `Order` stays hidden until someone adds it to a public select on purpose.
- `CUSTOMER_ORDER_SELECT` is the customer's-own-order shape and still carries full contact data. It is not a safe fallback for a read-only account.
- Field scrubbing for read-only accounts lives in `lib/viewer-payloads.ts`. Scrubbing breaks components that assumed a field exists, so every screen opened to a new role has to be **viewed**, not only route-tested.

### Payments and webhooks

- **Bold** is the default gateway, **Wompi** the fallback, **PayU** legacy and deprecated. Customer-facing text stays provider-neutral: **`Pago en línea`** (keep useful payment icons; this is about text).
- Webhook processing must be **idempotent** and must validate the provider's authenticity and state before changing an order. **Never mark an order paid from a client redirect.**
- **Bank transfer reaches `PAID` only after manual admin verification.**
- **Payment-proof photos** (fair sales paid by transfer) are stored in a private Cloudflare R2 bucket, never in Cloudinary and never as a public URL. `PaymentDetails.proofKey` holds only the object key (`comprobantes/<storeId>/<uuid>.<ext>`); `lib/payment-proofs.ts` is the **only** module that talks to the bucket; the panel serves the image by streaming it through `/api/[storeId]/orders/[orderId]/payment-proof` with an owner session (`private, no-store`), and read-only accounts never receive the key (`scrubOrder`). A proof uploaded for a sale that is then abandoned is deleted; one attached to a registered sale is never deleted from the panel.
- `paidAt` is written only when an order genuinely becomes paid, never during an unrelated update, and never adjusted to satisfy a tax report's date range.
- Provider webhooks validate the already stored method and must never silently convert a bank-transfer order to an online payment.
- `updateMany` with a status guard is **only atomic inside an explicit `$transaction`**. Prisma compiles it into a `SELECT` then an `UPDATE … WHERE id IN (?)`, so outside a transaction the guard is evaluated by the read, and concurrent deliveries of one webhook all claim it and process the same event. Queue claims that cannot sit in a transaction use `claimQueueRow` (`lib/atomic-claim.ts`). The same applies to `stock: { gte: n }` guards.

- **Background work after the response goes through `runInBackground` (`lib/background.ts`, `waitUntil` from `@vercel/functions`), never `setImmediate`/fire-and-forget.** Vercel does not wait for a `setImmediate`: on 2026-10-07 an idle instance froze mid-send and a new-order email was lost (`docs/ops/2026-10-07-incidente-correo-pedido.md`). A guard test fails on any `setImmediate` under `app/api` or `lib`.
- **Order emails** (`sendOrderEmail`, `sendShippingEmail`) send admin and customer independently through `lib/email-delivery.ts`. A Resend `{ error }` is a failure, network/429/5xx are retried twice inline, and each recipient that is not reached gets its own `FailedNotification` row (`recipient` = `admin` or `customer`, never the address). `/api/cron/notification-retry` (in «Admin scheduled tasks») resends rows from the last 48 h, at most 4 attempts per order + kind + role, claiming each row with a single `UPDATE … WHERE resolvedAt IS NULL`.
- **EnvioClick guides created in the background** use `createGuideInBackground` (`lib/guide-background.ts`). A failure is written to `Shipping.guideError` (shown on the order) and a `GUIDE` failure row, and is **never retried automatically**: a guide is paid when created.

### Gift orders

- An order has **one identity**: `email`, `fullName`, `phone` and `documentId` are always the **buyer** (account claims, welcome benefit, Clientes, DIAN, reactivation). Never repoint them at a recipient. The recipient of a gift lives in `isGift`, `giftRecipientName`, `giftRecipientEmail`, `giftRecipientPhone`, `giftMessage` (migration `20260928_add_gift_orders_and_gift_cards.sql`, shared with the gift-card tables).
- **A favorite can be a family.** A product group has no row of its own: the grouped catalog returns a representative variant flagged `isGroup`, so a group saved from a card is stored as that variant's id plus `CustomerWishlistItem.savedAsGroup = true` (migration `20260929_add_customer_wishlist_saved_as_group.sql`). The account wishlist PUT accepts `items: [{ productId, savedAsGroup }]` and still accepts bare `productIds`; an existing row's flag follows the latest sync. The storefront refreshes families through `GET /products?groups=<productGroupId,…>` (`lib/product-families.ts`, uncached like `ids=`), never through `ids=`, which deliberately returns loose variants with `isGroup: false`. Both live branches send `no-store` last so the catalog's `Cache-Control` cannot override it.
- All gift rules are in `lib/gift-orders.ts`: `normalizeGiftFields` (the three order-writing routes use it; with the flag off every field is null, so a non-gift order never stores a third party's data), `getShippingContact` (the EnvioClick destination name and phone are the recipient's; the destination email stays the buyer's) and `getGiftNotificationEmail` (null when the recipient address is the buyer's own).
- **The buyer always gets the full receipt.** The recipient gets `emails/gift-notification.tsx` only: no items, prices, totals, order number or order link, and never on `PENDING` (a gift is announced only once the payment exists) and again on every shipping update with the guide. A failed recipient email is recorded as `gift:<status>` and never blocks the buyer's email.
- `giftRecipientEmail` and `giftRecipientPhone` are internal fields: not in `CUSTOMER_ORDER_SELECT` (the public order page shows only the name and message) and scrubbed for read-only accounts.

### Gift cards

- **Models:** `GiftCard` (only `codeHash` sha256 + `codeLast4`; no plaintext, no encrypted copy), `GiftCardMovement` (the ledger), `GiftCardDenomination`; `Order.type GIFT_CARD` for the purchase, `Order.giftCardId`/`giftCardAmount` for the redemption, `PaymentMethod.GiftCard` for an order fully covered. Both enum values carry the `VARIANT_CONVERSION` rollback trap: a revert must keep them.
- **`balance` is a cache of the ledger.** Every balance write goes through `applyGiftCardMovement` in `lib/gift-cards.ts`: `SELECT … FOR UPDATE` on the card, a guarded `UPDATE … WHERE balance + delta >= 0`, and one movement with `balanceAfter` and a unique `idempotencyKey` per fact (`issue:<orderId>`, `hold:<orderId>`, `redeem:<orderId>`, `release:<orderId>`, `reverse:<orderId>`, `void:<orderId>`). Never increment or decrement `balance` directly; tests assert `sumGiftCardLedger === balance`.
- **Lifecycle:** ISSUED when the purchase order becomes PAID (`issueGiftCardForOrder`, called inside the payment transaction by both webhooks, the panel PATCH, panel POST and bulk PATCH; the code exists only in memory and is mailed by `lib/gift-card-delivery.ts` right after commit, to the recipient email or the buyer). HELD inside the checkout transaction (coupon first, card on the remainder; `Order.total` is untouched, the gateway signs and both webhooks check `getAmountDue(order)`); a zero remainder is born PAID with method `GiftCard` and `settleFullyCoveredOrder` applies the same side effects as the Bold webhook. REDEEMED when the order is paid; RELEASED/REVERSED from every cancel path through `handleGiftCardOnOrderCancellation` (Bold, Wompi, single PATCH/DELETE, bulk PATCH/DELETE). Cancelling the **purchase** order voids an unused card and is refused once the card was used; a purchase order that issued a card cannot be deleted, only cancelled. «Reenviar correo» = reissue: VOIDED + REISSUED in one transaction, new hash, old code fails immediately.
- **Revenue:** a `GIFT_CARD` purchase is a liability, not revenue. Every report sums through `revenueOrderWhere()` / `isRevenueOrder` (`lib/revenue-orders.ts`): status PAID or SENT **and** type not `GIFT_CARD`. Redemption orders count at full `total`. `calculateOrderFinancials` charges the gateway fee on the amount actually charged and gives a card purchase no product cost or profit. The integration test `gift-card-revenue-exclusion` asserts every site by name.
- **Holds:** `GET /api/cron/gift-card-holds` (bearer `CRON_SECRET`, daily from `admin-scheduled-tasks.yml`) releases holds of cancelled orders and of orders unpaid for more than `GIFT_CARD_HOLD_DAYS` (7). A missed day only keeps a hold longer; paying late re-holds (`redeemGiftCardForOrder`) and refuses with a message if the balance is gone.
- **Public surface:** `POST /gift-cards/validate` is rate-limited per IP and per code (`lib/rate-limit.ts`) and answers balance and last four only; `GET /gift-cards/denominations` is public; the admin list/detail never return the hash; read-only accounts get no customer emails.
- **Legal:** `expiresAt` defaults to null. Confirm the minimum validity for Colombia before enabling expiry; `GIFT_CARD` orders are not invoiced.

### Inventory

- Apply every stock change through the centralized helpers (`lib/inventory.ts`) and write an `InventoryMovement` for every meaningful adjustment. `InventoryMovement` is the auditable ledger and has accounting meaning.
- Guard availability atomically. A delayed payment confirmation or a marketplace retry must never subtract stock twice.
- **A paid order's line items are historical snapshots.** Never show a past purchase as unavailable because current stock hit zero.
- Kits explode into components on **both** the decrement and the return. If only one side does it, cancelling a kit order inflates inventory.
- Point-of-sale sales go through `lib/point-of-sale.ts`, which expands kits, atomically decrements every required product, creates the paid order and its movements in one transaction, recalculates kits and queues marketplace stock sync. Do not replace it with resilient or partial updates. A sale can be undone within 30 minutes of `paidAt`; after that, use an auditable return or manual adjustment.
- The generic order `PATCH`/`DELETE` routes refuse `POINT_OF_SALE` and `FESTIVAL` orders (`lib/in-person-orders.ts`), because their restock path would re-add units the fair never subtracted.
- Fairs reserve stock before the event, keep one unique QR per capsule, and **closing a fair event is irreversible**.
- A **kit is reserved as a kit**: one fair row for the kit product, the component units leave `Product.stock` with one `FESTIVAL_ALLOCATION` per component (never against the kit, whose stock is derived), and the recipe is frozen in `FairEventKitComponent`. Sale, cancel and close read that snapshot: a kit line costs Σ component `acqPrice × quantityPerKit`, cancel touches only the kit row's `soldQuantity`, and close writes one `FESTIVAL_RETURN` per component for the returned kits. Reserving more of a kit whose live recipe no longer matches the snapshot is refused (409) until the fair closes; kits are never packed into capsules.
- **Surprise capsules are ordinary `Product` rows**, not `FairCapsule` rows and never `isKit` (`recalculateKitStock` derives kit stock from components and would overwrite a packed count). Their stock enters through `packCapsules` (`lib/capsule-batches.ts`), a two-sided transfer that mirrors `VARIANT_CONVERSION`: sources down, capsule up, both movements typed `CAPSULE_PACKED` and linked by the batch id. A batch validates every line before touching anything — a half-packed batch leaves units subtracted from the warehouse that are inside nothing. `unpackCapsuleBatch` reverses it only while the capsule's stock still covers the whole batch; once one capsule is sold, reversing would invent stock.
- The capsule product must sit in the «Kits sorpresa» category (`CAPSULAS_SORPRESA_ID`). That category is what keeps capsules out of stock listings via `EXCLUDE_BUNDLE_PRODUCTS` (`lib/catalog-filters.ts`) — their units were already counted when the batch was packed, so counting them again double-counts. The four call sites are asserted by `tests/unit/lib/catalog-filters.test.ts`; the previous hardcoded ids pointed at categories that never existed, so the filters silently excluded nothing for months.
- A kardex mismatch between `Product.stock` and the latest movement's `newStock` means something wrote `stock` outside `lib/inventory.ts`. Fix it with a movement, never by editing `stock` or a movement by hand.
- Product forms may set initial stock only for a **new** variant. Saving an existing product must never derive a movement from submitted form stock.
- Restock receipts are idempotent through `RestockOrderReceipt` and a client-generated key; a replay answers 409 and stock stays put. Restock order numbers come from the highest existing number plus one, never `count + 1`.

### Pricing

- **One server-side price resolution, used everywhere money is charged**: `priceLines` (`lib/product-pricing.ts`) resolves base price, the best active `Offer` and the matching `ProductPriceTier` rung, and keeps **the lowest of the three**. A tier and an offer are **never** stacked — chaining them is how you sell below cost without noticing.
- The pure math lives in `lib/price-tiers.ts`, which is **byte-identical in both apps**. The storefront computes the cart total in the browser while the shopper changes quantity; the admin checkout recomputes it on the server when charging. If the two drift, the customer sees one price and is charged another. `pdepapel-store/tests/unit/lib/price-tiers-parity.test.ts` fails the moment one copy is edited alone — copy the file, don't patch one side.
- A tier is chosen by the **total quantity of that product across the cart**, not per line, so "5 + 5" costs the same as "10".
- Charging paths wired to `priceLines`: storefront checkout, panel orders, and point of sale (which re-asks `POST /point-of-sale/price` instead of multiplying client-side). Listing, search, wishlist and feed prices deliberately stay at quantity 1 — **feeds publish the x1 price only**; tiers are not representable in Merchant/Meta/ML exports.

### Product identifiers

`sku` (internal, scannable), `gtin` (a real GS1 barcode) and `mpn` (a real manufacturer code) are three different things. **Never invent a GTIN.** If a product has no legitimate one, set the "no product identifier" flag so Google Merchant still accepts it. A barcode scanner can read an internal SKU label; the GTIN field is not a generic barcode-label field.

### Mercado Libre

- Marketplace price and shop price are **deliberately decoupled**. Never auto-overwrite one from the other.
- Local stock is the source of truth: a listing's available quantity is local stock minus its safety buffer.
- **A publication import is not a sale.** Do not create orders or movements for it.
- A paid marketplace sale applies inventory **exactly once** and records the **net actually collected**. If billing detail is unavailable or unsettled, keep `Liquidación pendiente` and retry through the outbox — **never substitute gross as income**.
- **Never automatically restock on a cancellation or return**; a human confirms the physical return first.
- Never guess a product ↔ listing mapping; require human confirmation when the SKU is absent or ambiguous.
- QStash delays need explicit units (`"30s"`, `"5m"`), never a bare number.
- Historical reconciliations tagged `metadata.source === "HISTORICAL_RECONCILIATION"` are protected from automatic overwrite. Never reconcile an already-manually-discounted sale: that double-decrements stock.
- An unknown acquisition cost is **never zero**; report cost, profit and margin as unknown instead of manufacturing a 100% margin.
- Never edit marketplace order stock or financial fields in the database to "fix" a queue issue. Fix and retry the audited workflow.
- Reconnect from the admin UI after any scope, secret or token change.
- The account is a **User Products seller** (`user_product_seller`).
  - Items carry `family_name` and never `title`; ML rejects a title-only body.
  - Variants are separate items that share one family name.
- Publishing goes through «Validar con Mercado Libre» first.
  - `POST …/listings/[id]/validate` sends the exact publish payload to `/items/validate`, which creates nothing.
  - «Publicar ahora» stays disabled until a passing validation of the current form.
  - ML answers 400 even when it only has warnings; treat warnings-only as valid (`readMercadoLibreValidation`).
- Category attributes:
  - Keep the `hidden` ones the seller must send, i.e. `required` or `conditional_required` (`EMPTY_GTIN_REASON`).
  - Every required, conditional or catalog attribute gets its own wizard field.
- Barcodes:
  - A product without a barcode sends `EMPTY_GTIN_REASON`, «No registrado» (17055160) or «kit o pack» (17055159).
  - Registered brands still require the real GTIN.
  - Never invent a brand. «Genérica» is suggested only where the category accepts it.
- Margin in the wizard:
  - Never default the ML price to the store price. On this account free shipping is mandatory at every price; the seller pays about 8,100 per unit.
  - As of 2026-10-08, Clásica is 16 % with no fixed fee, and withholdings are about 1.5 % (estimated from real billing). These change; the wizard reads the live fee from `listing_prices`.
  - `lib/mercadolibre/listing-margin.ts` suggests the friendly price that keeps the target net.
  - The store-wide target margin is not built yet: it needs a `Store` column (migration).
- The wizard loads every product photo in gallery order (`…/listings/product-photos`, which keeps the cover first). It checks the copy ML downloads against 500 × 500 px. `lib/catalog-image-url.ts` is client-safe; never import `lib/google-merchant.ts` into client code (it pulls `sanitize-html`).

### Boletín: subscribers, issues and campaigns

The newsletter has **one sender**, `lib/newsletter-campaigns.ts`. Everything that mails subscribers goes through its `sendInBatches` helper — Resend `batch.send` in batches of 100, `List-Unsubscribe` plus `List-Unsubscribe-Post: One-Click` headers on every message, and recipients read from `activeSubscribers()`, which only returns `ACTIVE` subscribers that hold an `unsubscribeTokenHash`. **Never add a second sender**: a path that skips these headers or that consent filter breaks one-click unsubscribe and the double opt-in guarantee.

- **Models.** `NewsletterSubscriber` is unchanged and still owns consent. Added alongside it: `NewsletterIssue` (the magazine, unique on `[storeId, slug]`), `NewsletterIssuePage` (one image per page, ordered by `position`), and `NewsletterCampaignSend` (the send ledger). `NewsletterIssueStatus` is `DRAFT | SENT`.
- **A sent issue is immutable.** `updateNewsletterIssue` and `deleteNewsletterIssue` reject anything already `SENT` with a 409. The mail is out and `/boletin/<slug>` has to keep showing what people received.
- **`NewsletterCampaignSend` is written by all three kinds**, not just the new one. Before it, a send left only a timestamp on the home-content row (`earlyAccessSentAt`, `arrivalSentAt`) and there was no way to know how many people it reached. `recordSend()` takes `kind` as a plain string; the union type `NewsletterCampaignKind` still covers only `"early-access" | "arrival"`, and the magazine records the literal `"issue"`.
- **API.** `GET /api/[storeId]/newsletter/issues` serves the owner's list, or one public issue when called with `?slug=`; `POST` creates. `PATCH`/`DELETE /api/[storeId]/newsletter/issues/[issueId]` edit a draft. `POST /api/[storeId]/newsletter/issues/[issueId]/send` mails it and carries `maxDuration = 60`, like the campaigns route.
- **Public route.** The storefront renders `/boletin/[slug]` with `revalidate = 300`. Only `SENT` issues resolve; a draft 404s so a half-built magazine cannot leak by guessing the URL.
- **Pages are images, never attachments.** An attachment on a bulk send is a textbook spam signal, and the sending domain is shared with order confirmations. The cover rides inside the email; the remaining pages live on the storefront. `MAX_ISSUE_PAGES` caps an issue at 12.
- `MAX_ISSUE_PAGES` lives in `lib/newsletter-issues-shared.ts`, a neutral module, because `lib/newsletter-issues.ts` imports `server-only` and the client panel needs that constant. Importing it from the `server-only` module makes the page fail at render time only.
- `sendInBatches` returns early when `NODE_ENV === "development"`, so no local or test run can mail a real subscriber. `scripts/with-test-env.mjs` forces `NODE_ENV=development`, which is why the guard also holds during integration tests.

### Catalog cache and revalidation

- After catalog mutations the admin calls the storefront's `POST /api/revalidate` (`lib/revalidate-store.ts`). **A successful database write with a stale public page is still a customer-visible defect — verify both.**
- Vercel Firewall on `pdepapel-store` must not challenge `/api/revalidate`. Bot Protection set to «Challenge» answers 429 before the route runs and the catalog stays stale silently. Keep a Bypass rule for that path.
- Never delete slug aliases (`ProductSlugAlias`, `CategorySlugAlias`) or existing redirects without a deliberate SEO plan. Archived products redirect on the storefront to a live sibling, else their category, else their type, else `/tienda` (`lib/archived-product-redirect.ts`, policy change 2026-10-05); a product that never existed still returns `404`. A **hard-deleted** product keeps its URLs too: a grouped variant with a live sibling hands its slug and aliases to that sibling; otherwise every delete path (single, bulk, group variant removal, group delete with variants) first writes its slug, aliases and id to `DeletedProductUrl` (`lib/deleted-product-urls.ts`, migration `20261005_add_deleted_product_url.sql`), and the same resolver sends them to a live sibling or the category. Any new hard-delete path must call `recordDeletedProductUrls` before deleting. A merged subcategory keeps its URL as an alias of the target.
- Bump `PUBLIC_PRODUCTS_CACHE_VERSION` whenever the public product shape changes (and the `v` key of the `GET /products` cache key with it). Last bump: `v5`/`"11"` for `color.swatchType` (2026-10-07).

### Images

One frozen Cloudinary transformation per app (`f_auto,q_auto,c_limit,w_≤1600`); this app uses the global `images.loaderFile`. Every distinct transformation and width is a derived copy that is stored forever and billed, so **do not add loaders, `quality` values, crops or wider `deviceSizes`**. Widths snap to `CLOUDINARY_DELIVERY_WIDTHS`. **Never purge derived copies before a width-matrix reduction is actually live** — purging first makes the catalog regenerate every copy under the old matrix, which is the overage. Runbook: `docs/imagenes-cloudinary.md`.

**Group and variant photos.**
- Each group photo stores its distribution in `Image.scope` (`all`, `COLOR|id`, `DESIGN|id`, `COMBO|color|diseño`).
- Each variant photo stores its origin in `Image.origin`: `OWN`, `GROUP_COPY` or NULL (pre-#13 rows, treated as own).
- On every save, the group appends the photos that apply to each variant after its own photos (`lib/variant-gallery.ts`, rule in `lib/variant-images.ts`). It only ever creates or deletes `GROUP_COPY` rows: own and NULL rows are never removed by the distribution.
- Each variant keeps exactly one cover.
- Galleries read in `GALLERY_ORDER` (cover, `createdAt`, `id`), so NULL and OWN sort alike. Writes keep group copies as the newest rows, which places them after the own photos.
- A product's own page keeps the group's copies and shows them as «Del grupo».
- A variant that leaves its group turns its copies into own photos.
- A variant that switches to another group drops the old copies and gets the new group's distribution. If that would leave it with no photos, the old copies stay as own.
- The group editor keeps the two kinds of photo apart (#17):
  - «Fotos del grupo» shows only group photos. The 8-photo cap counts only those.
  - «Fotos propias de cada variante» shows each saved variant's own photos. The variant payload carries them in `images`, and its explicit cover choice in `coverUrl`, which wins over the current cover.
  - Removing a photo in either section changes what is saved. Deleting a group photo that a variant also holds as own asks whether to drop those own rows too.
  - An own photo that the group also delivers to that variant has no trash button there, because it would come back as a copy.
  - Never merge variant photos back into the group gallery: deleting them there would do nothing, which was the bug in #17.

### Scheduled work and database pool

- Vercel's plan allows **only two crons and both are used** (`update-coupons`, `update-offers`, daily in `vercel.json`). New scheduled jobs go into `.github/workflows/admin-scheduled-tasks.yml` with the `CRON_SECRET` bearer token. Do not add Vercel crons.
- Long external work goes through QStash and Upstash Redis, never a synchronous handler. API handlers have a 60-second ceiling.
- Each Vercel instance holds its own Prisma pool, capped in code at `connection_limit=3` (`lib/prismadb.ts`). Do not raise it without recomputing instances × limit against Railway's `max_connections`.

### Accessibility, UX and responsiveness

- Spanish is the default for all admin UI copy.
- Verify every change at **390 / 768 / 820 / 1280 / 1440** with real device emulation, and check **both** page-level and container-level overflow. A page-level measure (`document.documentElement.scrollWidth === innerWidth`) only proves the page does not scroll sideways; it does not see a table wider than its own `overflow-x-auto` card.
- Do not place text over imagery without a tested contrast layer. Keep controls keyboard-accessible with explicit labels.
- Keep Tiptap product HTML sanitized; never render unsanitized external HTML with `dangerouslySetInnerHTML`.
- Remove stale "Próximamente" copy once a feature is active.
- Prefer clear empty, pending, retry and error states over neutral cards that look successful while reporting a failure.
- Admin routes are private and must stay non-indexable.
- `@react-pdf/renderer` components load with `next/dynamic` + `ssr: false`; a plain import renders `undefined` and crashes the screen.
- `router.refresh()` remounts the whole client tree under `(routes)`. Anything that must survive it needs its own persistence.

### Documentation duties

When a module's behaviour or copy changes, update **both** the Spanish guide `docs/guia-panel-administracion.md` and the in-dashboard manual (`content/manual/manual.html`, served at `/manual` behind auth) in the same commit. Manual screenshots come from the test store, never from production data.

## Common failures and their first response

| Symptom | Most likely cause | Safe first response |
|---|---|---|
| A storefront page lacks data | Admin API, server environment or upstream endpoint | Check the admin API response and Vercel logs before touching storefront UI. |
| Catalog changes do not appear publicly | `REVALIDATION_SECRET` mismatch or invalid header, or stale ISR | Verify the identical single-line value in both Vercel projects and inspect `/api/revalidate` logs. |
| Revalidation alert says `429`, and the store logs show no call | Vercel Firewall on the store is challenging the server-to-server call | Add a Bypass rule for `/api/revalidate` or set Bot Protection to «Log». |
| Admin redirects in a loop | Clerk session, cookie, domain or middleware configuration | Inspect `middleware.ts`, the public route matchers, Clerk URLs and cookies. Do not clear auth logic blindly. |
| An order is paid unexpectedly | Webhook, manual update or payment-state bug | Audit the provider event, signature, payment details, admin actions and `paidAt`. Do not infer from current stock or a redirect URL. |
| A paid order shows unavailable products | The UI reads current stock instead of the order snapshot | Fix the presentation to preserve historical order truth. |
| A Mercado Libre sale lacks a net amount | Billing scope or token missing, or settlement not yet available | Verify the billing-read scope, reconnect, inspect the outbox. Leave net pending and retry; never substitute gross. |
| A Mercado Libre queue error mentions duration | A QStash delay has no time unit | Use `30s`, `5m`, `6h`. |
| A listing returns to DRAFT with a message | Mercado Libre rejected a field | Open «Editar»: the wizard lands on the rejected step. Fix it and publish again; never retry blindly. |
| A marketplace sale would decrement twice | Manual reconciliation plus the automatic process, or a non-idempotent retry | Inspect `MarketplaceOrder`, inventory status and the webhook/outbox keys before doing anything. |
| A fair created an online stock mismatch | Stock was never reserved or reconciled | Reserve before the event, or use the approved reconciliation template afterwards. |
| A shipment says «Entregado» but the order still says «Pagado» | A writer bypassed `applyShipmentStatus` (`lib/shipment-status.ts`) | Route the write through the helper; it moves the order and refuses to revive a cancelled one. |
| A restock receipt counted twice | The receipt was replayed without its idempotency key | Check `RestockOrderReceipt`; fix stock with a manual adjustment referencing the order and keep the key stable per dialog opening. |
| Admin answers 503 «La base de datos está ocupada» (`P2024`) | Instances × `connection_limit` hit MySQL `max_connections` | Check `Max_used_connections` on Railway and raise `--max-connections` before touching `connection_limit`. |
| A production build fails after an env change | Strict env schema or configuration mismatch | Update `lib/env.mjs` only when the variable must be mandatory, and verify every Vercel environment. |

## Known gaps, deliberately left open

Each was found during an audit, judged not worth the change at the time, and recorded so the next pass starts from what is already known.

- The outbox and WhatsApp queue claims have no concurrency test of their own. They use the same `claimQueueRow` helper that is covered against a real database for the Mercado Libre webhook processor, so the mechanism is tested but neither caller proves its own wiring.
- **Two people share one Clerk account**, and there is no role or membership table: `Store.userId` is a single owner string. Separation of duties is not expressible, and every `createdBy` / `releasedBy` attribution records the same identity. This is an open product decision, not a pending code change.
- **No rate limiting anywhere** except the per-customer order gap in checkout and the fixed-window quote limit. `/shipment/quote` is public and calls the carrier on a cache miss, so varying the destination turns an anonymous request into a paid external call.
- Failed notifications are recorded (`FailedNotification`) but never retried and never alerted on; someone has to look. The Mercado Libre queues are the shape to copy when this is worth finishing.
- `getPositiveNumber` accepts non-integer quantities from Mercado Libre, so a hypothetical `1.5` would reach the stock decrement. Mercado Libre does not send fractional quantities today.
- Read-only accounts: 24 reads and 5 server loaders stay owner-only by design (suppliers, conversations, shipments carrying contact data). The axios write-interceptor is a convenience, not a security boundary, and does not cover the roughly 39 sites that mutate with `fetch`.
- The `dian`, `envioclick` and `mercadolibre` webhooks do not verify a provider signature; Bold and Wompi do. Mercado Libre re-fetches the resource before acting.
- `MarketplaceWebhookEvent` has no retention policy for `MERCADOLIBRE` rows.

## Definition of done

Compiling locally is not done. For production-impacting work:

1. The root cause is addressed within the architecture and business rules above.
2. Relevant tests pass and a regression test covers the previously broken behaviour.
3. Responsive, SEO, cache, inventory and payment impacts were considered for the changed surface.
4. No secrets, scratch files, unrelated changes or local agent-instruction files are staged.
5. Migrations and console actions (Vercel variables, OAuth reconnect, webhook registration) are documented as plain steps.
6. Local servers and test containers are stopped.
7. The user has explicitly approved any push.
8. Post-deploy webhook/OAuth/cache/smoke verification is done or clearly handed to the owner.

## Where to read more

- `../pdepapel-store/AGENTS.md` — the storefront: routing and SEO policy, ISR, checkout UX, analytics and consent.
- Shared guidance in `../docs/`: `testing.md`, `revalidacion-catalogo.md`, `seguimiento-seo.md`, `analitica-microsoft-clarity.md`, `imagenes-cloudinary.md`, `opciones-catalogo-clientes.md`, `plan-naming-productos.md`.
- Runbooks in `docs/`: `mercadolibre.md` (application, OAuth, QStash, webhooks, listings, reconciliation), `guia-uso-mercadolibre.md`, `ventas-en-feria.md`, `conciliar-inventario-feria-anterior.md`, `punto-de-venta.md`, `capsulas-sorpresa.md`, `reportes-tributarios.md`, `negocio-y-crecimiento.md`, `acceso-solo-lectura.md`, `google-merchant.md`, `nombres-productos.md`, `guia-panel-administracion.md`.
