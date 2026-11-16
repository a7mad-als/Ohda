import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCreateDemoItem } from '@workspace/api-client-react';
import { TapPaymentDialog } from '../components/tap-payment-dialog';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUpLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleCheck,
  Clock3,
  Handshake,
  LockKeyhole,
  Menu,
  PackageCheck,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react';

const steps = [
  {
    number: '١',
    icon: LockKeyhole,
    title: 'المبلغ يبقى محفوظ',
    description: 'المشتري يدفع، والمبلغ يبقى بعهدة المنصة لين توصل السلعة.',
  },
  {
    number: '٢',
    icon: PackageCheck,
    title: 'استلم وافحص براحتك',
    description: 'تبدأ مدة الفحص بعد استلامك للغرض، مو من يوم ينشحن.',
  },
  {
    number: '٣',
    icon: CircleCheck,
    title: 'أكد، والبائع يستلم',
    description: 'إذا كل شيء مثل الاتفاق، المبلغ ينصرف للبائع.',
  },
];

const ways = [
  {
    icon: Handshake,
    title: 'تسليم حضوري',
    description: 'تقابلون بعض، وكل طرف يأكد من جواله. ما تتم الصفقة إلا بموافقتكم الاثنين.',
    tag: 'تأكيد الطرفين',
  },
  {
    icon: Truck,
    title: 'عن طريق التوصيل',
    description: 'البائع يسجل الشحنة، والمشتري يأكد وصولها. بعدها تبدأ مدة الفحص.',
    tag: 'الفحص بعد الوصول',
  },
];

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  return typeof error.status === 'number' ? error.status : null;
}

function DemoDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useCreateDemoItem();

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !mutation.isPending) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, mutation.isPending]);

  if (!open) return null;

  const trimmedName = name.trim();
  const errorStatus = getErrorStatus(mutation.error);
  const errorMessage =
    errorStatus === 503
      ? 'قاعدة البيانات غير جاهزة أو الاتصال بها غير متاح. ما انحفظ أي شيء؛ جرّب مرة ثانية بعد شوي.'
      : 'ما قدرنا نحفظ الاسم. تأكد من اتصالك وحاول مرة ثانية.';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedName || mutation.isPending) return;
    mutation.mutate(
      { data: { name: trimmedName } },
      {
        onSuccess: (result) => {
          if (result.saved) {
            setSavedName(result.name);
            setName('');
          }
        },
      },
    );
  }

  return (
    <div
      className="ohda-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !mutation.isPending) onClose();
      }}
    >
      <section
        aria-labelledby="demo-dialog-title"
        aria-modal="true"
        className="ohda-dialog"
        role="dialog"
      >
        <button
          aria-label="إغلاق"
          className="ohda-dialog-close"
          disabled={mutation.isPending}
          onClick={onClose}
          type="button"
        >
          <X size={19} />
        </button>
        <div className="ohda-dialog-mark"><PackageCheck size={22} /></div>
        {savedName ? (
          <div aria-live="polite">
            <h2 id="demo-dialog-title">انحفظ الاسم بنجاح</h2>
            <p className="ohda-dialog-copy">
              سجل تجريبي لغرض «{savedName}» محفوظ في قاعدة البيانات. هذا مو إنشاء صفقة ولا حجز مبلغ.
            </p>
            <button
              className="ohda-button ohda-button-primary ohda-dialog-submit"
              onClick={() => {
                setSavedName('');
                onClose();
              }}
              type="button"
            >
              تمام، واضح <Check size={17} />
            </button>
          </div>
        ) : (
          <>
            <h2 id="demo-dialog-title">جرّب حفظ غرض تجريبي</h2>
            <p className="ohda-dialog-copy">
              هذي تجربة لحفظ الاسم في قاعدة البيانات فقط، مو إنشاء صفقة.
            </p>
            <form className="ohda-demo-form" onSubmit={submit}>
              <label htmlFor="item-name">اسم الغرض</label>
              <input
                autoComplete="off"
                id="item-name"
                maxLength={120}
                onChange={(event) => {
                  setName(event.target.value);
                  mutation.reset();
                }}
                placeholder="مثال: ساعة مستعملة"
                ref={inputRef}
                value={name}
              />
              <span className="ohda-character-count">{name.length}/120</span>
              {mutation.isError && (
                <p aria-live="polite" className="ohda-form-error" role="alert">
                  {errorMessage}
                </p>
              )}
              <button
                className="ohda-button ohda-button-primary ohda-dialog-submit"
                disabled={!trimmedName || mutation.isPending}
                type="submit"
              >
                {mutation.isPending ? 'جاري الحفظ…' : 'احفظ الاسم التجريبي'}
                {!mutation.isPending && <ArrowLeft size={17} />}
              </button>
            </form>
            <p className="ohda-dialog-footnote">
              ما نطلب معلومات شخصية، وما في أي مدفوعات في هالتجربة.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

export default function Home() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tapDialogOpen, setTapDialogOpen] = useState(false);
  const [tapReturnId, setTapReturnId] = useState<string | null>(null);
  const [stripeReturnSessionId, setStripeReturnSessionId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('tapReturn') !== '1' &&
      params.get('stripeReturn') !== '1' &&
      params.get('stripeCancel') !== '1'
    ) {
      return;
    }
    let authorizationId: string | null = null;
    let stripeSessionId: string | null = null;

    if (params.get('tapReturn') === '1') {
      try {
        const stored = sessionStorage.getItem('ohda.tap.authorization');
        if (stored) {
          const parsed = JSON.parse(stored) as { authorizationId?: unknown };
          if (
            typeof parsed.authorizationId === 'string' &&
            /^auth_[A-Za-z0-9]+$/.test(parsed.authorizationId)
          ) {
            authorizationId = parsed.authorizationId;
          }
        }
      } catch {
        sessionStorage.removeItem('ohda.tap.authorization');
      }
    }

    if (params.get('stripeReturn') === '1') {
      const returnedSessionId = params.get('session_id');
      if (
        returnedSessionId &&
        /^cs_test_[A-Za-z0-9]+$/.test(returnedSessionId)
      ) {
        stripeSessionId = returnedSessionId;
      }
    }

    if (authorizationId) {
      setTapReturnId(authorizationId);
      setTapDialogOpen(true);
    }
    if (stripeSessionId) {
      setStripeReturnSessionId(stripeSessionId);
      setTapDialogOpen(true);
    }
    params.delete('tapReturn');
    params.delete('stripeReturn');
    params.delete('stripeCancel');
    params.delete('session_id');
    const search = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
    );
  }, []);

  return (
    <main className="ohda-page" dir="rtl">
      <div className="ohda-demo-bar">
        <span className="ohda-demo-dot" />
        نسخة تجريبية — ما تستقبل أموال حقيقية
      </div>
      <header className="ohda-header">
        <a aria-label="عهدة، الصفحة الرئيسية" className="ohda-brand" href="#home">
          <span className="ohda-brand-mark"><ShieldCheck size={21} strokeWidth={2.1} /></span>
          <span>عهدة<span className="ohda-brand-latin">OHDA</span></span>
        </a>
        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
          className="ohda-menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          type="button"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav aria-label="القائمة الرئيسية" className={menuOpen ? 'ohda-nav is-open' : 'ohda-nav'}>
          <a href="#how" onClick={() => setMenuOpen(false)}>شلون تعمل؟</a>
          <a href="#delivery" onClick={() => setMenuOpen(false)}>طرق التسليم</a>
          <a href="#questions" onClick={() => setMenuOpen(false)}>أسئلة شائعة</a>
          <button
            className="ohda-button ohda-button-nav"
            onClick={() => {
              setMenuOpen(false);
              setDialogOpen(true);
            }}
            type="button"
          >
            جرّبها
            <ArrowUpLeft size={16} />
          </button>
        </nav>
      </header>

      <section aria-labelledby="hero-title" className="ohda-hero" id="home">
        <div className="ohda-hero-glow" />
        <div className="ohda-hero-content">
          <span className="ohda-eyebrow"><span /> للصفقات اللي تستاهل الثقة</span>
          <h1 id="hero-title">
            بيع وشراء المستعمل،
            <br />
            <span>على بيّنة.</span>
          </h1>
          <p className="ohda-hero-copy">
            من تلفونك لتلفون غيرك، خلّ الصفقة تمشي بخطوات واضحة. المبلغ يبقى محفوظ لين الغرض يوصل وينفحص.
          </p>
          <div className="ohda-hero-actions">
            <button className="ohda-button ohda-button-light" onClick={() => setDialogOpen(true)} type="button">
              جرّب حفظ غرض <ArrowLeft size={17} />
            </button>
            <button className="ohda-button ohda-button-outline" onClick={() => setTapDialogOpen(true)} type="button">
              جرّب محاكاة الدفع <LockKeyhole size={16} />
            </button>
            <a className="ohda-text-link" href="#how">اكتشف شلون تعمل <ArrowDown size={16} /></a>
          </div>
          <div className="ohda-hero-details">
            <span><CheckCircle2 size={16} /> بدون تنزيل تطبيق</span>
            <span><CheckCircle2 size={16} /> محاكاة دفع بدون خصم حقيقي</span>
          </div>
        </div>

        <div aria-label="مثال توضيحي لمراحل الصفقة" className="ohda-visual">
          <div className="ohda-visual-top">
            <span>شلون تمشي الصفقة</span>
            <span className="ohda-live-label"><i /> مثال توضيحي</span>
          </div>
          <div className="ohda-item-preview">
            <div className="ohda-item-art"><span className="ohda-phone"><i /></span></div>
            <div className="ohda-item-info">
              <span className="ohda-item-kicker">غرض مستعمل</span>
              <strong>جهازك، بكل وضوح</strong>
              <span className="ohda-item-price">— د.ك</span>
            </div>
          </div>
          <div className="ohda-progress-list">
            <div className="ohda-progress-row is-done">
              <span className="ohda-progress-icon"><Check size={14} /></span>
              <div><strong>المشتري يدفع</strong><span>المبلغ يظل محفوظ</span></div>
              <span className="ohda-progress-state">محفوظ</span>
            </div>
            <div className="ohda-progress-line" />
            <div className="ohda-progress-row is-current">
              <span className="ohda-progress-icon"><PackageCheck size={15} /></span>
              <div><strong>استلام وفحص</strong><span>خذ وقتك، وتأكد من الغرض</span></div>
              <span className="ohda-progress-state">الخطوة الجاية</span>
            </div>
            <div className="ohda-progress-line" />
            <div className="ohda-progress-row">
              <span className="ohda-progress-icon"><CircleCheck size={15} /></span>
              <div><strong>البائع يستلم</strong><span>بعد تأكيد المشتري</span></div>
            </div>
          </div>
          <div className="ohda-visual-foot"><LockKeyhole size={13} /> تجربة توضيحية — بدون أموال حقيقية</div>
        </div>
        <div className="ohda-hero-orbit orbit-one" />
        <div className="ohda-hero-orbit orbit-two" />
      </section>

      <div className="ohda-trust-strip">
        <span><ShieldCheck size={17} /> اتفاق واضح للطرفين</span>
        <i />
        <span><Clock3 size={17} /> الفحص بعد الاستلام</span>
        <i />
        <span><Handshake size={17} /> حضوري أو بالتوصيل</span>
      </div>

      <section className="ohda-section ohda-how" id="how">
        <div className="ohda-section-heading">
          <span className="ohda-section-label">ببساطة، خطوة بخطوة</span>
          <h2>ثلاث خطوات. <span>وكل شيء واضح.</span></h2>
          <p>عهدة ترتب الصفقة بينكم، من أول اتفاق لين تتأكدون إن كل شيء تم مثل ما اتفقتوا.</p>
        </div>
        <div className="ohda-steps">
          {steps.map(({ number, icon: Icon, title, description }, index) => (
            <article className="ohda-step" key={number}>
              <div className="ohda-step-top">
                <span className="ohda-step-icon"><Icon size={23} strokeWidth={1.8} /></span>
                <span className="ohda-step-number">٠{number}</span>
              </div>
              {index < steps.length - 1 && <span aria-hidden="true" className="ohda-step-connector"><ArrowLeft size={17} /></span>}
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ohda-delivery" id="delivery">
        <div className="ohda-delivery-intro">
          <span className="ohda-section-label">على راحتكم</span>
          <h2>اتفقوا على الطريقة.<br /><span>وعهدة تتابع الباقي.</span></h2>
          <p>سواء تلتقون وجه لوجه أو يوصل الغرض لين بابك، كل صفقة لها خطوات تناسبها.</p>
        </div>
        <div className="ohda-way-list">
          {ways.map(({ icon: Icon, title, description, tag }) => (
            <article className="ohda-way" key={title}>
              <span className="ohda-way-icon"><Icon size={22} strokeWidth={1.8} /></span>
              <div className="ohda-way-content">
                <div className="ohda-way-heading"><h3>{title}</h3><span>{tag}</span></div>
                <p>{description}</p>
              </div>
              <CheckCircle2 className="ohda-way-check" size={19} />
            </article>
          ))}
        </div>
      </section>

      <section className="ohda-values">
        <div>
          <span className="ohda-section-label">مبنية للناس</span>
          <h2>صفقات أكثر وضوح.<br /><span>قلق أقل.</span></h2>
        </div>
        <div className="ohda-value-grid">
          <article><span>٠١</span><strong>ارسل الرابط</strong><p>شارك رابط الصفقة مع الطرف الثاني، بدون ما يحتاج ينزّل تطبيق.</p></article>
          <article><span>٠٢</span><strong>تأكدوا سوا</strong><p>كل طرف يراجع تفاصيله ويأكد من تلفونه، خصوصاً في التسليم الحضوري.</p></article>
          <article><span>٠٣</span><strong>العمولة من ٢٥٠ فلس</strong><p>رسوم تبدأ من ٢٥٠ فلس. تفاصيل أي رسوم تظهر لكم قبل إتمام الصفقة.</p></article>
        </div>
      </section>

      <section className="ohda-faq" id="questions">
        <div className="ohda-faq-heading">
          <span className="ohda-section-label">قبل لا تبدأ</span>
          <h2>أسئلة على البال.</h2>
          <p>التجربة الحالية توضّح الفكرة وتحفظ اسم غرض تجريبي فقط.</p>
        </div>
        <div className="ohda-faq-list">
          <details>
            <summary>هل أقدر أدفع الحين؟ <ChevronDown size={17} /></summary>
            <p>تقدر تجرب محاكاة الدفع داخل الموقع بدون إدخال بطاقة أو الاتصال ببوابة. Tap وStripe متاحان للاختبار فقط عند إعداد مفاتيح الاختبار، ولا يتحول شيء للبائع.</p>
          </details>
          <details>
            <summary>هل حفظ اسم الغرض ينشئ صفقة؟ <ChevronDown size={17} /></summary>
            <p>لا. هذي تجربة تقنية لحفظ الاسم في قاعدة البيانات فقط. ما فيها رابط دعوة أو حجز مبلغ أو اتفاق بين بائع ومشتري.</p>
          </details>
          <details>
            <summary>متى تبدأ مدة الفحص بالتوصيل؟ <ChevronDown size={17} /></summary>
            <p>تبدأ بعد ما يأكد المشتري إن الغرض وصل، مو من وقت الشحن.</p>
          </details>
        </div>
      </section>

      <section className="ohda-final-cta">
        <div className="ohda-final-icon"><ShieldCheck size={25} /></div>
        <span>خطوتنا الأولى تبدأ من هنا</span>
        <h2>خلّ الصفقة أوضح.</h2>
        <p>جرّب حفظ اسم غرض — خطوة صغيرة في بناء عهدة.</p>
        <button className="ohda-button ohda-button-light" onClick={() => setDialogOpen(true)} type="button">
          جرّبها الحين <ArrowLeft size={17} />
        </button>
      </section>

      <footer className="ohda-footer">
        <a aria-label="عهدة، إلى الأعلى" className="ohda-brand" href="#home">
          <span className="ohda-brand-mark"><ShieldCheck size={20} /></span>
          <span>عهدة<span className="ohda-brand-latin">OHDA</span></span>
        </a>
        <p>فكرة أوضح لصفقات المستعمل في الكويت.</p>
        <span className="ohda-footer-note">نسخة تجريبية · بدون مدفوعات حقيقية</span>
      </footer>
      <DemoDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <TapPaymentDialog
        open={tapDialogOpen}
        onClose={() => {
          setTapDialogOpen(false);
          setTapReturnId(null);
          setStripeReturnSessionId(null);
        }}
        returnedAuthorizationId={tapReturnId}
        returnedStripeSessionId={stripeReturnSessionId}
      />
    </main>
  );
}
