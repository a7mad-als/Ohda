# عهدة — Ohda

عهدة تساعد البائع والمشتري في الكويت على إتمام صفقات المستعمل بخطوات واضحة وآمنة.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

- النسخة الحالية صفحة تعريفية وتجربة تقنية لحفظ اسم غرض واحد فقط؛ ليست نظام صفقات ولا تستقبل أموالاً حقيقية.
- الدفع المستقبلي يبدأ مع Tap بوضع الاختبار فقط، ولا تُفعّل مدفوعات حقيقية دون طلب صريح.

## User preferences

- يفضّل المستخدم بناء الـMVP بخطوات صغيرة قابلة للتجربة.
- مزود الدفع التجريبي المخطط له هو Tap، وليس Stripe.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
