import { Router, type IRouter } from "express";
import {
  CreateTapAuthorizationBody,
  CreateTapAuthorizationResponse,
  GetTapAuthorizationParams,
  GetTapAuthorizationResponse,
  GetTapPaymentConfigResponse,
} from "@workspace/api-zod";
import { getOhdaPaymentContext } from "./ohda-payment-auth";
import { getAppOrigin } from "../lib/app-origin";

const router: IRouter = Router();
const TAP_API = "https://api.tap.company/v2";
const AUTO_VOID_HOURS = 24;
const DEAL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TapAuthorizationPayload = {
  id?: unknown;
  status?: unknown;
  amount?: unknown;
  currency?: unknown;
  transaction?: {
    url?: unknown;
  };
};

function normalizeKey(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^(['"])(.*)\1$/, "$2");
}

function getTapTestCredentials(): { secretKey: string; publicKey: string } | null {
  const secretKey = normalizeKey(process.env.TAP_SECRET_KEY);
  const publicKey = normalizeKey(process.env.TAP_PUBLIC_KEY);
  // Only ever use sandbox keys. If the configured keys are live (or missing),
  // fall back to Tap's public sandbox account instead of failing.
  if (secretKey.startsWith("sk_test_") && publicKey.startsWith("pk_test_")) {
    return { secretKey, publicKey };
  }
  // Tap's shared sandbox account (developers.tap.company/reference/testing-keys,
  // test merchant 599424), configured as TAP_SANDBOX_SECRET_KEY / TAP_SANDBOX_PUBLIC_KEY.
  const sandboxSecret = normalizeKey(process.env.TAP_SANDBOX_SECRET_KEY);
  const sandboxPublic = normalizeKey(process.env.TAP_SANDBOX_PUBLIC_KEY);
  if (sandboxSecret.startsWith("sk_test_") && sandboxPublic.startsWith("pk_test_")) {
    return { secretKey: sandboxSecret, publicKey: sandboxPublic };
  }
  return null;
}

function getReturnUrl(dealId?: string | null): string | null {
  const origin = getAppOrigin();
  if (!origin) return null;
  return dealId && DEAL_ID_PATTERN.test(dealId)
    ? `${origin}/deals/${dealId}?tapReturn=1`
    : `${origin}/?tapReturn=1`;
}

function getSafeTapRedirect(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      (url.hostname !== "tap.company" && !url.hostname.endsWith(".tap.company"))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

router.get("/tap/config", (_req, res): void => {
  const credentials = getTapTestCredentials();
  res.json(
    GetTapPaymentConfigResponse.parse({
      enabled: Boolean(credentials),
      publicKey: credentials?.publicKey ?? null,
    }),
  );
});

router.post("/tap/checkouts", async (req, res): Promise<void> => {
  const input = req.body ?? {};
  const dealId = typeof input.dealId === "string" && DEAL_ID_PATTERN.test(input.dealId) ? input.dealId : "";
  const amount = Number(input.amount);
  const itemName = typeof input.itemName === "string" ? input.itemName.trim() : "";
  const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
  const lastName = typeof input.lastName === "string" ? input.lastName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const requestId = typeof input.requestId === "string" ? input.requestId : "";
  if (
    !dealId ||
    !itemName || itemName.length > 120 ||
    !Number.isFinite(amount) || amount < 0.1 || amount > 2000 ||
    !firstName || firstName.length > 80 ||
    !lastName || lastName.length > 80 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    !/^[0-9a-f-]{36}$/i.test(requestId)
  ) {
    res.status(400).json({ error: "راجع بيانات الدفع مع Tap." });
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
    Math.abs(Number(context.deal.amount) - amount) > 0.001
  ) {
    res.status(403).json({ error: "ما نقدر نبدأ الدفع لهذه الصفقة أو مبلغها." });
    return;
  }
  const credentials = getTapTestCredentials();
  const returnUrl = getReturnUrl(dealId);
  if (!credentials || !returnUrl) {
    res.status(503).json({ error: "الدفع عبر Tap غير مهيأ حالياً." });
    return;
  }
  let response: Response;
  try {
    response = await fetch(`${TAP_API}/authorize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.secretKey}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amount * 1000) / 1000,
        currency: "KWD",
        customer_initiated: true,
        threeDSecure: true,
        save_card: false,
        description: `Ohda checkout: ${itemName}`,
        reference: { transaction: requestId, order: dealId, idempotent: requestId },
        customer: {
          first_name: firstName,
          last_name: lastName,
          email,
          name: `${firstName} ${lastName}`,
        },
        source: { id: "src_all" },
        auto: {
          type: "VOID",
          time: [24, 48, 72].includes(Number(input.inspectionHours))
            ? Number(input.inspectionHours)
            : AUTO_VOID_HOURS,
        },
        redirect: { url: returnUrl },
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    req.log.error("Tap hosted test checkout request failed");
    res.status(502).json({ error: "تعذر فتح صفحة الدفع لدى Tap." });
    return;
  }
  let payload: TapAuthorizationPayload;
  try {
    payload = await response.json() as TapAuthorizationPayload;
  } catch {
    res.status(502).json({ error: "تعذر قراءة رد Tap." });
    return;
  }
  const redirectUrl = getSafeTapRedirect(payload.transaction?.url);
  if (
    !response.ok ||
    typeof payload.id !== "string" ||
    !payload.id.startsWith("auth_") ||
    !redirectUrl
  ) {
    req.log.error({ statusCode: response.status }, "Tap rejected the hosted test checkout");
    res.status(502).json({ error: "Tap ما جهّز صفحة الدفع." });
    return;
  }
  res.status(201).json({ authorizationId: payload.id, status: payload.status, redirectUrl });
});

router.post("/tap/authorizations", async (req, res): Promise<void> => {
  const parsed = CreateTapAuthorizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "راجع بيانات الحجز." });
    return;
  }

  const credentials = getTapTestCredentials();
  const dealId =
    typeof req.body?.dealId === "string" && DEAL_ID_PATTERN.test(req.body.dealId)
      ? req.body.dealId
      : null;
  const redirectUrl = getReturnUrl(dealId);
  if (!credentials || !redirectUrl) {
    req.log.warn(
      {
        tapTestCredentialsConfigured: Boolean(credentials),
        returnUrlConfigured: Boolean(redirectUrl),
      },
      "Tap test payment is not configured",
    );
    res.status(503).json({ error: "دفع Tap غير مهيأ حالياً." });
    return;
  }

  const input = parsed.data;
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
  const reference = input.requestId;
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();

  let response: Response;
  try {
    response = await fetch(`${TAP_API}/authorize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.secretKey}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(input.amount * 1000) / 1000,
        currency: "KWD",
        customer_initiated: true,
        threeDSecure: true,
        save_card: false,
        description: `Ohda escrow: ${input.itemName.trim()}`,
        reference: {
          transaction: reference,
          order: reference,
          idempotent: reference,
        },
        customer: {
          first_name: firstName,
          last_name: lastName,
          email: input.email.trim(),
          name: `${firstName} ${lastName}`,
        },
        source: { id: input.tokenId },
        auto: {
          type: "VOID",
          time: [24, 48, 72].includes(Number(req.body?.inspectionHours))
            ? Number(req.body.inspectionHours)
            : AUTO_VOID_HOURS,
        },
        redirect: { url: redirectUrl },
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    req.log.error("Tap authorization request failed");
    res.status(502).json({ error: "تعذر بدء الحجز مع Tap." });
    return;
  }

  let payload: TapAuthorizationPayload;
  try {
    payload = (await response.json()) as TapAuthorizationPayload;
  } catch {
    req.log.error({ statusCode: response.status }, "Tap returned an unreadable response");
    res.status(502).json({ error: "تعذر قراءة رد Tap." });
    return;
  }

  if (
    !response.ok ||
    typeof payload.id !== "string" ||
    !payload.id.startsWith("auth_") ||
    typeof payload.status !== "string"
  ) {
    req.log.error({ statusCode: response.status }, "Tap rejected authorization");
    res.status(502).json({ error: "لم يقبل Tap الحجز." });
    return;
  }

  res.status(201).json(
    CreateTapAuthorizationResponse.parse({
      authorizationId: payload.id,
      status: payload.status,
      redirectUrl: getSafeTapRedirect(payload.transaction?.url),
    }),
  );
});

router.get("/tap/authorizations/:id", async (req, res): Promise<void> => {
  const params = GetTapAuthorizationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "رقم الحجز غير صحيح." });
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
    !["payment_pending", "funded"].includes(context.deal.status) ||
    (context.deal.payment_reference && context.deal.payment_reference !== params.data.id)
  ) {
    res.status(403).json({ error: "هذا الحجز غير مرتبط بصفقتك." });
    return;
  }

  const credentials = getTapTestCredentials();
  if (!credentials) {
    res.status(503).json({ error: "دفع Tap غير مهيأ حالياً." });
    return;
  }

  let response: Response;
  try {
    response = await fetch(
      `${TAP_API}/authorize/${encodeURIComponent(params.data.id)}`,
      {
        headers: {
          Authorization: `Bearer ${credentials.secretKey}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(8_000),
      },
    );
  } catch {
    req.log.error("Tap authorization lookup failed");
    res.status(502).json({ error: "تعذر التحقق من حالة الحجز لدى Tap." });
    return;
  }

  let payload: TapAuthorizationPayload;
  try {
    payload = (await response.json()) as TapAuthorizationPayload;
  } catch {
    req.log.error({ statusCode: response.status }, "Tap returned an unreadable status response");
    res.status(502).json({ error: "تعذر قراءة حالة الحجز من Tap." });
    return;
  }

  if (response.status === 404) {
    res.status(404).json({ error: "لم نعثر على هذا الحجز لدى Tap." });
    return;
  }

  if (
    !response.ok ||
    typeof payload.id !== "string" ||
    typeof payload.status !== "string" ||
    typeof payload.amount !== "number" ||
    typeof payload.currency !== "string"
  ) {
    req.log.error({ statusCode: response.status }, "Tap authorization status could not be verified");
    res.status(502).json({ error: "تعذر التحقق من حالة الحجز لدى Tap." });
    return;
  }

  res.json(
    GetTapAuthorizationResponse.parse({
      authorizationId: payload.id,
      status: payload.status,
      amount: payload.amount,
      currency: payload.currency,
    }),
  );
});

router.post("/tap/settlements", async (req, res): Promise<void> => {
  const authorizationId =
    typeof req.body?.authorizationId === "string" ? req.body.authorizationId.trim() : "";
  const action = req.body?.action;
  if (
    !/^auth_[A-Za-z0-9]+$/.test(authorizationId) ||
    (action !== "capture" && action !== "void")
  ) {
    res.status(400).json({ error: "بيانات تسوية Tap غير صحيحة." });
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
    deal.payment_provider !== "tap" ||
    deal.payment_reference !== authorizationId ||
    !allowedStates.includes(deal.payment_state) ||
    !allowedStatuses.includes(deal.status) ||
    Math.abs(Number(deal.amount) - Number(req.body?.amount)) > 0.001
  ) {
    res.status(403).json({ error: "لا يمكن تسوية هذا الحجز لهذه الصفقة." });
    return;
  }
  const credentials = getTapTestCredentials();
  if (!credentials) {
    res.status(503).json({ error: "إعداد Tap غير متاح." });
    return;
  }

  const input = {
    firstName: typeof req.body?.firstName === "string" ? req.body.firstName.trim() : "",
    lastName: typeof req.body?.lastName === "string" ? req.body.lastName.trim() : "",
    email: typeof req.body?.email === "string" ? req.body.email.trim() : "",
    amount: Number(req.body?.amount),
    requestId: typeof req.body?.requestId === "string" ? req.body.requestId : "",
  };
  if (
    action === "capture" &&
    (!input.firstName || !input.lastName || !/^\S+@\S+\.\S+$/.test(input.email) ||
      !Number.isFinite(input.amount) || input.amount <= 0 ||
      input.amount > 1000000 || !/^[A-Za-z0-9_-]{8,120}$/.test(input.requestId))
  ) {
    res.status(400).json({ error: "بيانات استلام المبلغ غير مكتملة." });
    return;
  }

  const url = action === "void"
    ? `${TAP_API}/authorize/${encodeURIComponent(authorizationId)}/void`
    : `${TAP_API}/charges`;
  const returnUrl = getReturnUrl();
  if (action === "capture" && !returnUrl) {
    res.status(503).json({ error: "رابط العودة الآمن غير مهيأ لتسوية Tap." });
    return;
  }
  const body = action === "capture"
    ? {
        amount: Math.round(input.amount * 1000) / 1000,
        currency: "KWD",
        customer_initiated: true,
        threeDSecure: true,
        save_card: false,
        description: `Ohda settlement ${input.requestId}`,
        reference: {
          transaction: input.requestId,
          order: input.requestId,
          idempotent: input.requestId,
        },
        customer: {
          first_name: input.firstName,
          last_name: input.lastName,
          email: input.email,
          name: `${input.firstName} ${input.lastName}`,
        },
        source: { id: authorizationId },
        redirect: { url: returnUrl },
      }
    : undefined;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.secretKey}`,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    req.log.error("Tap test settlement request failed");
    res.status(502).json({ error: "تعذر تنفيذ عملية Tap." });
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    req.log.error({ statusCode: response.status }, "Tap settlement response was unreadable");
    res.status(502).json({ error: "تعذر قراءة رد Tap." });
    return;
  }

  const expectedStatus = action === "capture" ? "CAPTURED" : "VOID";
  if (!response.ok || payload.status !== expectedStatus) {
    req.log.error({ statusCode: response.status, action }, "Tap did not confirm test settlement");
    res.status(502).json({ error: "Tap ما أكد عملية التسوية." });
    return;
  }
  res.json({
    action,
    status: expectedStatus,
    reference: typeof payload.id === "string" ? payload.id : authorizationId,
  });
});

export default router;
