import { useEffect, useState, type FormEvent } from "react";
import {
  Currencies,
  Direction,
  Edges,
  Locale,
  Scope,
  TapCard,
  Theme,
  tokenize,
} from "@tap-payments/card-web";
import {
  createTapAuthorization,
  getTapAuthorization,
  getTapPaymentConfig,
  createStripeAuthorization,
  getStripeAuthorization,
  getStripePaymentConfig,
} from "@workspace/api-client-react";
import { ArrowLeft, Check, CreditCard, X } from "lucide-react";

const RETURN_SESSION_KEY = "ohda.tap.authorization";

type TapConfig = Awaited<ReturnType<typeof getTapPaymentConfig>>;
type TapStatus = Awaited<ReturnType<typeof getTapAuthorization>>;
type StripeConfig = Awaited<ReturnType<typeof getStripePaymentConfig>>;
type StripeStatus = Awaited<ReturnType<typeof getStripeAuthorization>>;
type PaymentProvider = "demo" | "tap" | "stripe";
type DemoStatus = {
  authorizationId: string;
  status: "DEMO_AUTHORIZED";
  amount: number;
  currency: "KWD";
};

function providerName(provider: PaymentProvider): string {
  if (provider === "demo") return "المحاكاة";
  return provider === "tap" ? "Tap" : "Stripe";
}

function providerCurrency(provider: PaymentProvider): "KWD" | "USD" {
  return provider === "stripe" ? "USD" : "KWD";
}

function getSafeStripeCheckoutUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function findTapToken(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof value === "string") {
    return /^tok_[A-Za-z0-9]+$/.test(value) ? value : null;
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (typeof record.id === "string" && /^tok_[A-Za-z0-9]+$/.test(record.id)) {
    return record.id;
  }
  for (const key of ["token", "data", "source", "object"]) {
    const nested = findTapToken(record[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function findTapErrorCode(value: unknown, depth = 0): string | null {
  if (depth > 3 || !value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["code", "error_code", "errorCode", "type"]) {
    const code = record[key];
    if (typeof code === "string" && /^[A-Za-z0-9_-]{2,50}$/.test(code)) {
      return code;
    }
  }
  return findTapErrorCode(record.error, depth + 1);
}

function statusMessage(provider: PaymentProvider, status: string): string {
  if (provider === "demo" && status === "DEMO_AUTHORIZED") {
    return "اكتملت محاكاة الدفع بنجاح. لم تُنفذ أي معاملة فعلية.";
  }
  if (provider === "stripe" && status.toUpperCase() === "AUTHORIZED") {
    return "تم حجز المبلغ للاختبار فقط. ما تم تحصيله.";
  }
  if (provider === "stripe" && status.toUpperCase() === "NOT_AUTHORIZED") {
    return "لم يتم تأكيد الحجز التجريبي من Stripe.";
  }
  switch (status.toUpperCase()) {
    case "AUTHORIZED":
      return "تم الحجز التجريبي بنجاح. ما تم تحصيل المبلغ.";
    case "CAPTURED":
      return "تم التحصيل في وضع الاختبار فقط.";
    case "VOID":
      return "انفك الحجز التجريبي.";
    case "INITIATED":
      return provider === "stripe"
        ? "لم يكتمل الحجز التجريبي لدى Stripe."
        : "بانتظار إكمال خطوة التحقق لدى Tap.";
    case "DECLINED":
    case "FAILED":
    case "REQUIRES_PAYMENT_METHOD":
      return provider === "stripe"
        ? "لم تكتمل عملية الاختبار. تحقق من بطاقة Stripe الاختبارية وحاول مرة ثانية."
        : "لم تكتمل عملية الاختبار. جرّب بطاقة Tap الاختبارية مرة ثانية.";
    default:
      return `حالة العملية: ${status}`;
  }
}

function formatPaymentAmount(amount: number, currency: string): string {
  return currency === "KWD"
    ? `${amount.toFixed(3)} د.ك`
    : `$${amount.toFixed(2)} USD`;
}

export function TapPaymentDialog({
  open,
  onClose,
  returnedAuthorizationId,
  returnedStripeSessionId,
}: {
  open: boolean;
  onClose: () => void;
  returnedAuthorizationId?: string | null;
  returnedStripeSessionId?: string | null;
}) {
  const [tapConfig, setTapConfig] = useState<TapConfig | null>(null);
  const [stripeConfig, setStripeConfig] = useState<StripeConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [provider, setProvider] = useState<PaymentProvider>("demo");
  const [statusProvider, setStatusProvider] = useState<PaymentProvider>("demo");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [itemName, setItemName] = useState("");
  const [tapAmount, setTapAmount] = useState("20");
  const [stripeAmount, setStripeAmount] = useState("20");
  const [requestId, setRequestId] = useState("");
  const [cardReady, setCardReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [cardStep, setCardStep] = useState(false);
  const [tokenizing, setTokenizing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<TapStatus | StripeStatus | DemoStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusRetry, setStatusRetry] = useState(0);
  const [mutationLoading, setMutationLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setConfigLoading(true);
    Promise.all([
      getTapPaymentConfig()
        .then((result) => {
          if (!cancelled) setTapConfig(result);
        })
        .catch(() => {
          if (!cancelled) setTapConfig({ enabled: false, publicKey: null });
        }),
      getStripePaymentConfig()
        .then((result) => {
          if (!cancelled) setStripeConfig(result);
        })
        .catch(() => {
          if (!cancelled) setStripeConfig({ enabled: false });
        }),
    ]).finally(() => {
      if (!cancelled) setConfigLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !returnedAuthorizationId || returnedStripeSessionId) return;
    let cancelled = false;
    setProvider("demo");
    setStatusProvider("tap");
    setStatusLoading(true);
    setStatusError("");
    getTapAuthorization(returnedAuthorizationId)
      .then((result) => {
        if (!cancelled) {
          setStatus(result);
          setStatusError("");
        }
      })
      .catch(() => {
        if (!cancelled) setStatusError("تعذر التحقق من العملية لدى Tap.");
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, returnedAuthorizationId, returnedStripeSessionId, statusRetry]);

  useEffect(() => {
    if (!open || !returnedStripeSessionId) return;
    let cancelled = false;
    setProvider("stripe");
    setStatusProvider("stripe");
    setStatusLoading(true);
    setStatusError("");
    getStripeAuthorization(returnedStripeSessionId)
      .then((result) => {
        if (!cancelled) {
          setStatus(result);
          setStatusError("");
        }
      })
      .catch(() => {
        if (!cancelled) setStatusError("تعذر التحقق من العملية لدى Stripe.");
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, returnedStripeSessionId, statusRetry]);

  useEffect(() => {
    if (open) return;
    setStatus(null);
    setStatusError("");
    setStatusLoading(false);
    setProvider("demo");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !tokenizing && !mutationLoading) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, tokenizing, mutationLoading]);

  if (!open) return null;

  const selectedProviderEnabled =
    provider === "demo" ||
    (provider === "tap"
      ? Boolean(tapConfig?.enabled && tapConfig.publicKey)
      : Boolean(stripeConfig?.enabled));
  const amount = provider === "stripe" ? stripeAmount : tapAmount;
  const setAmount = provider === "stripe" ? setStripeAmount : setTapAmount;
  const numericAmount = Number(amount);
  const minimumAmount = providerCurrency(provider) === "KWD" ? 0.1 : 0.5;
  const amountScale = providerCurrency(provider) === "KWD" ? 1000 : 100;
  const amountIsValid =
    Number.isFinite(numericAmount) &&
    numericAmount >= minimumAmount &&
    numericAmount <= 2000 &&
    Math.abs(numericAmount * amountScale - Math.round(numericAmount * amountScale)) < 1e-7;
  const canContinue =
    selectedProviderEnabled &&
    itemName.trim().length > 0 &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.includes("@") &&
    amountIsValid;
  const canTokenize =
    cardStep &&
    requestId.length > 0 &&
    provider === "tap" &&
    Boolean(tapConfig?.enabled && tapConfig.publicKey) &&
    cardReady &&
    cardValid &&
    itemName.trim().length > 0 &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.includes("@") &&
    amountIsValid &&
    !tokenizing &&
    !mutationLoading;

  async function createStripeCheckout() {
    if (!canContinue || mutationLoading) return;
    setMutationLoading(true);
    setError("");
    const idempotencyKey = window.crypto.randomUUID();
    try {
      const checkout = await createStripeAuthorization({
        itemName: itemName.trim(),
        amount: Math.round(numericAmount * 100) / 100,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        requestId: idempotencyKey,
      });
      const redirectUrl = getSafeStripeCheckoutUrl(checkout.redirectUrl);
      if (!redirectUrl) {
        setError("رابط الدفع الآمن لدى Stripe غير صالح.");
        return;
      }
      window.location.assign(redirectUrl);
    } catch {
      setError("تعذر بدء الحجز التجريبي. تأكد من إعداد Stripe للاختبار.");
    } finally {
      setMutationLoading(false);
    }
  }

  async function handleTokenCreated(data: unknown) {
    setTokenizing(false);
    const tokenId = findTapToken(data);
    if (!tokenId) {
      setError("ما وصلنا رمز البطاقة من Tap. أعد المحاولة.");
      return;
    }

    setMutationLoading(true);
    setError("");
    try {
      const authorization = await createTapAuthorization({
        itemName: itemName.trim(),
        amount: Math.round(numericAmount * 1000) / 1000,
        tokenId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        requestId,
      });
      sessionStorage.setItem(
        RETURN_SESSION_KEY,
        JSON.stringify({
          authorizationId: authorization.authorizationId,
          itemName: itemName.trim(),
          amount: numericAmount,
        }),
      );
      if (authorization.redirectUrl) {
        window.location.assign(authorization.redirectUrl);
        return;
      }
      setStatus({
        authorizationId: authorization.authorizationId,
        status: authorization.status,
        amount: numericAmount,
        currency: "KWD",
      });
    } catch {
      setError("تعذر بدء الحجز التجريبي. تأكد من بيانات الاختبار وحاول مرة ثانية.");
    } finally {
      setMutationLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (provider === "stripe") {
      void createStripeCheckout();
      return;
    }
    if (!cardStep) {
      if (!canContinue) return;
      setError("");
      setCardReady(false);
      setCardValid(false);
      setRequestId(window.crypto.randomUUID());
      setCardStep(true);
      return;
    }
    if (provider === "demo") {
      if (!canContinue) return;
      setStatusProvider("demo");
      setStatus({
        authorizationId: `demo_${window.crypto.randomUUID()}`,
        status: "DEMO_AUTHORIZED",
        amount: numericAmount,
        currency: "KWD",
      });
      setCardStep(false);
      return;
    }
    if (!canTokenize) return;
    setError("");
    setTokenizing(true);
    try {
      tokenize();
    } catch {
      setTokenizing(false);
      setError("تعذر إرسال بيانات البطاقة إلى Tap. أعد المحاولة.");
    }
  }

  return (
    <div
      className="ohda-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !tokenizing && !mutationLoading) onClose();
      }}
    >
      <section
        aria-labelledby="tap-dialog-title"
        aria-modal="true"
        className="ohda-dialog ohda-payment-dialog"
        role="dialog"
      >
        <button
          aria-label="إغلاق"
          className="ohda-dialog-close"
          disabled={tokenizing || mutationLoading}
          onClick={onClose}
          type="button"
        >
          <X size={19} />
        </button>
        <div className="ohda-dialog-mark"><CreditCard size={22} /></div>
        <h2 id="tap-dialog-title">
          {status
            ? statusProvider === "demo"
              ? "نتيجة محاكاة الدفع"
              : `نتيجة حجز ${providerName(statusProvider)} التجريبي`
            : provider === "demo"
              ? "جرّب الدفع بالمحاكاة"
              : `جرّب حجز مبلغ مع ${providerName(provider)}`}
        </h2>

            {status || returnedAuthorizationId || returnedStripeSessionId ? (
          <div aria-live="polite" className="ohda-payment-result">
            {statusLoading ||
            ((returnedAuthorizationId || returnedStripeSessionId) &&
              !status &&
              !statusError) ? (
              <p className="ohda-dialog-copy">
                جاري التحقق من الحالة لدى {providerName(statusProvider)}…
              </p>
            ) : statusError ? (
              <>
                <p aria-live="polite" className="ohda-form-error" role="alert">{statusError}</p>
                <button
                  className="ohda-button ohda-button-primary ohda-dialog-submit"
                  onClick={() => setStatusRetry((retry) => retry + 1)}
                  type="button"
                >
                  أعد التحقق <ArrowLeft size={17} />
                </button>
              </>
            ) : status ? (
              <>
                <div className="ohda-payment-result-icon"><Check size={20} /></div>
                  <strong>{statusMessage(statusProvider, status.status)}</strong>
                <span>
                  {formatPaymentAmount(status.amount, status.currency)} ·{" "}
                  {statusProvider === "demo" ? "محاكاة" : status.status}
                </span>
                <p className="ohda-dialog-copy">
                  {statusProvider === "demo"
                    ? "هذه محاكاة للعرض فقط؛ لم يتم إرسال بيانات بطاقة أو الاتصال ببوابة دفع."
                    : "هذه عملية اختبار فقط. لا يوجد تحويل للبائع."}
                  {statusProvider === "tap" &&
                    " الحجز التجريبي ينتهي تلقائياً بعد ٢٤ ساعة."}
                </p>
                <button
                  className="ohda-button ohda-button-primary ohda-dialog-submit"
                  onClick={() => {
                    sessionStorage.removeItem(RETURN_SESSION_KEY);
                    onClose();
                  }}
                  type="button"
                >
                  إغلاق <ArrowLeft size={17} />
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <p className="ohda-dialog-copy">
              المحاكاة تعمل دون بوابة أو خصم. Tap وStripe متاحان للاختبار عند إعداد مفاتيح الاختبار.
            </p>

            <div aria-label="بوابة الدفع" className="ohda-payment-providers">
              <button
                aria-pressed={provider === "demo"}
                className={`ohda-payment-provider ${provider === "demo" ? "is-active" : ""}`}
                disabled={tokenizing || mutationLoading}
                onClick={() => {
                  setProvider("demo");
                  setCardStep(false);
                  setRequestId("");
                  setError("");
                }}
                type="button"
              >
                محاكاة <small>بدون اتصال أو خصم</small>
              </button>
              <button
                aria-pressed={provider === "tap"}
                className={`ohda-payment-provider ${provider === "tap" ? "is-active" : ""}`}
                disabled={tokenizing || mutationLoading}
                onClick={() => {
                  setProvider("tap");
                  setCardStep(false);
                  setRequestId("");
                  setError("");
                }}
                type="button"
              >
                Tap <small>{tapConfig?.enabled ? "اختبار · KWD" : "غير مهيأ"}</small>
              </button>
              <button
                aria-pressed={provider === "stripe"}
                className={`ohda-payment-provider ${provider === "stripe" ? "is-active" : ""} ${!stripeConfig?.enabled ? "is-disabled" : ""}`}
                disabled={!stripeConfig?.enabled || tokenizing || mutationLoading}
                onClick={() => {
                  setProvider("stripe");
                  setCardStep(false);
                  setRequestId("");
                  setError("");
                }}
                title={!stripeConfig?.enabled ? "Stripe غير مهيأ للاختبار" : undefined}
                type="button"
              >
                Stripe <small>{stripeConfig?.enabled ? "اختبار · USD" : "غير مهيأ"}</small>
              </button>
            </div>

            {configLoading ? (
              <p className="ohda-payment-loading">
                جاري تجهيز {provider === "demo" ? "المحاكاة" : provider === "tap" ? "نموذج Tap" : "Stripe"}…
              </p>
            ) : !selectedProviderEnabled ? (
              <p className="ohda-payment-unavailable" role="alert">
                {provider === "tap"
                  ? "نموذج Tap غير جاهز. تأكد من إضافة مفاتيح الاختبار في إعدادات المشروع."
                  : "Stripe غير مهيأ للاختبار. أضف مفتاح Stripe التجريبي من إعدادات الأسرار."}
              </p>
            ) : (
              <form className="ohda-payment-form" onSubmit={submit}>
                <label htmlFor="tap-item-name">اسم الغرض</label>
                <input
                  autoComplete="off"
                  id="tap-item-name"
                  maxLength={120}
                  onChange={(event) => setItemName(event.target.value)}
                  placeholder="مثال: ساعة مستعملة"
                  disabled={cardStep}
                  value={itemName}
                />

                <label htmlFor="tap-amount">
                  {providerCurrency(provider) === "KWD"
                    ? "المبلغ بالدينار الكويتي"
                    : "المبلغ بالدولار الأمريكي"}
                </label>
                <input
                  id="tap-amount"
                  inputMode="decimal"
                  max="2000"
                  min={minimumAmount}
                  onChange={(event) => setAmount(event.target.value)}
                  step={providerCurrency(provider) === "KWD" ? "0.001" : "0.01"}
                  type="number"
                  disabled={cardStep}
                  value={amount}
                />

                <div className="ohda-payment-name-fields">
                  <div>
                    <label htmlFor="tap-first-name">الاسم الأول</label>
                    <input
                      autoComplete="given-name"
                      id="tap-first-name"
                      maxLength={80}
                      onChange={(event) => setFirstName(event.target.value)}
                      disabled={cardStep}
                      value={firstName}
                    />
                  </div>
                  <div>
                    <label htmlFor="tap-last-name">اسم العائلة</label>
                    <input
                      autoComplete="family-name"
                      id="tap-last-name"
                      maxLength={80}
                      onChange={(event) => setLastName(event.target.value)}
                      disabled={cardStep}
                      value={lastName}
                    />
                  </div>
                </div>

                <label htmlFor="tap-email">البريد الإلكتروني</label>
                <input
                  autoComplete="email"
                  id="tap-email"
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={cardStep}
                  type="email"
                  value={email}
                />

                {cardStep && (
                  <>
                    <div className="ohda-payment-summary">
                      <strong>{itemName.trim()}</strong>
                       <span>{formatPaymentAmount(numericAmount, providerCurrency(provider))}</span>
                      <button
                        className="ohda-payment-edit"
                        disabled={tokenizing || mutationLoading}
                        onClick={() => {
                          setCardStep(false);
                          setCardReady(false);
                          setCardValid(false);
                          setRequestId("");
                        }}
                        type="button"
                      >
                        تعديل البيانات
                      </button>
                    </div>
                    <div className="ohda-tap-card">
                      {provider === "demo" ? (
                        <div className="ohda-demo-notice" role="status">
                          <strong>وضع المحاكاة</strong>
                          <p>
                            ما تحتاج تدخل بيانات بطاقة. عند إكمال الخطوة بنعرض نتيجة تجريبية
                            داخل الموقع فقط، بدون الاتصال بـTap أو Stripe.
                          </p>
                        </div>
                      ) : (
                        <TapCard
                        config={{
                          scope: Scope.TOKEN,
                          operator: { publicKey: tapConfig?.publicKey ?? "" },
                          order: {
                            amount: numericAmount,
                            currency: Currencies.KWD,
                            description: itemName.trim(),
                          },
                          customer: {
                            name: [{
                              lang: Locale.EN,
                              first: firstName.trim(),
                              last: lastName.trim(),
                            }],
                            contact: { email: email.trim() },
                          },
                          interface: {
                            locale: Locale.AR,
                            theme: Theme.LIGHT,
                            cardDirection: Direction.RTL,
                            edges: Edges.CURVED,
                            loader: true,
                          },
                        }}
                        onValidInput={(valid) => setCardValid(Boolean(valid))}
                        onError={(data) => {
                          setTokenizing(false);
                          const code = findTapErrorCode(data);
                          setError(
                            code
                              ? `أبلغ Tap عن خطأ (${code}). هذا الرمز لا يحدد وحده إن كانت المشكلة من البطاقة أو تحميل النموذج.`
                              : "أبلغ نموذج Tap عن خطأ. هذا لا يعني بالضرورة أن بيانات البطاقة خاطئة؛ قد تكون المشكلة في تحميل النموذج أو إعداد مفتاح الاختبار.",
                          );
                        }}
                        onReady={() => setCardReady(true)}
                        onSuccess={handleTokenCreated}
                        />
                      )}
                    </div>
                  </>
                )}

                {error && (
                  <p aria-live="polite" className="ohda-form-error" role="alert">
                    {error}
                  </p>
                )}
                {error && cardStep && provider === "tap" && (
                  <button
                    className="ohda-payment-edit"
                    disabled={tokenizing || mutationLoading}
                    onClick={() => {
                      setCardStep(false);
                      setCardReady(false);
                      setCardValid(false);
                      setRequestId("");
                      setError("");
                    }}
                    type="button"
                  >
                    أعد تحميل نموذج Tap
                  </button>
                )}
                <button
                  className="ohda-button ohda-button-primary ohda-dialog-submit"
                  disabled={cardStep && provider !== "demo" ? !canTokenize : !canContinue}
                  type="submit"
                >
                  {tokenizing || mutationLoading
                    ? "جاري تجهيز الحجز…"
                      : cardStep && provider === "demo"
                        ? "إكمال المحاكاة"
                        : cardStep
                      ? !cardReady
                        ? "جاري تحميل نموذج البطاقة…"
                        : "اختبر حجز المبلغ"
                      : provider === "stripe"
                        ? "متابعة إلى Stripe للاختبار"
                        : "متابعة إلى البطاقة"}
                  {!tokenizing && !mutationLoading && <ArrowLeft size={17} />}
                </button>
              </form>
            )}

            <p className="ohda-dialog-footnote">
              {provider === "demo"
                ? "عرض تجريبي فقط؛ لا تُدخل بيانات بطاقة ولا يتم خصم أي مبلغ."
                : provider === "tap"
                ? "بيانات البطاقة تدخل في نموذج Tap مباشرة، ولا تمر عبر خادم عهدة."
                : "تُدخل بيانات البطاقة في صفحة Stripe الآمنة. هذه عملية اختبار فقط."}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
