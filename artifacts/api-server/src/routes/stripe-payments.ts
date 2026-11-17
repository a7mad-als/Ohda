import { Router, type IRouter } from "express";
import {
  CreateStripeAuthorizationBody,
  CreateStripeAuthorizationResponse,
  GetStripeAuthorizationParams,
  GetStripeAuthorizationResponse,
} from "@workspace/api-zod";
import { getOhdaPaymentContext } from "./ohda-payment-auth";

const router: IRouter = Router();
const STRIPE_API = "https://api.stripe.com/v1";
const FX_API = "https://open.er-api.com/v6/latest/KWD";

let kwdUsdCache: { rate: number; updatedAt: string; expiresAt: number } | null = null;

async function getKwdUsdQuote(): Promise<{ rate: number; updatedAt: string } | null> {
  if (kwdUsdCache && kwdUsdCache.expiresAt > Date.now()) {
    return { rate: kwdUsdCache.rate, updatedAt: kwdUsdCache.updatedAt };
  }
  try {
    const response = await fetch(FX_API, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    const payload = await response.json() as {
      result?: unknown;
      rates?: { USD?: unknown };
      time_last_update_utc?: unknown;
    };
    const rate = payload.rates?.USD;
    if (payload.result !== "success" || typeof rate !== "number" || rate <= 0) return null;
    const updatedAt = typeof payload.time_last_update_utc === "string"
      ? payload.time_last_update_utc
      : new Date().toISOString();
    kwdUsdCache = { rate, updatedAt, expiresAt: Date.now() + 10 * 60 * 1000 };
    return { rate, updatedAt };
  } catch {
    return null;
  }
}

type StripeCheckoutSession = {
  id?: unknown;
  url?: unknown;
  mode?: unknown;
  status?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  metadata?: Record<string, unknown>;
  payment_intent?: string | StripePaymentIntent | null;
};

type StripePaymentIntent = {
  id?: unknown;
  status?: unknown;
  amount?: unknown;
  currency?: unknown;
  metadata?: Record<string, unknown>;
};

function stripeErrorDetails(
  payload: Record<string, unknown> | null,
): { type?: string; code?: string; param?: string } {
  const error = payload?.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return {};
  const fields = error as Record<string, unknown>;
  return {
    ...(typeof fields.type === "string" ? { type: fields.type } : {}),
    ...(typeof fields.code === "string" ? { code: fields.code } : {}),
    ...(typeof fields.param === "string" ? { param: fields.param } : {}),
  };
}

function normalizeKey(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^(['"])(.*)\1$/, "$2");
}

function getStripeTestSecret(): string | null {
  const secretKey = normalizeKey(process.env.STRIPE_SECRET_KEY);
  return secretKey.startsWith("sk_test_") ? secretKey : null;
}

function getAppOrigin(): string | null {
  const configuredDomain =
    process.env.NODE_ENV === "production"
      ? process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ||
        process.env.REPLIT_DEV_DOMAIN?.trim()
      : process.env.REPLIT_DEV_DOMAIN?.trim() ||
        process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (!configuredDomain) return null;
  try {
    return new URL(`https://${configuredDomain}`).origin;
  } catch {
    return null;
  }
}

function getSafeCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function readStripeJson(
  response: globalThis.Response,
): Promise<Record<string, unknown> | null> {
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

router.get("/stripe/config", async (_req, res): Promise<void> => {
  const quote = await getKwdUsdQuote();
  res.json({
    enabled: Boolean(getStripeTestSecret() && quote),
    currency: "USD",
    kwdToUsdRate: quote?.rate ?? null,
    rateUpdatedAt: quote?.updatedAt ?? null,
  });
});

router.post("/stripe/authorizations", async (req, res): Promise<void> => {
  const parsed = CreateStripeAuthorizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "راجع بيانات الحجز." });
    return;
  }
  const input = parsed.data;
  const dealId = typeof req.body?.dealId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.body.dealId)
    ? req.body.dealId
    : null;
  if (!dealId) {
    res.status(400).json({ error: "يجب ربط الدفع بصفقة." });
    return;
  }
  const context = await getOhdaPaymentContext(req, dealId);
  if (!context) {
    res.status(401).json({ error: "سجّل دخولك مرة ثانية لبدء الدفع." });
    return;
  }
  if (
    context.deal.buyer_id !== context.userId ||
    context.deal.status !== "payment_pending" ||
    Math.abs(Number(context.deal.amount) - input.amount) > 0.001
  ) {
    res.status(403).json({ error: "ما نقدر نبدأ الدفع لهذه الصفقة أو مبلغها." });
    return;
  }

  const secretKey = getStripeTestSecret();
  const appOrigin = getAppOrigin();
  const quote = await getKwdUsdQuote();
  if (!secretKey || !appOrigin || !quote) {
    req.log.warn(
      {
        stripeTestCredentialsConfigured: Boolean(secretKey),
        returnUrlConfigured: Boolean(appOrigin),
        exchangeRateConfigured: Boolean(quote),
      },
      "Stripe test payment is not configured",
    );
    res.status(503).json({ error: "دفع Stripe غير مهيأ حالياً." });
    return;
  }

  const amountUsd = Math.round(input.amount * quote.rate * 100) / 100;
  if (amountUsd < 0.5 || amountUsd > 999999.99) {
    res.status(400).json({ error: "قيمة الصفقة خارج النطاق المسموح عبر Stripe." });
    return;
  }
  const returnPath = `/deals/${dealId}?stripeReturn=1&session_id={CHECKOUT_SESSION_ID}`;
  const form = new URLSearchParams({
    mode: "payment",
    success_url: `${appOrigin}${returnPath}`,
    cancel_url: `${appOrigin}/deals/${dealId}?stripeCancel=1`,
    customer_email: input.email.trim(),
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(
      Math.round(amountUsd * 100),
    ),
    "line_items[0][price_data][product_data][name]": `${input.itemName.trim()} (${input.amount.toFixed(3)} KWD)`,
    "line_items[0][quantity]": "1",
    "payment_intent_data[capture_method]": "manual",
    "payment_intent_data[metadata][requestId]": input.requestId,
    "payment_intent_data[metadata][itemName]": input.itemName.trim(),
    "payment_intent_data[metadata][amountKwd]": input.amount.toFixed(3),
    "payment_intent_data[metadata][kwdToUsdRate]": String(quote.rate),
    ...(dealId ? { "payment_intent_data[metadata][dealId]": dealId } : {}),
    "metadata[requestId]": input.requestId,
    "metadata[itemName]": input.itemName.trim(),
    "metadata[firstName]": input.firstName.trim(),
    "metadata[lastName]": input.lastName.trim(),
    "metadata[amountKwd]": input.amount.toFixed(3),
    "metadata[kwdToUsdRate]": String(quote.rate),
    ...(dealId ? { "metadata[dealId]": dealId } : {}),
  });

  let response: globalThis.Response;
  try {
    response = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.requestId,
      },
      body: form,
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    req.log.error("Stripe checkout session request failed");
    res.status(502).json({ error: "تعذر بدء الحجز مع Stripe." });
    return;
  }

  const payload = await readStripeJson(response);
  const stripeError = stripeErrorDetails(payload);
  if (
    !response.ok ||
    typeof payload?.id !== "string" ||
    !payload.id.startsWith("cs_test_") ||
    typeof payload.url !== "string"
  ) {
    req.log.error(
      {
        statusCode: response.status,
        stripeError: {
          ...(stripeError.type ? { type: stripeError.type } : {}),
          ...(stripeError.code ? { code: stripeError.code } : {}),
          ...(stripeError.param ? { param: stripeError.param } : {}),
        },
      },
      "Stripe rejected test authorization checkout",
    );
    res.status(502).json({ error: "لم يقبل Stripe الحجز." });
    return;
  }

  const redirectUrl = getSafeCheckoutUrl(payload.url);
  if (!redirectUrl) {
    req.log.error(
      { statusCode: response.status },
      "Stripe returned an unexpected checkout URL",
    );
    res.status(502).json({ error: "تعذر فتح صفحة الدفع الآمنة لدى Stripe." });
    return;
  }

  const receipt = CreateStripeAuthorizationResponse.parse({
    sessionId: payload.id,
    redirectUrl,
  });
  res.status(201).json({
    ...receipt,
    currency: "USD",
    amountUsd,
    amountKwd: input.amount,
    kwdToUsdRate: quote.rate,
    rateUpdatedAt: quote.updatedAt,
  });
});

router.get(
  "/stripe/authorizations/:sessionId",
  async (req, res): Promise<void> => {
    const params = GetStripeAuthorizationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "رقم جلسة Stripe غير صحيح." });
      return;
    }
    const dealId = typeof req.query.dealId === "string" ? req.query.dealId : "";
    const context = await getOhdaPaymentContext(req, dealId);
    if (!context) {
      res.status(401).json({ error: "سجّل دخولك مرة ثانية للتحقق من الدفع." });
      return;
    }
    if (
      context.deal.buyer_id !== context.userId ||
      !["payment_pending", "funded"].includes(context.deal.status)
    ) {
      res.status(403).json({ error: "هذا الحجز غير مرتبط بصفقتك." });
      return;
    }

    const secretKey = getStripeTestSecret();
    if (!secretKey) {
      res.status(503).json({ error: "دفع Stripe غير مهيأ حالياً." });
      return;
    }

    let response: globalThis.Response;
    try {
      const query = new URLSearchParams({ "expand[]": "payment_intent" });
      response = await fetch(
        `${STRIPE_API}/checkout/sessions/${encodeURIComponent(params.data.sessionId)}?${query}`,
        {
          headers: { Authorization: `Bearer ${secretKey}` },
          signal: AbortSignal.timeout(8_000),
        },
      );
    } catch {
      req.log.error("Stripe authorization lookup failed");
      res.status(502).json({ error: "تعذر التحقق من حالة الحجز لدى Stripe." });
      return;
    }

    const payload = (await readStripeJson(response)) as StripeCheckoutSession | null;
    if (response.status === 404) {
      res.status(404).json({ error: "لم نعثر على هذا الحجز لدى Stripe." });
      return;
    }
    if (
      !response.ok ||
      !payload ||
      payload.id !== params.data.sessionId ||
      payload.mode !== "payment" ||
      (payload.status !== "complete" && payload.status !== "open" && payload.status !== "expired")
    ) {
      req.log.error(
        { statusCode: response.status },
        "Stripe authorization status could not be verified",
      );
      res.status(502).json({ error: "تعذر التحقق من حالة الحجز لدى Stripe." });
      return;
    }

    const paymentIntent =
      typeof payload.payment_intent === "object" && payload.payment_intent
        ? payload.payment_intent
        : null;
    const amountTotal =
      typeof payload.amount_total === "number" ? payload.amount_total : null;
    const paymentIntentAmount =
      typeof paymentIntent?.amount === "number" ? paymentIntent.amount : null;
    const currency =
      typeof payload.currency === "string" ? payload.currency.toUpperCase() : null;
    const paymentIntentCurrency =
      typeof paymentIntent?.currency === "string"
        ? paymentIntent.currency.toUpperCase()
        : null;
    const isVerifiedAuthorization =
      payload.status === "complete" &&
      paymentIntent?.status === "requires_capture" &&
      typeof paymentIntent.id === "string" &&
      paymentIntent.id.startsWith("pi_") &&
      amountTotal !== null &&
      paymentIntentAmount === amountTotal &&
      currency === "USD" &&
      paymentIntentCurrency === "USD" &&
      paymentIntent.metadata?.requestId === payload.metadata?.requestId &&
      paymentIntent.metadata?.dealId === dealId &&
      payload.metadata?.dealId === dealId &&
      typeof payload.metadata?.requestId === "string";

    if (amountTotal === null || currency !== "USD") {
      req.log.error(
        { statusCode: response.status },
        "Stripe authorization amount or currency could not be verified",
      );
      res.status(502).json({ error: "تعذر التحقق من مبلغ الحجز لدى Stripe." });
      return;
    }

    res.json({
      ...GetStripeAuthorizationResponse.parse({
        authorizationId:
          typeof paymentIntent?.id === "string" ? paymentIntent.id : payload.id,
        status: isVerifiedAuthorization ? "AUTHORIZED" : "NOT_AUTHORIZED",
        amount: amountTotal / 100,
        currency,
      }),
      amountKwd:
        typeof payload.metadata?.amountKwd === "string"
          ? Number(payload.metadata.amountKwd)
          : null,
      dealId:
        typeof payload.metadata?.dealId === "string" ? payload.metadata.dealId : null,
      kwdToUsdRate:
        typeof payload.metadata?.kwdToUsdRate === "string"
          ? Number(payload.metadata.kwdToUsdRate)
          : null,
    });
  },
);

router.post("/stripe/settlements", async (req, res): Promise<void> => {
  const paymentIntentId =
    typeof req.body?.paymentIntentId === "string" ? req.body.paymentIntentId.trim() : "";
  const action = req.body?.action;
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId) || (action !== "capture" && action !== "void")) {
    res.status(400).json({ error: "بيانات تسوية Stripe غير صحيحة." });
    return;
  }
  const dealId = typeof req.body?.dealId === "string" ? req.body.dealId : "";
  const context = await getOhdaPaymentContext(req, dealId);
  if (!context) {
    res.status(401).json({ error: "سجّل دخولك مرة ثانية لإتمام التسوية." });
    return;
  }
  const deal = context.deal;
  const allowedStates = action === "capture" ? ["authorized"] : ["pending", "authorized"];
  const allowedStatuses = action === "capture"
    ? ["funded", "inspection", "disputed"]
    : ["payment_pending", "funded", "disputed"];
  if (
    (!context.isAdmin && deal.buyer_id !== context.userId && deal.seller_id !== context.userId) ||
    deal.payment_provider !== "stripe" ||
    deal.payment_reference !== paymentIntentId ||
    !allowedStates.includes(deal.payment_state) ||
    !allowedStatuses.includes(deal.status)
  ) {
    res.status(403).json({ error: "لا يمكن تسوية هذا الحجز لهذه الصفقة." });
    return;
  }
  const secretKey = getStripeTestSecret();
  if (!secretKey) {
    res.status(503).json({ error: "إعداد Stripe غير متاح." });
    return;
  }
  const endpoint = action === "capture" ? "capture" : "cancel";
  let response: globalThis.Response;
  try {
    response = await fetch(
      `${STRIPE_API}/payment_intents/${encodeURIComponent(paymentIntentId)}/${endpoint}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(12_000),
      },
    );
  } catch {
    req.log.error("Stripe test settlement request failed");
    res.status(502).json({ error: "تعذر تنفيذ عملية Stripe." });
    return;
  }
  const payload = await readStripeJson(response) as StripePaymentIntent | null;
  const expectedStatus = action === "capture" ? "succeeded" : "canceled";
  if (!response.ok || payload?.id !== paymentIntentId || payload?.status !== expectedStatus) {
    req.log.error({ statusCode: response.status, action }, "Stripe did not confirm test settlement");
    res.status(502).json({ error: "Stripe ما أكد عملية التسوية." });
    return;
  }
  res.json({ action, status: expectedStatus, reference: paymentIntentId });
});

export default router;
