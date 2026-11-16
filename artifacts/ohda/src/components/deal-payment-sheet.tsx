import { useEffect, useRef, useState, type FormEvent } from "react";
import { getTapPaymentConfig } from "@workspace/api-client-react";
import { ArrowLeft, Check, CreditCard, X } from "lucide-react";
import {
  applyDealAction,
  formatKwd,
  getSession,
  getStripeKwdQuote,
  type OhdaDeal,
  type OhdaProfile,
  type OhdaSession,
} from "@/lib/ohda-data";

type Provider = "tap" | "stripe";
type TapConfig = Awaited<ReturnType<typeof getTapPaymentConfig>>;
type StripeSessionStatus = {
  authorizationId: string;
  status: string;
  amount: number;
  currency: string;
  amountKwd?: number | null;
  dealId?: string | null;
};
type TapReceiptStatus = { authorizationId: string; status: string; amount: number; currency: string };

async function paymentRequest<T>(
  path: string,
  session: OhdaSession,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
): Promise<T> {
  const currentSession = await getSession() ?? session;
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${currentSession.access_token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "تعذر التواصل مع بوابة الدفع التجريبية.");
  return payload;
}

function safeCheckoutUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeTapCheckoutUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "tap.company" || url.hostname.endsWith(".tap.company"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function firstAndLast(profile: OhdaProfile | null, session: OhdaSession) {
  const value = profile?.display_name || session.user.user_metadata?.name || "عضو عهدة";
  const parts = value.trim().split(/\s+/);
  return { firstName: parts[0] || "Ohda", lastName: parts.slice(1).join(" ") || "Buyer" };
}

export function DealPaymentSheet({
  open,
  onClose,
  deal,
  session,
  profile,
  returnedTapAuthorizationId,
  returnedStripeSessionId,
  onLinked,
}: {
  open: boolean;
  onClose: () => void;
  deal: OhdaDeal;
  session: OhdaSession;
  profile: OhdaProfile | null;
  returnedTapAuthorizationId?: string | null;
  returnedStripeSessionId?: string | null;
  onLinked: () => Promise<void>;
}) {
  const [provider, setProvider] = useState<Provider>("tap");
  const [tapConfig, setTapConfig] = useState<TapConfig | null>(null);
  const [stripeQuote, setStripeQuote] = useState<Awaited<ReturnType<typeof getStripeKwdQuote>> | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("");
  const handled = useRef(new Set<string>());
  const names = firstAndLast(profile, session);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingConfig(true);
    Promise.all([
      getTapPaymentConfig()
        .then((value) => { if (!cancelled) setTapConfig(value); })
        .catch(() => { if (!cancelled) setTapConfig({ enabled: false, publicKey: null }); }),
      getStripeKwdQuote()
        .then((value) => { if (!cancelled) setStripeQuote(value); })
        .catch(() => { if (!cancelled) setStripeQuote(null); }),
    ]).finally(() => { if (!cancelled) setLoadingConfig(false); });
    return () => { cancelled = true; };
  }, [open]);

  async function linkAuthorization(providerName: Provider, reference: string) {
    const key = `${providerName}:${reference}:${deal.id}`;
    if (handled.current.has(key)) return;
    handled.current.add(key);
    try {
      await applyDealAction(session, "funded", {
        deal_id: deal.id,
        provider: providerName,
        reference,
      });
      setStatusText("تم تأكيد حجز الاختبار وربطه بالصفقة.");
      setError("");
      await onLinked();
    } catch (cause) {
      handled.current.delete(key);
      setError(cause instanceof Error ? cause.message : "تم التحقق من الدفع لكن تعذر ربطه بالصفقة.");
    }
  }

  async function verifyTap(authorizationId: string) {
    setBusy(true);
    setError("");
    try {
      const status = await paymentRequest<TapReceiptStatus>(
        `/api/tap/authorizations/${encodeURIComponent(authorizationId)}?dealId=${encodeURIComponent(deal.id)}`,
        session,
      );
      if (
        status.status.toUpperCase() !== "AUTHORIZED" ||
        status.currency.toUpperCase() !== "KWD" ||
        Math.abs(status.amount - deal.amount) > 0.001
      ) {
        throw new Error("حالة الحجز أو المبلغ لا يطابق تفاصيل الصفقة.");
      }
      await linkAuthorization("tap", authorizationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر التحقق من حجز Tap.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyStripe(sessionId: string) {
    setBusy(true);
    setError("");
    try {
      const status = await paymentRequest<StripeSessionStatus>(
        `/api/stripe/authorizations/${encodeURIComponent(sessionId)}?dealId=${encodeURIComponent(deal.id)}`,
        session,
      );
      if (
        status.status.toUpperCase() !== "AUTHORIZED" ||
        status.currency.toUpperCase() !== "USD" ||
        status.dealId !== deal.id ||
        typeof status.amountKwd !== "number" ||
        Math.abs(status.amountKwd - deal.amount) > 0.001
      ) {
        throw new Error("حالة الحجز أو مبلغ الدينار لا يطابق تفاصيل الصفقة.");
      }
      await linkAuthorization("stripe", status.authorizationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر التحقق من حجز Stripe.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open || !returnedTapAuthorizationId) return;
    setProvider("tap");
    void verifyTap(returnedTapAuthorizationId);
  }, [open, returnedTapAuthorizationId]);

  useEffect(() => {
    if (!open || !returnedStripeSessionId) return;
    setProvider("stripe");
    void verifyStripe(returnedStripeSessionId);
  }, [open, returnedStripeSessionId]);

  async function startTap() {
    if (!tapConfig?.enabled) {
      setError("Tap غير مهيأ بحساب اختبار، لذلك ما بدأنا أي حجز.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const authorization = await paymentRequest<{ authorizationId: string; redirectUrl?: string | null }>(
        "/api/tap/checkouts",
        session,
        { method: "POST", body: {
          dealId: deal.id,
          itemName: deal.item_name,
          amount: deal.amount,
          firstName: names.firstName,
          lastName: names.lastName,
          email: session.user.email,
          requestId: window.crypto.randomUUID(),
          inspectionHours: deal.inspection_hours,
        } },
      );
      const redirectUrl = authorization.redirectUrl ? safeTapCheckoutUrl(authorization.redirectUrl) : null;
      if (!redirectUrl) throw new Error("Tap ما رجّع رابط دفع آمن.");
      window.sessionStorage.setItem(
        "ohda.tap.authorization",
        JSON.stringify({ authorizationId: authorization.authorizationId, dealId: deal.id }),
      );
      window.location.assign(redirectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر بدء الدفع التجريبي عبر Tap.");
    } finally {
      setBusy(false);
    }
  }

  async function startStripe() {
    if (!stripeQuote?.enabled || !stripeQuote.kwdToUsdRate) {
      setError("Stripe أو سعر التحويل التجريبي غير متاح حالياً.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const checkout = await paymentRequest<{ sessionId: string; redirectUrl: string }>(
        "/api/stripe/authorizations",
        session,
        { method: "POST", body: {
        itemName: deal.item_name,
        amount: deal.amount,
        firstName: names.firstName,
        lastName: names.lastName,
        email: session.user.email,
        requestId: window.crypto.randomUUID(),
        dealId: deal.id,
      } },
      );
      const redirectUrl = safeCheckoutUrl(checkout.redirectUrl);
      if (!redirectUrl) throw new Error("رابط Stripe غير صالح.");
      window.sessionStorage.setItem(
        "ohda.stripe.session",
        JSON.stringify({ sessionId: checkout.sessionId, dealId: deal.id }),
      );
      window.location.assign(redirectUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر بدء الدفع التجريبي عبر Stripe.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (provider === "stripe") {
      void startStripe();
      return;
    }
    void startTap();
  }

  if (!open) return null;
  const stripeUsdAmount = stripeQuote?.kwdToUsdRate
    ? Math.round(deal.amount * stripeQuote.kwdToUsdRate * 100) / 100
    : null;
  const canUseTap = Boolean(tapConfig?.enabled && tapConfig.publicKey && deal.amount <= 2000);
  const canUseStripe = Boolean(
    stripeQuote?.enabled &&
    stripeUsdAmount !== null &&
    stripeUsdAmount >= 0.5 &&
    stripeUsdAmount <= 999999.99,
  );
  const nameText = `${names.firstName} ${names.lastName}`;

  return (
    <div className="payment-sheet-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="payment-sheet" role="dialog" aria-modal="true" aria-labelledby="deal-payment-title">
        <button className="payment-sheet-close" type="button" aria-label="إغلاق" onClick={onClose} disabled={busy}><X size={19} /></button>
        <span className="payment-sheet-mark"><CreditCard size={21} /></span>
        <span className="demo-ribbon compact">نسخة تجريبية — الدفع تجريبي بدون خصم حقيقي</span>
        <h2 id="deal-payment-title">اختار بوابة الدفع</h2>
        <p className="payment-sheet-item">{deal.item_name} <strong>{formatKwd(deal.amount)}</strong></p>
        <div className="payment-provider-choice">
          <button type="button" aria-pressed={provider === "tap"} className={provider === "tap" ? "chosen" : ""} onClick={() => { setProvider("tap"); setError(""); }}>Tap <small>KWD · اختبار</small></button>
          <button type="button" aria-pressed={provider === "stripe"} className={provider === "stripe" ? "chosen" : ""} disabled={!canUseStripe} onClick={() => { setProvider("stripe"); setError(""); }}>Stripe <small>{canUseStripe ? "USD · اختبار" : "غير مهيأ"}</small></button>
        </div>
        {loadingConfig ? <p className="muted-copy">جاري فحص إعدادات الاختبار…</p> : provider === "stripe" ? (
          <div className="payment-provider-content">
            {canUseStripe ? <><p>الدفع عبر Stripe يكون بالدولار حسب سعر التحويل الحالي للاختبار: <b dir="ltr">{stripeUsdAmount?.toFixed(2)} USD</b>.</p><small>السعر التقريبي: ١ د.ك = {stripeQuote?.kwdToUsdRate?.toFixed(4)} USD.</small><div className="tap-test-card-hint"><b>بطاقة Stripe الاختبارية</b><span dir="ltr">4242 4242 4242 4242 · 12/34 · CVC 123</span></div></> : <p role="alert">Stripe أو سعر التحويل التجريبي غير متاح. استخدم Tap أو حاول لاحقاً.</p>}
          </div>
        ) : (
          <div className="payment-provider-content">
            {deal.amount > 2000 ? <p role="alert">مبلغ الصفقة أعلى من حد Tap للاختبار. اختار Stripe أو خفّض المبلغ.</p> : canUseTap ? <>
              <p>صفحة Tap الآمنة تعرض وسائل الدفع المتاحة للاختبار، مثل KNET والبطاقات، وApple Pay إذا كان مفعّلاً في حساب الاختبار.</p>
              <div className="tap-test-card-hint"><b>اختبار KNET</b><span dir="ltr">8888880000000001 · 09/30 · PIN 1234</span></div>
              <div className="tap-test-card-hint"><b>بطاقة Tap الاختبارية</b><span dir="ltr">5123 4500 0000 0008 · 01/39 · CVC 100</span></div>
            </> : <p role="alert">مفتاح Tap الاختباري غير متاح، لذلك ما بدأنا أي حجز.</p>}
          </div>
        )}
        {statusText && <p role="status" className="success-message"><Check size={17} /> {statusText}</p>}
        {error && <p role="alert" className="inline-error">{error}</p>}
        {provider === "tap" && canUseTap && <div className="payment-profile-hint">الاسم: {nameText} · {session.user.email}</div>}
        <form onSubmit={submit} className="payment-sheet-form">
          {!statusText && <button className="button button-primary" disabled={loadingConfig || busy || (provider === "tap" && !canUseTap) || (provider === "stripe" && !canUseStripe)} type="submit">
            {busy ? "جاري تجهيز الدفع التجريبي…" : provider === "stripe" ? "المتابعة إلى Stripe" : "المتابعة إلى Tap"}
            <ArrowLeft size={17} />
          </button>}
          {statusText && <button className="button button-primary" type="button" onClick={onClose}>إغلاق <ArrowLeft size={17} /></button>}
        </form>
        <p className="payment-sheet-footnote">هذه عملية اختبار فقط. لا توجد أموال حقيقية أو تحويل للبائع.</p>
      </section>
    </div>
  );
}
