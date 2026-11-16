import { Router, type IRouter } from "express";
import {
  CreateStripeAuthorizationBody,
  CreateStripeAuthorizationResponse,
  GetStripeAuthorizationParams,
  GetStripeAuthorizationResponse,
  GetStripePaymentConfigResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const STRIPE_API = "https://api.stripe.com/v1";

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

router.get("/stripe/config", (_req, res): void => {
  res.json(
    GetStripePaymentConfigResponse.parse({
      enabled: Boolean(getStripeTestSecret()),
    }),
  );
});

router.post("/stripe/authorizations", async (req, res): Promise<void> => {
  const parsed = CreateStripeAuthorizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "راجع بيانات الحجز التجريبي." });
    return;
  }

  const secretKey = getStripeTestSecret();
  const appOrigin = getAppOrigin();
  if (!secretKey || !appOrigin) {
    req.log.warn(
      {
        stripeTestCredentialsConfigured: Boolean(secretKey),
        returnUrlConfigured: Boolean(appOrigin),
      },
      "Stripe test payment is not configured",
    );
    res.status(503).json({ error: "دفع Stripe التجريبي غير مهيأ حالياً." });
    return;
  }

  const input = parsed.data;
  const form = new URLSearchParams({
    mode: "payment",
    success_url: `${appOrigin}/?stripeReturn=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appOrigin}/?stripeCancel=1`,
    customer_email: input.email.trim(),
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(
      Math.round(input.amount * 100),
    ),
    "line_items[0][price_data][product_data][name]": input.itemName.trim(),
    "line_items[0][quantity]": "1",
    "payment_intent_data[capture_method]": "manual",
    "payment_intent_data[metadata][requestId]": input.requestId,
    "payment_intent_data[metadata][itemName]": input.itemName.trim(),
    "metadata[requestId]": input.requestId,
    "metadata[itemName]": input.itemName.trim(),
    "metadata[firstName]": input.firstName.trim(),
    "metadata[lastName]": input.lastName.trim(),
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
    res.status(502).json({ error: "تعذر بدء الحجز التجريبي مع Stripe." });
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
    res.status(502).json({ error: "لم يقبل Stripe الحجز التجريبي. تحقق من إعداد حساب الاختبار." });
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

  res.status(201).json(
    CreateStripeAuthorizationResponse.parse({
      sessionId: payload.id,
      redirectUrl,
    }),
  );
});

router.get(
  "/stripe/authorizations/:sessionId",
  async (req, res): Promise<void> => {
    const params = GetStripeAuthorizationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "رقم جلسة Stripe غير صحيح." });
      return;
    }

    const secretKey = getStripeTestSecret();
    if (!secretKey) {
      res.status(503).json({ error: "دفع Stripe التجريبي غير مهيأ حالياً." });
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
      typeof payload.metadata?.requestId === "string";

    if (amountTotal === null || currency !== "USD") {
      req.log.error(
        { statusCode: response.status },
        "Stripe authorization amount or currency could not be verified",
      );
      res.status(502).json({ error: "تعذر التحقق من مبلغ الحجز لدى Stripe." });
      return;
    }

    res.json(
      GetStripeAuthorizationResponse.parse({
        authorizationId:
          typeof paymentIntent?.id === "string" ? paymentIntent.id : payload.id,
        status: isVerifiedAuthorization ? "AUTHORIZED" : "NOT_AUTHORIZED",
        amount: amountTotal / 100,
        currency,
      }),
    );
  },
);

export default router;
