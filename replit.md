# عهدة — Ohda

عهدة تساعد البائع والمشتري في الكويت على إتمام صفقات المستعمل بخطوات واضحة وآمنة.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/ohda run dev` — run the RTL Ohda web app
- `pnpm --filter @workspace/ohda run typecheck` — check the web app
- `pnpm --filter @workspace/api-server run typecheck` — check the API
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Supabase migrations are in `supabase/migrations/`; they have been applied to the existing Ohda Supabase project through its connected MCP server.
- Required app configuration: `SUPABASE_URL`, `SUPABASE_ANON_KEY`; the public anon key is served to the browser by `/api/supabase/config`.
- Tap and Stripe routes refuse non-test credentials. Keep `TAP_SECRET_KEY` / `TAP_PUBLIC_KEY` in Tap test mode and `STRIPE_SECRET_KEY` as `sk_test_…`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB/Auth/Photos: Supabase Auth, PostgreSQL with RLS, and private Supabase Storage
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ohda/src/pages/` contains home, auth, deals, profile and admin pages.
- `artifacts/ohda/src/lib/ohda-data.ts` contains the anon-key Supabase Auth, RLS, storage, and deal client.
- `artifacts/ohda/src/ohda.css` is the Arabic-first responsive theme; `index.html` sets the document RTL direction.
- `artifacts/api-server/src/routes/` contains Supabase configuration and test-only Tap/Stripe integrations.
- `supabase/migrations/` is the database source of truth; use Supabase MCP `applyMigration` for remote schema updates.

## Architecture decisions

- Deal state changes go through the authenticated `ohda_api` PostgreSQL RPC; participant/admin checks are enforced in the database.
- Tap uses KWD hosted test checkout; Stripe uses manual-capture test Checkout in USD because the current Stripe test account rejected KWD. The server fetches a current KWD/USD quote and stores the deal amount in KWD.
- The app is a test-only prototype. A database “held” status is not real escrow or money custody; provider capture/void operations are also test-only.

## Product

- الواجهة الرئيسية والصفقات والحسابات والإدارة تعمل بالعربية واتجاه RTL.
- تسجيل الحسابات والصفقات والرسائل والتقييمات وقائمة الانتظار تعتمد Supabase RLS.
- أي دفع متاح للتجربة فقط، ولا يخصم أو يحول أموالاً حقيقية.
- لوحة الإدارة لا تظهر إلا للحساب الذي يحمل `profiles.role = 'admin'`. إذا لم يظهر حساب المالك بعد، يسجل دخوله مرة واحدة بالبريد الذي حدده ثم يُرفع دوره عبر MCP؛ لا تضف بريده أو دوره في كود التطبيق.
- تبويب التحويلات يسجل العملية اليدوية فقط. تحويلات البائعين الفعلية تنتظر موافقة Tap Marketplace.

## User preferences

- يفضّل المستخدم بناء الـMVP بخطوات صغيرة قابلة للتجربة.
- خياري الدفع التجريبي هما Tap وStripe؛ لا تستخدم مفاتيح الحساب الحية أو تغيّر حراسة test-key.

## Gotchas

- إنشاء الدفع وقراءة حالته والتسوية تتطلب جلسة Supabase صحيحة وتتحقق من الصفقة والطرف والمبلغ في الخادم.
- Stripe يستخدم تحويل KWD إلى USD للاختبار، لذلك لا تعرض مبلغ Stripe بالدينار على أنه USD.
- إتمام الصفقة بعد الفحص يستدعي تسوية مزود الدفع قبل تسجيل الإتمام في قاعدة البيانات.
- إنشاء الصور يتطلب أن يكون المستخدم طرفاً في الصفقة؛ الأدلة خاصة وتُعرض بروابط موقعة قصيرة العمر للمشرف.
- تأكيد البريد يرسل المستخدم إلى رابط التطبيق الحالي؛ أضف نطاق المعاينة في Supabase Authentication → URL Configuration ضمن Redirect URLs، ولا تترك `localhost:3000` كرابط التطبيق.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
