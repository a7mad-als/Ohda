import { Router, type IRouter } from "express";
import {
  CreateTapAuthorizationBody,
  CreateTapAuthorizationResponse,
  GetTapAuthorizationParams,
  GetTapAuthorizationResponse,
  GetTapPaymentConfigResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const TAP_API = "https://api.tap.company/v2";
const AUTO_VOID_HOURS = 24;

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
  if (!secretKey.startsWith("sk_test_") || !publicKey.startsWith("pk_test_")) {
    return null;
  }
  return { secretKey, publicKey };
}

function getReturnUrl(): string | null {
  const configuredDomain =
    process.env.NODE_ENV === "production"
      ? process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ||
        process.env.REPLIT_DEV_DOMAIN?.trim()
      : process.env.REPLIT_DEV_DOMAIN?.trim() ||
        process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (!configuredDomain) return null;
  try {
    const url = new URL(`https://${configuredDomain}`);
    return `${url.origin}/?tapReturn=1`;
  } catch {
    return null;
  }
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

router.post("/tap/authorizations", async (req, res): Promise<void> => {
  const parsed = CreateTapAuthorizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "راجع بيانات الحجز التجريبي." });
    return;
  }

  const credentials = getTapTestCredentials();
  const redirectUrl = getReturnUrl();
  if (!credentials || !redirectUrl) {
    req.log.warn(
      {
        tapTestCredentialsConfigured: Boolean(credentials),
        returnUrlConfigured: Boolean(redirectUrl),
      },
      "Tap test payment is not configured",
    );
    res.status(503).json({ error: "دفع Tap التجريبي غير مهيأ حالياً." });
    return;
  }

  const input = parsed.data;
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
        description: `Ohda test authorization: ${input.itemName.trim()}`,
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
        auto: { type: "VOID", time: AUTO_VOID_HOURS },
        redirect: { url: redirectUrl },
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    req.log.error("Tap authorization request failed");
    res.status(502).json({ error: "تعذر بدء الحجز التجريبي مع Tap." });
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
    res.status(502).json({ error: "لم يقبل Tap الحجز التجريبي. تحقق من إعداد حساب الاختبار." });
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

  const credentials = getTapTestCredentials();
  if (!credentials) {
    res.status(503).json({ error: "دفع Tap التجريبي غير مهيأ حالياً." });
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

export default router;
