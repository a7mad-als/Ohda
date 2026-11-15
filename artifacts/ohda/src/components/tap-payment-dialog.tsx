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
} from "@workspace/api-client-react";
import { ArrowLeft, Check, CreditCard, X } from "lucide-react";

const RETURN_SESSION_KEY = "ohda.tap.authorization";

type TapConfig = Awaited<ReturnType<typeof getTapPaymentConfig>>;
type TapStatus = Awaited<ReturnType<typeof getTapAuthorization>>;

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

function statusMessage(status: string): string {
  switch (status.toUpperCase()) {
    case "AUTHORIZED":
      return "تم الحجز التجريبي بنجاح. ما تم تحصيل المبلغ.";
    case "CAPTURED":
      return "تم التحصيل في وضع الاختبار فقط.";
    case "VOID":
      return "انفك الحجز التجريبي.";
    case "INITIATED":
      return "بانتظار إكمال خطوة التحقق لدى Tap.";
    case "DECLINED":
    case "FAILED":
      return "لم تكتمل عملية الاختبار. جرّب بطاقة Tap الاختبارية مرة ثانية.";
    default:
      return `حالة العملية: ${status}`;
  }
}

export function TapPaymentDialog({
  open,
  onClose,
  returnedAuthorizationId,
}: {
  open: boolean;
  onClose: () => void;
  returnedAuthorizationId?: string | null;
}) {
  const [config, setConfig] = useState<TapConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [itemName, setItemName] = useState("");
  const [amount, setAmount] = useState("20");
  const [requestId, setRequestId] = useState("");
  const [cardReady, setCardReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [cardStep, setCardStep] = useState(false);
  const [tokenizing, setTokenizing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<TapStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusRetry, setStatusRetry] = useState(0);
  const [mutationLoading, setMutationLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setConfigLoading(true);
    getTapPaymentConfig()
      .then((result) => {
        if (!cancelled) setConfig(result);
      })
      .catch(() => {
        if (!cancelled) setConfig({ enabled: false, publicKey: null });
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !returnedAuthorizationId) return;
    let cancelled = false;
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
  }, [open, returnedAuthorizationId, statusRetry]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !tokenizing && !mutationLoading) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, tokenizing, mutationLoading]);

  if (!open) return null;

  const numericAmount = Number(amount);
  const canContinue =
    Boolean(config?.enabled && config.publicKey) &&
    itemName.trim().length > 0 &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.includes("@") &&
    numericAmount >= 0.1 &&
    numericAmount <= 2000;
  const canTokenize =
    cardStep &&
    requestId.length > 0 &&
    Boolean(config?.enabled && config.publicKey) &&
    cardReady &&
    cardValid &&
    itemName.trim().length > 0 &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.includes("@") &&
    numericAmount >= 0.1 &&
    numericAmount <= 2000 &&
    !tokenizing &&
    !mutationLoading;

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
    if (!cardStep) {
      if (!canContinue) return;
      setError("");
      setCardReady(false);
      setCardValid(false);
      setRequestId(window.crypto.randomUUID());
      setCardStep(true);
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
          {status ? "نتيجة حجز Tap التجريبي" : "جرّب حجز مبلغ مع Tap"}
        </h2>

        {status || returnedAuthorizationId ? (
          <div aria-live="polite" className="ohda-payment-result">
            {statusLoading || (returnedAuthorizationId && !status && !statusError) ? (
              <p className="ohda-dialog-copy">جاري التحقق من الحالة لدى Tap…</p>
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
                <strong>{statusMessage(status.status)}</strong>
                <span>{status.amount.toFixed(3)} د.ك · {status.status}</span>
                <p className="ohda-dialog-copy">
                  هذه عملية اختبار فقط. لا يوجد تحويل للبائع، والحجز التجريبي ينتهي تلقائياً بعد ٢٤ ساعة.
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
              بطاقة Tap آمنة للاختبار. لا يتم تحصيل أموال حقيقية؛ الحجز التجريبي ينتهي تلقائياً بعد ٢٤ ساعة.
            </p>

            <div aria-label="بوابة الدفع" className="ohda-payment-providers">
              <span aria-current="true" className="ohda-payment-provider is-active">
                Tap <small>اختبار</small>
              </span>
              <span aria-disabled="true" className="ohda-payment-provider is-disabled" title="Stripe غير متصل حالياً">
                Stripe <small>غير متصل</small>
              </span>
            </div>

            {configLoading ? (
              <p className="ohda-payment-loading">جاري تجهيز نموذج Tap…</p>
            ) : !config?.enabled || !config.publicKey ? (
              <p className="ohda-payment-unavailable" role="alert">
                نموذج Tap غير جاهز. تأكد من إضافة مفاتيح الاختبار في إعدادات المشروع.
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

                <label htmlFor="tap-amount">المبلغ بالدينار الكويتي</label>
                <input
                  id="tap-amount"
                  inputMode="decimal"
                  max="2000"
                  min="0.1"
                  onChange={(event) => setAmount(event.target.value)}
                  step="0.001"
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
                      <span>{numericAmount.toFixed(3)} د.ك</span>
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
                      <TapCard
                        config={{
                          scope: Scope.TOKEN,
                          operator: { publicKey: config.publicKey },
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
                        onError={() => {
                          setTokenizing(false);
                          setError("بيانات البطاقة غير صحيحة. تحقق منها وحاول مرة ثانية.");
                        }}
                        onReady={() => setCardReady(true)}
                        onSuccess={handleTokenCreated}
                      />
                    </div>
                  </>
                )}

                {error && (
                  <p aria-live="polite" className="ohda-form-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="ohda-button ohda-button-primary ohda-dialog-submit"
                  disabled={cardStep ? !canTokenize : !canContinue}
                  type="submit"
                >
                  {tokenizing || mutationLoading
                    ? "جاري تجهيز الحجز…"
                    : cardStep
                      ? !cardReady
                        ? "جاري تحميل نموذج البطاقة…"
                        : "اختبر حجز المبلغ"
                      : "متابعة إلى البطاقة"}
                  {!tokenizing && !mutationLoading && <ArrowLeft size={17} />}
                </button>
              </form>
            )}

            <p className="ohda-dialog-footnote">
              بيانات البطاقة تدخل في نموذج Tap مباشرة، ولا تمر عبر خادم عهدة.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
