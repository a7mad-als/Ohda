import { Link } from "wouter";
import { ArrowLeft, BadgeCheck, Clock3, Handshake, LockKeyhole, PackageCheck, ShieldCheck, Truck, WalletCards } from "lucide-react";
import { Shell, Card, WaitlistButton } from "@/components/ohda-ui";

const steps = [
  ["المشتري يدفع", "يختار Tap أو Stripe في صفحة الدفع التجريبية."],
  ["المبلغ محفوظ في العهدة", "يظهر الحجز بعد تأكيد بوابة الاختبار فقط."],
  ["يستلم ويفحص الغرض", "مدة الفحص تبدأ بعد تأكيد وصوله أو بالتسليم الحضوري."],
  ["ينصرف المبلغ للبائع", "يكتمل الاتفاق بعد تأكيد المشتري أو انتهاء مهلة الفحص."],
];

export default function Home() {
  return <Shell>
    <div className="demo-ribbon"><span className="demo-dot" />نسخة تجريبية — ما تستقبل أموال حقيقية</div>
    <section className="hero-block">
      <div className="hero-copy"><span className="eyebrow">لصفقات المستعمل في الكويت</span><h1>بيع واشتري المستعمل بدون خوف</h1><p className="hero-subtitle">فلوسك محفوظة في العهدة لين تستلم غرضك وتتأكد منه</p><p className="hero-note">اتفاق واضح بين البايع والمشتري، وخطوات تمشي معاكم من أولها.</p>
        <div className="hero-actions"><Link className="button button-primary" href="/deals/new">ابدأ صفقة الحين <ArrowLeft size={18} /></Link><a className="button button-secondary" href="#how">شلون تشتغل؟</a></div>
        <div className="hero-proof"><span><ShieldCheck size={17} /> اتفاق موثق للطرفين</span><span><Clock3 size={17} /> فحص بعد الاستلام</span></div>
      </div>
      <div className="hero-illustration" aria-label="مراحل اتفاق الصفقة">
        <div className="illustration-top"><span>ملخص الصفقة</span><span className="demo-tag">تجربة توضيحية</span></div>
        <div className="agreement-preview"><div className="agreement-icon"><PackageCheck size={24} /></div><div><small>غرض مستعمل</small><strong>اتفاقكم واضح من البداية</strong><small>الطرفين يراجعون التفاصيل</small></div></div>
        <div className="preview-stage stage-done"><span className="stage-check"><BadgeCheck size={17} /></span><div><b>تم الاتفاق</b><small>السعر والتسليم محددين</small></div><span className="stage-state">مكتمل</span></div>
        <div className="stage-rule" />
        <div className="preview-stage stage-next"><span className="stage-check"><LockKeyhole size={16} /></span><div><b>استلام وفحص</b><small>المدة تبدأ بعد الاستلام</small></div><span className="stage-state">التالي</span></div>
        <div className="stage-rule" />
        <div className="preview-stage"><span className="stage-check"><Handshake size={16} /></span><div><b>تأكيد الإتمام</b><small>حسب موافقة الطرفين</small></div></div>
        <div className="illustration-foot"><LockKeyhole size={13} /> عرض توضيحي فقط — لا يوجد تحويل مالي</div>
      </div>
      <div className="hero-stamp">وضوح<br />من البداية</div>
    </section>

    <section className="assurance-strip" aria-label="مزايا العهدة">
      <div><WalletCards /><span><b>العمولة تبدأ من ٢٥٠ فلس</b><small>مبلغ واضح قبل الصفقة</small></span></div><div><Clock3 /><span><b>٢٤–٧٢ ساعة</b><small>مدة الفحص تختارونها</small></span></div><div><Truck /><span><b>حضوري أو توصيل</b><small>اختاروا اللي يناسبكم</small></span></div><div><BadgeCheck /><span><b>أول صفقة مجانية</b><small>ما عليها عمولة</small></span></div>
    </section>

    <section className="content-section" id="how">
      <div className="section-intro"><span className="eyebrow">ببساطة، خطوة بخطوة</span><h2>كل طرف يعرف شنو عليه.</h2><p>عهدة ترتب الاتفاق وتعرض تحديثاته. ما في خطوة مبهمة ولا رسوم مخفية.</p></div>
        <div className="steps-grid">{steps.map(([title, text], i) => <article className={`step-card ${i === 1 ? "step-held" : ""}`} key={title}><div className="step-number">٠{i + 1}</div><div className="step-mark">{i === 1 ? <LockKeyhole size={19} /> : <span />}</div><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>

    <section className="delivery-band">
      <div className="delivery-intro"><span className="eyebrow">على راحتكم</span><h2>تتقابلون أو يوصل لكم؟</h2><p>اختاروا الطريقة اللي تناسب الصفقة. اتفقوا عليها قبل تأكيد التفاصيل.</p></div>
      <div className="delivery-options">
        <Card className="delivery-card"><span className="icon-disc"><Handshake size={21} /></span><div><h3>تسليم حضوري</h3><p>تقابلوا، افحصوا الغرض، وكل واحد يأكد من حسابه. ما تتقدم الصفقة إلا بموافقة الطرفين.</p></div><span className="tiny-label">تأكيد الطرفين</span></Card>
        <Card className="delivery-card"><span className="icon-disc"><Truck size={21} /></span><div><h3>عن طريق التوصيل</h3><p>تتفقون على شركة التوصيل. المشتري يأكد وصول الغرض، وبعدها تبدأ مدة الفحص.</p></div><span className="tiny-label">الفحص بعد الوصول</span></Card>
      </div>
    </section>

    <section className="fee-section">
      <div className="section-intro"><span className="eyebrow">بدون مفاجآت</span><h2>الرسوم واضحة من قبل.</h2><p>الرسوم حسب قيمة الغرض، وتقسيمها بينكم اختياركم.</p></div>
      <Card className="fee-table-wrap"><table className="fee-table"><thead><tr><th>قيمة الصفقة</th><th>الرسوم</th></tr></thead><tbody><tr><td>إلى ٥٠ د.ك</td><td>٠٫٢٥٠ د.ك</td></tr><tr><td>من ٥٠٫٠٠١ إلى ٢٥٠ د.ك</td><td>٠٫٥٠٠ د.ك</td></tr><tr><td>من ٢٥٠٫٠٠١ إلى ١٬٠٠٠ د.ك</td><td>١٫٠٠٠ د.ك</td></tr><tr><td>من ١٬٠٠٠٫٠٠١ إلى ٥٬٠٠٠ د.ك</td><td>٢٫٠٠٠ د.ك</td></tr><tr><td>أكثر من ٥٬٠٠٠ د.ك</td><td>٣٫٠٠٠ د.ك</td></tr></tbody></table><p className="table-footnote">السيارات لها رسم ثابت ٣٫٠٠٠ د.ك. كل المبالغ بالدينار الكويتي.</p></Card>
    </section>

    <section className="feature-callout"><div><span className="eyebrow">اللي ياي بالطريج</span><h2>نبني عهدة على احتياجكم.</h2><p>سجّل اهتمامك بالميزات اللي تهمك. بنعرض لك تأكيد بعد التسجيل.</p></div><div className="feature-pills">
       <WaitlistButton feature="hawiyati_verification" label="هويتي" /><WaitlistButton feature="smart_assistant" label="مساعد عهدة الذكي" /><WaitlistButton feature="calendar_reminder" label="أضف الموعد للتقويم" /><WaitlistButton feature="sahel_transfer" label="ربط تحويل الملكية بسهل" /><WaitlistButton feature="certified_inspection" label="اطلب فحص معتمد" /><WaitlistButton feature="courier_tracking" label="تتبع مباشر مع شركة التوصيل" />
    </div></section>

    <section className="faq-section">
      <div><span className="eyebrow">قبل لا تبدأ</span><h2>أسئلة على البال.</h2><p>خلّ الصورة واضحة قبل أي اتفاق.</p></div>
      <div className="faq-list"><details><summary>هل في مدفوعات حقيقية؟</summary><p>لا. عهدة حالياً نسخة تجريبية. أي تكامل دفع متاح للاختبار فقط، وما في تحصيل أو تحويل للبائع.</p></details><details><summary>متى تبدأ مدة الفحص؟</summary><p>بالتوصيل، تبدأ بعد ما يأكد المشتري وصول الغرض. بالتسليم الحضوري، يتأكد الطرفين حسب خطوات الصفقة.</p></details><details><summary>من يدفع رسوم الصفقة؟</summary><p>صاحب الصفقة يختار إذا الرسوم على المشتري أو البائع أو تنقسم بينهم، وتظهر قيمة الرسوم قبل الإنشاء.</p></details><details><summary>شنو يصير إذا في مشكلة؟</summary><p>تقدر تسجل نزاع من تفاصيل الصفقة. حالة النزاع تحتاج متابعة من الطرفين؛ هذي النسخة ما تقدم وساطة فعلية.</p></details></div>
    </section>
    <section className="closing-cta"><div className="closing-emblem"><LockKeyhole size={23} /></div><span>الصفقة الواضحة تبدأ باتفاق</span><h2>خلّوا كل شيء بيّن.</h2><Link className="button button-primary" href="/deals/new">ابدأ صفقة الحين <ArrowLeft size={18} /></Link></section>
  </Shell>;
}
