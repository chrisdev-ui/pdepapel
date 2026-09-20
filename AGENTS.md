# AGENTS.md — P de Papel monorepo

Instructions for AI coding agents working anywhere in this repository. This is the cross-application orientation layer. Each application has its own durable handoff document, and that one wins when you need depth or the two disagree:

- [`pdepapel-admin/AGENTS.md`](pdepapel-admin/AGENTS.md) — dashboard, REST API, Prisma schema, database, payments, inventory, Mercado Libre, migrations.
- [`pdepapel-store/AGENTS.md`](pdepapel-store/AGENTS.md) — storefront, routing and SEO policy, ISR, checkout, analytics.

Together they replaced `docs/AI_AGENT_CONTEXT.md`. Keep all three current: update the relevant one in the same commit as any material architecture, operations, routing, payment, marketplace or deployment change.

## What this project is

**P de Papel** (`papeleriapdepapel.com`) is a Colombian e-commerce business selling kawaii stationery, gifts, creative supplies and accessories. It serves customers in Colombia, so the product is **Spanish-first**: all customer- and admin-facing copy, navigation, SEO, product content and route segments are Spanish.

Business priorities, in the order they matter:

- Keep inventory trustworthy across the online shop, in-person sales, fairs, surprise capsules and Mercado Libre.
- Keep a polished, playful, accessible experience without sacrificing clarity, contrast, performance or mobile usability.
- Keep financial and tax reports auditable. Online orders, fair sales, marketplace sales and supplier purchases need distinct and correct records.
- Keep customer-facing payment language provider-neutral. The public label is **`Pago en línea`**.
- Protect existing customers and search ranking. The storefront already migrated from ID/English routes to Spanish slug-based canonical URLs, and the old URLs must keep redirecting safely.

## Repository topology

This is a **two-application repository, not an npm workspace**. There is no root `package.json`. Each application has its own dependencies, lockfile, Next config, test configuration and Vercel project.

**Every npm command runs from inside one application folder, never from the repository root.**

| Folder | Role | Dev port | Database | Production domain |
|---|---|---:|---|---|
| `pdepapel-store/` | Public customer-facing storefront | `3000` | **None**; calls the admin API | `papeleriapdepapel.com` |
| `pdepapel-admin/` | Admin dashboard **and** the whole REST API, Prisma schema, database owner, webhooks, cron | `3001` | Direct via Prisma/MySQL | `admin.papeleriapdepapel.com` |

Runtime baseline is **Node 24** (`.nvmrc`, both `engines`, CI and Vercel all agree). Do not lower it without a reviewed compatibility plan.

Both Vercel projects auto-deploy when `main` receives a push, so **a push to `main` is a production deployment action**.

### The critical architectural rule

**The storefront never talks to MySQL.** It reads and writes only through REST endpoints exposed by the admin, usually through `axios` helpers in `pdepapel-store/actions/`. `NEXT_PUBLIC_API_URL` already embeds the store id (`https://admin…/api/<storeId>`), so helpers append `/products`, `/checkout` and so on.

**When a dynamic public page fails, investigate the admin API, its server environment, authentication, CORS or the data first, not the storefront UI.**

### Request flow

```text
Customer browser ──▶ pdepapel-store ──REST/JSON──▶ pdepapel-admin ──Prisma──▶ Railway MySQL
Admin browser    ──▶ pdepapel-admin
pdepapel-admin   ──catalog revalidation──▶ pdepapel-store
pdepapel-admin   ──▶ Resend · Cloudinary · Bold/Wompi · EnvioClick · Mercado Libre · QStash + Upstash Redis
```

### Multi-store isolation

Everything is modelled multi-store even though one business uses it today. Every route, query, endpoint, uniqueness rule and mutation is scoped by `[storeId]`. Respect that isolation.

## Business vocabulary

Use these terms; they are the words the owner uses.

- **Tienda en línea** — the public storefront. Do not call it "storefront" in Spanish copy.
- **Administración / panel** — the private dashboard and API.
- **Feria** — an in-person selling event. It reserves stock before the event and records in-person sales.
- **Punto de venta** — everyday in-person sales outside a fair.
- **Cápsula sorpresa** — a randomized product sold at a fair, still tracked internally by the product actually packed. One unique QR per capsule.
- **Publicación** — a Mercado Libre listing, which is not a sale.
- **Venta de Mercado Libre** — a paid marketplace order, recorded at the **net actually collected**, never the buyer-facing gross.

## Repository layout

```text
pdepapel/
├── AGENTS.md              # this file: cross-app orientation
├── CLAUDE.md              # local-only quick notes (gitignored)
├── pdepapel-admin/        # dashboard, REST API, Prisma schema/migrations, cron, webhooks
│   ├── AGENTS.md          # this app's durable handoff document
│   └── docs/              # tracked runbooks (feria, punto de venta, Mercado Libre, tributarios, …)
├── pdepapel-store/        # public storefront
│   └── AGENTS.md          # this app's durable handoff document
├── docs/                  # TRACKED shared guidance
│   ├── testing.md                  # test strategy, commands, safety rules
│   ├── revalidacion-catalogo.md    # admin → store cache-refresh contract
│   ├── seguimiento-seo.md          # post-migration Search Console / SEO monitoring
│   ├── imagenes-cloudinary.md      # the frozen image transformation policy
│   ├── analitica-microsoft-clarity.md, opciones-catalogo-clientes.md
│   └── plan-naming-productos.md, ejecucion-naming.md
├── .github/workflows/     # quality.yml, public-health.yml, admin-scheduled-tasks.yml
├── output/                # TRACKED deliberate artifacts (PDF guides) — not scratch
├── outputs/ tmp/          # gitignored scratch — never stage
└── README.md
```

**`pdepapel-admin/.gitignore` ignores `*md`**, so a new Markdown file there needs `git add -f` or its own negation line to be tracked.

## Commands

Run from the relevant application directory, never the repository root.

```bash
npm run dev            # store :3000 / admin :3001
npm run build          # production build (the admin's only scripted type gate)
npm run lint
npm run type-check     # store only; for the admin use: npx tsc --noEmit (what CI runs)
npm run email:dev      # React Email preview (store :3002)

# Unit and component tests (Vitest)
npm run test:unit
npm run test:coverage                          # thresholds enforced in CI
npx vitest run tests/unit/some-file.test.ts    # a single file
npx vitest run -t "test name pattern"          # a single test

# Admin database integration tests (local Docker MySQL only, serial)
npm run test:db:up && npm run test:db:push && npm run test:integration && npm run test:db:down

# E2E (Playwright)
npm run test:e2e           # store: DEFAULTS TO PRODUCTION (read-only). Override with E2E_BASE_URL
npm run test:e2e:admin     # admin: authenticated smoke via Clerk Agent Tasks, boots :3101

npx prisma generate    # admin, after any schema change (also runs on postinstall)
npx prisma studio
```

**CI (`quality.yml`):** the store runs `type-check` and `test:coverage`; the admin runs `prisma generate`, `tsc --noEmit`, `test:coverage`, then a MySQL service with `test:db:push` and `test:integration`. `public-health.yml` runs the store E2E against production after each production deploy and weekly.

## Shared conventions

- **Stack:** Next.js 14 App Router, React 18, TypeScript strict, Clerk auth, MySQL on Railway with Prisma 6, Tailwind 3 with Radix and shadcn-style components, `class-variance-authority`, `lucide-react`, Framer Motion, react-hook-form with Zod, Cloudinary media, Resend with React Email, Vitest and Playwright. Per-app additions are listed in each application's `AGENTS.md`.
- **Language and routing:** Spanish route segments are **canonical**. English paths exist only as permanent redirects in each `next.config.mjs`, kept for the SEO equity of a completed migration. Admin dashboard segments are Spanish too, while their REST resources keep the established English API names (`/pedidos` uses `/api/{storeId}/orders`).
- **Commit messages:** the historical convention was English; recent history in this repository uses Spanish conventional commits (`feat(acceso): …`). Match the surrounding history and the user's stated preference.
- **Spanish for user-facing copy and error messages.** English is fine in internal code and identifiers where already conventional.
- **Responsiveness:** verify every change at **390 / 768 / 820 / 1280 / 1440** with real device emulation, and check **both** page-level and container-level overflow. A page-level measure only proves the page does not scroll sideways; it does not see a table wider than its own `overflow-x-auto` card.

## Non-negotiable guardrails

These apply everywhere in the repository. Each one exists because it already went wrong or would be unrecoverable. Full detail and the app-specific rules live in each application's `AGENTS.md`.

- **Never `git push` without explicit user approval.** A push to `main` auto-deploys both Vercel projects. Work local-first, validate, then hand off. Commit and push are separate gates; never chain them in one command.
- **Never stage `.env*` files, scratch output, or local agent-instruction files** (`CLAUDE.md`) unless the user explicitly asks.
- **Secrets never enter Git, this repository's docs, terminal history, screenshots, email or chat.** Ask in chat before reading a production secret, even read-only. A Mercado Libre client secret was leaked previously and must be treated as compromised: rotate it, update Vercel, redeploy, then reconnect from the admin UI.
- **Never `NEXT_PUBLIC_`-prefix a secret.** Client-visible values are public by design.
- **Never run `vercel env rm` / `vercel env add` or edit variables in the dashboard without explicit per-variable approval.** `vercel env rm NAME` with no environment argument deletes the variable from **all** environments, and deleted values are unrecoverable. On 2026-08-31 an agent "cleanup" deleted the analytics variables from Production this way and analytics went dark until 2026-09-04. To scope a variable, re-add it for the environment you want; never delete first.
- **Database tests never point at Railway or production.** Integration tests and `prisma db push` use the local Docker MySQL with a `TEST_DATABASE_URL` ending in `pdepapel_test`; the harness rejects anything else.
- **Never run a real purchase flow against production.** Store Playwright defaults to the production site for read-only checks; override `E2E_BASE_URL` and set `E2E_PURCHASABLE_PRODUCT_SLUG` for purchase E2E. Authenticated E2E uses Clerk development keys (`sk_test_`), never live credentials.
- **Schema changes follow the manual-migration protocol** (`pdepapel-admin/prisma/manual-migrations/*.sql`, dated files): edit schema, `npx prisma generate`, tests, reviewed SQL, explicit approval, then apply to Railway deliberately. **There is no automatic production migration runner**, and **apply the migration before deploying the code that reads the new column**.
- **Never hand-edit production data as a substitute for a migration.** Any production write is asked for in chat first, every time, and goes through the write wrapper described in the admin document. Production SQL that bypasses a domain guard needs explicit approval each time.
- **Deleting a tracked file needs explicit permission.**
- **Payments:** Bold is default, Wompi is fallback, PayU is legacy and must not be presented. Customer-facing text stays provider-neutral (`Pago en línea`); keep useful payment icons. Bank transfer reaches `PAID` only after manual admin verification. Webhooks are **idempotent** and validate provider authenticity and state. **Never mark an order paid from a client redirect.** `paidAt` is written only on genuine payment.
- **Inventory is auditable:** apply stock changes through the centralized helpers (`lib/inventory.ts`) and write an `InventoryMovement` for every meaningful adjustment. Guard availability atomically. **A paid order's line items are historical snapshots**; never show a past purchase as unavailable because current stock hit zero. Kits explode into components on both the decrement and the return.
- **Mercado Libre:** marketplace price and shop price are **deliberately decoupled**; never auto-overwrite one from the other. Local stock is the source of truth. A publication import is not a sale. Paid sales apply inventory **exactly once** and record the **net collected**, or stay `Liquidación pendiente` with an outbox retry, never gross. Never restock automatically on a cancellation or return without a confirmed physical return. Never guess a product-to-listing mapping. QStash delays need explicit units (`"30s"`, `"5m"`).
- **Product identifiers are distinct:** `sku` (internal, scannable) is not `gtin` (a real GS1 barcode, **never fabricate one**) and not `mpn` (a real manufacturer code). Without a legitimate GTIN, set the "no product identifier" flag.
- **Catalog cache:** after catalog mutations the admin calls the store's `POST /api/revalidate`. `REVALIDATION_SECRET` must be an **identical single printable line** in both Vercel projects, and the store's Vercel Firewall must not challenge that path. **A successful database write with a stale public page is still a customer-visible defect; verify both.**
- **Never delete existing redirects or slug aliases** (`ProductSlugAlias`, `CategorySlugAlias`) without a deliberate SEO plan. Archived products must return `404` on the storefront and must never be redirected to a category or another product.
- **Images:** one frozen Cloudinary transformation per app (`f_auto,q_auto,c_limit,w_≤1600`). Every distinct transformation and width is a derived copy that is stored forever and billed, so do not add loaders, `quality` values, crops or wider `deviceSizes`, and **never purge derived copies before a width-matrix reduction is live**.
- **Scheduled work:** Vercel's plan allows **only two crons and both are used**. New schedules go into `.github/workflows/admin-scheduled-tasks.yml`. Long external work goes through QStash and Upstash Redis, never a synchronous handler.
- **Environment validation:** both apps validate env at build time with `@t3-oss/env-nextjs` and Zod in `lib/env.mjs`. A missing mandatory variable **fails the build**. Some variables are `requiredInProduction`: optional locally, in CI and in Preview, mandatory in production, so a deleted value fails the deploy instead of silently disabling the feature.
- **Authorization is enforced inside each handler.** Clerk middleware marks every `/api/*` path public and applies a CORS allowlist. A new admin-only endpoint without its own ownership check is publicly writable. The storefront and the panel share one Clerk instance, so every shop customer already has a session on the panel's domain.
- **When a change touches authentication or authorization, run two checks before asking for approval:** every page or route that now calls `auth()`/`currentUser()` is in the middleware's route list, and the assumption the change rests on is confirmed with a read-only query against production data rather than read off the schema. Both exist because of the 2026-09-12 order-page incident.
- **Accessibility and UX:** no text over imagery without a tested contrast layer; keep responsive layouts, since header and menus break easily on tablet and mobile; keep product HTML sanitized and never render unsanitized external HTML with `dangerouslySetInnerHTML`; remove stale "Próximamente" copy for active features.

## Definition of done

Compiling locally is not done. For production-impacting work:

1. The root cause is addressed within the architecture and business rules above.
2. Relevant tests pass and a regression test covers the previously broken behaviour.
3. Responsive, SEO, cache, inventory and payment impacts were considered for the changed surface.
4. No secrets, scratch files, unrelated changes or local agent-instruction files are staged.
5. Migrations and console actions (Vercel variables, OAuth reconnect, webhook registration) are documented as plain steps.
6. Local servers and test containers are stopped.
7. The user has explicitly approved any push.
8. Post-deploy webhook, OAuth, cache or smoke verification is completed or clearly handed to the owner.

## Where to go next

1. The `AGENTS.md` of the application you are changing. That is the authoritative document.
2. `docs/` for the shared contracts: testing, catalog revalidation, SEO monitoring, image policy, analytics.
3. `pdepapel-admin/docs/` for the operational runbooks: Mercado Libre, fairs, point of sale, tax reports, read-only access, the panel guide.
