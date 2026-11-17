import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, BadgeCheck, Clock3, Handshake, LockKeyhole, PackageCheck, ShieldCheck, Truck, WalletCards, Scale, HelpCircle, Sparkles, ListChecks } from "lucide-react";
import { Shell, Card, WaitlistButton } from "@/components/ohda-ui";

const steps = [
  ["المشتري يدفع", "يدفع عبر كي نت أو البطاقة من خلال بوابة دفع مرخصة."],
  ["المبلغ محفوظ في العهدة", "المبلغ يبقى محجوز، وما يوصل للبائع قبل التأكيد."],
  ["يستلم ويفحص الغرض", "مدة الفحص تبدأ بعد التسليم الحضوري أو تأكيد وصول الشحنة."],
  ["ينصرف المبلغ للبائع", "بعد تأكيد المشتري أو انتهاء مدة الفحص بدون اعتراض."],
];

const tabs = [
  { id: "how", label: "طريقة العمل", icon: ListChecks },
  { id: "delivery", label: "طرق التسليم", icon: Truck },
  { id: "fees", label: "الرسوم", icon: WalletCards },
  { id: "disputes", label: "حل النزاعات", icon: Scale },
  { id: "faq", label: "الأسئلة الشائعة", icon: HelpCircle },
  { id: "soon", label: "قريباً", icon: Sparkles },
] as const;
type TabId = (typeof tabs)[number]["id"];

function initialTab(): TabId {
  const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
  return (tabs.find((tab) => tab.id === hash)?.id ?? "how") as TabId;
}

export default function Home() {
  const [tab, setTab] = useState<TabId>(initialTab);
  useEffect(() => {
    const onHash = () => setTab(initialTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  function open(id: TabId) {
    setTab(id);
    window.history.replaceState({}, "", `#${id}`);
    document.getElementById("home-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return <Shell>
    <section className="hero-block">
      <div className="hero-copy"><span className="eyebrow">منصة وساطة دفع لصفقات المستعمل في الكويت</span><h1>بيع واشتري المستعمل بدون خوف</h1><p className="hero-subtitle">فلوسك محفوظة في العهدة لين تستلم غرضك وتتأكد منه</p><p className="hero-note">عهدة طرف ثالث محايد بين البائع والمشتري: تحفظ المبلغ، توثّق الاتفاق، وتصرفه للبائع بعد التأكيد.</p>
        <div className="hero-actions"><Link className="button button-primary" href="/deals/new">ابدأ صفقة الحين <ArrowLeft size={18} /></Link><button type="button" className="button button-secondary" onClick={() => open("how")}>شلون تشتغل؟</button></div>
        <div className="hero-proof"><span><ShieldCheck size={17} /> اتفاق موثّق للطرفين</span><span><Clock3 size={17} /> فحص بعد الاستلام</span><span><LockKeyhole size={17} /> دفع عبر بوابات مرخصة</span></div>
      </div>
      <div className="hero-illustration" aria-label="مراحل الصفقة في عهدة">
        <div className="illustration-top"><span>ملخص الصفقة</span><span className="demo-tag">عهدة</span></div>
        <div className="agreement-preview"><div className="agreement-icon"><PackageCheck size={24} /></div><div><small>غرض مستعمل</small><strong>اتفاقكم واضح من البداية</strong><small>الطرفين يراجعون التفاصيل</small></div></div>
        <div className="preview-stage stage-done"><span className="stage-check"><BadgeCheck size={17} /></span><div><b>تم الاتفاق</b><small>السعر والتسليم محددين</small></div><span className="stage-state">مكتمل</span></div>
        <div className="stage-rule" />
        <div className="preview-stage stage-next"><span className="stage-check"><LockKeyhole size={16} /></span><div><b>المبلغ محفوظ في العهدة</b><small>بانتظار الاستلام والفحص</small></div><span className="stage-state">الحين</span></div>
        <div className="stage-rule" />
        <div className="preview-stage"><span className="stage-check"><Handshake size={16} /></span><div><b>ينصرف للبائع</b><small>بعد تأكيد المشتري</small></div></div>
        <div className="illustration-foot"><LockKeyhole size={13} /> المبلغ محمي طوال مدة الصفقة</div>
      </div>
    </section>

    <section className="assurance-strip" aria-label="مزايا العهدة">
      <div><WalletCards /><span><b>العمولة تبدأ من ٢٥٠ فلس</b><small>مبلغ واضح قبل الصفقة</small></span></div><div><Clock3 /><span><b>٢٤–٧٢ ساعة</b><small>مدة الفحص تختارونها</small></span></div><div><Truck /><span><b>حضوري أو توصيل</b><small>اختاروا اللي يناسبكم</small></span></div><div><BadgeCheck /><span><b>أول صفقة مجانية</b><small>ما عليها عمولة</small></span></div>
    </section>

    <section className="home-tabs" id="home-tabs">
      <nav className="home-tab-bar" role="tablist" aria-label="أقسام الصفحة">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} className={tab === id ? "home-tab active" : "home-tab"} onClick={() => open(id)}><Icon size={17} />{label}</button>)}
      </nav>

      <div className="home-tab-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "how" && <div className="content-section">
          <div className="section-intro"><span className="eyebrow">خطوة بخطوة</span><h2>كل طرف يعرف شنو عليه.</h2><p>عهدة ترتب الاتفاق وتوثق كل تحديث. ما في خطوة مبهمة ولا رسوم مخفية.</p></div>
          <div className="steps-grid">{steps.map(([title, text], i) => <article className={`step-card ${i === 1 ? "step-held" : ""}`} key={title}><div className="step-number">٠{i + 1}</div><div className="step-mark">{i === 1 ? <LockKeyhole size={19} /> : <span />}</div><h3>{title}</h3><p>{text}</p></article>)}</div>
        </div>}

        {tab === "delivery" && <div className="delivery-band">
          <div className="delivery-intro"><span className="eyebrow">على راحتكم</span><h2>تتقابلون أو يوصل لكم؟</h2><p>اختاروا الطريقة اللي تناسب الصفقة عند إنشائها. المبلغ محفوظ في الحالتين.</p></div>
          <div className="delivery-options">
            <Card className="delivery-card"><span className="icon-disc"><Handshake size={21} /></span><div><h3>تسليم حضوري</h3><p>البائع يعرض رمز الصفقة والمشتري يمسحه. تفحصون الغرض سوا، وكل واحد يوافق من جواله. ما تكتمل الصفقة إلا بموافقة الطرفين.</p></div><span className="tiny-label">تأكيد الطرفين لحظياً</span></Card>
            <Card className="delivery-card"><span className="icon-disc"><Truck size={21} /></span><div><h3>عن طريق التوصيل</h3><p>البائع يسجل الشحنة ورقم التتبع، والمشتري يأكد وصولها. من بعدها تبدأ مدة الفحص.</p></div><span className="tiny-label">الفحص يبدأ بعد الوصول</span></Card>
          </div>
        </div>}

        {tab === "fees" && <div className="fee-section">
          <div className="section-intro"><span className="eyebrow">بدون مفاجآت</span><h2>رسوم رمزية وثابتة.</h2><p>الرسوم حسب قيمة الصفقة، وتختارون منو يدفعها: المشتري أو البائع أو مناصفة.</p></div>
          <Card className="fee-table-wrap"><table className="fee-table"><thead><tr><th>قيمة الصفقة</th><th>الرسوم</th></tr></thead><tbody><tr><td>إلى ٥٠ د.ك</td><td>٠٫٢٥٠ د.ك</td></tr><tr><td>من ٥٠٫٠٠١ إلى ٢٥٠ د.ك</td><td>٠٫٥٠٠ د.ك</td></tr><tr><td>من ٢٥٠٫٠٠١ إلى ١٬٠٠٠ د.ك</td><td>١٫٠٠٠ د.ك</td></tr><tr><td>من ١٬٠٠٠٫٠٠١ إلى ٥٬٠٠٠ د.ك</td><td>٢٫٠٠٠ د.ك</td></tr><tr><td>أكثر من ٥٬٠٠٠ د.ك</td><td>٣٫٠٠٠ د.ك</td></tr></tbody></table><p className="table-footnote">السيارات لها رسم ثابت ٣٫٠٠٠ د.ك. أول صفقة لكل عضو مجانية. كل المبالغ بالدينار الكويتي.</p></Card>
        </div>}

        {tab === "disputes" && <div className="content-section">
          <div className="section-intro"><span className="eyebrow">إذا صار خلاف</span><h2>نزاع عادل، بقرار مسبب.</h2><p>إذا الغرض وصل غير مطابق، المشتري يفتح نزاع خلال مدة الفحص، والمبلغ يبقى محفوظ لين يصدر القرار.</p></div>
          <div className="steps-grid">
            <article className="step-card"><div className="step-number">٠١</div><div className="step-mark"><span /></div><h3>فتح النزاع</h3><p>المشتري يكتب السبب ويرفق صور توضح المشكلة.</p></article>
            <article className="step-card"><div className="step-number">٠٢</div><div className="step-mark"><span /></div><h3>جمع الأدلة</h3><p>الطرفين يقدرون يضيفون صور وتوضيح في محادثة الصفقة.</p></article>
            <article className="step-card step-held"><div className="step-number">٠٣</div><div className="step-mark"><Scale size={19} /></div><h3>حَكَم عهدة</h3><p>يراجع الاتفاق وسجل الصفقة والأدلة ويكتب توصية مسببة.</p></article>
            <article className="step-card"><div className="step-number">٠٤</div><div className="step-mark"><span /></div><h3>القرار النهائي</h3><p>فريق عهدة يعتمد القرار: إرجاع المبلغ للمشتري أو صرفه للبائع.</p></article>
          </div>
        </div>}

        {tab === "faq" && <div className="faq-section">
          <div><span className="eyebrow">قبل لا تبدأ</span><h2>أسئلة على البال.</h2><p>خلّ الصورة واضحة قبل أي اتفاق.</p></div>
          <div className="faq-list">
            <details><summary>وين يكون المبلغ وقت الصفقة؟</summary><p>المبلغ يُحجز عند بوابة دفع مرخصة (Tap أو Stripe)، وعهدة ما تصرفه للبائع إلا بعد تأكيد المشتري أو انتهاء مدة الفحص بدون اعتراض.</p></details>
            <details><summary>متى تبدأ مدة الفحص؟</summary><p>بالتوصيل تبدأ بعد ما يأكد المشتري وصول الغرض. بالتسليم الحضوري يفحص المشتري الغرض قدام البائع ويوافق الطرفين من جوالاتهم.</p></details>
            <details><summary>منو يدفع رسوم الصفقة؟</summary><p>اللي ينشئ الصفقة يختار: المشتري أو البائع أو مناصفة، والرسوم تظهر قبل الإنشاء.</p></details>
            <details><summary>شنو يصير إذا في مشكلة؟</summary><p>تفتح نزاع من صفحة الصفقة مع الصور. المبلغ يبقى محفوظ، وحَكَم عهدة يراجع الأدلة ويرفع توصية يعتمدها فريق عهدة.</p></details>
            <details><summary>أحتاج أنزّل تطبيق؟</summary><p>لا. عهدة تشتغل من المتصفح، وتقدر تضيفها لشاشة جوالك الرئيسية وتفتحها مثل التطبيق.</p></details>
          </div>
        </div>}

        {tab === "soon" && <div className="feature-callout"><div><span className="eyebrow">اللي ياي بالطريج</span><h2>نبني عهدة على احتياجكم.</h2><p>سجّل اهتمامك بالميزات اللي تهمك، ونبلغك أول ما تنزل.</p></div><div className="feature-pills">
          <WaitlistButton feature="hawiyati_verification" label="هويتي" /><WaitlistButton feature="smart_assistant" label="مساعد عهدة الذكي" /><WaitlistButton feature="calendar_reminder" label="أضف الموعد للتقويم" /><WaitlistButton feature="sahel_transfer" label="ربط تحويل الملكية بسهل" /><WaitlistButton feature="certified_inspection" label="اطلب فحص معتمد" /><WaitlistButton feature="courier_tracking" label="تتبع مباشر مع شركة التوصيل" />
        </div></div>}
      </div>
    </section>

    <section className="closing-cta"><div className="closing-emblem"><LockKeyhole size={23} /></div><span>الصفقة الواضحة تبدأ باتفاق</span><h2>خلّوا كل شيء بيّن.</h2><Link className="button button-primary" href="/deals/new">ابدأ صفقة الحين <ArrowLeft size={18} /></Link></section>
  </Shell>;
}
