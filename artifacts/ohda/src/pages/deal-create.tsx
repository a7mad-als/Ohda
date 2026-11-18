import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { applyDealAction, calculateFee, createDeal, formatKwd, listDeals, uploadDealPhoto, type OhdaDeal } from "@/lib/ohda-data";
import { Card, Field, FormMessage, JoinByCode, PageHeading, Shell, SubmitButton, useOhdaSession } from "@/components/ohda-ui";

export function NewDealPage() {
  const { session, loading } = useOhdaSession();
  const [role, setRole] = useState<"seller" | "buyer">("seller");
  const [item, setItem] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("إلكترونيات");
  const [amount, setAmount] = useState("");
  const [hours, setHours] = useState(24);
  const [delivery, setDelivery] = useState<"in_person" | "delivery">("in_person");
  const [payer, setPayer] = useState<"buyer" | "seller" | "split">("split");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [firstDeal, setFirstDeal] = useState(false);
  const [created, setCreated] = useState<OhdaDeal | null>(null);
  const [copied, setCopied] = useState(false);
  const numericAmount = Number(amount);
  const fee = useMemo(() => calculateFee(numericAmount || 0, category, firstDeal), [numericAmount, category, firstDeal]);
  useEffect(() => {
    if (!session) return;
    void listDeals(session).then((deals) => {
      setFirstDeal(deals.length === 0);
    }).catch(() => setFirstDeal(false));
  }, [session]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session) return;
    setBusy(true); setError("");
    try {
      const deal = await createDeal(session, { role, item_name: item.trim(), description: description.trim(), category, amount: Math.round(numericAmount * 1000) / 1000, inspection_hours: hours, delivery_method: delivery, fee_payer: payer });
      setCreated(deal);
      if (photos.length) {
        try {
          const paths = await Promise.all(photos.map((file, index) => uploadDealPhoto(session, deal.id, file, index)));
          await applyDealAction(session, "attach_photos", { deal_id: deal.id, photo_paths: paths });
        } catch (cause) {
          setPhotoError(cause instanceof Error ? cause.message : "انحفظت الصفقة لكن تعذر رفع الصور.");
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ما قدرنا ننشئ الصفقة. تأكد من البيانات وحاول مرة ثانية.");
    } finally { setBusy(false); }
  }
  const inviteUrl = created ? `${window.location.origin}/j/${created.code}` : "";
  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("ما قدرنا ننسخ الرابط. انسخه يدويًا من الشاشة.");
    }
  }
  return <Shell><div className="page-container narrow"><PageHeading eyebrow="اتفاق جديد" title="خلّ تفاصيل الصفقة واضحة" description="عبّوا التفاصيل اللي اتفقتوا عليها. الطرف الثاني يراجعها قبل ما ينضم." />
  {!created && <JoinByCode />}
  {created ? <Card className="invite-card"><span className="invite-symbol">✓</span><span className="eyebrow">تم إنشاء الصفقة</span><h1>باقي ترسل الدعوة للطرف الثاني.</h1><p>رمز الصفقة</p><strong className="invite-code" dir="ltr">{created.code}</strong><p className="invite-link" dir="ltr">{inviteUrl}</p><div className="hero-actions"><button className="button button-primary" type="button" onClick={() => void copyInvite()}>{copied ? "اننسخ الرابط" : "انسخ رابط الدعوة"}</button><a className="button button-secondary" href={`https://wa.me/?text=${encodeURIComponent(`هلا، هذي تفاصيل صفقتنا في عهدة: ${inviteUrl}`)}`} target="_blank" rel="noreferrer">شارك على الواتساب</a></div>{photoError && <FormMessage error={photoError} />}<Link className="button button-secondary" href={`/deals/${created.id}`}>عرض تفاصيل الصفقة</Link></Card> :
  loading ? <Card><div className="skeleton-line" /><div className="skeleton-line short" /></Card> : !session ? <Card className="notice-card"><h2>تحتاج حساب عشان تبدأ</h2><p>سجّل دخولك أو سوّ حساب جديد، وبعدها نكمل تفاصيل الصفقة.</p><Link className="button button-primary" href="/login">تسجيل الدخول</Link></Card> : <form className="deal-form" onSubmit={submit}>
    <Card className="form-card"><h2 className="card-title">دورك بالصفقة</h2><div className="choice-row" role="radiogroup" aria-label="دورك"><label className={role === "seller" ? "choice selected" : "choice"}><input type="radio" name="role" checked={role === "seller"} onChange={() => setRole("seller")} /><strong>أنا البايع</strong><span>أعرض الغرض وأرسل الدعوة</span></label><label className={role === "buyer" ? "choice selected" : "choice"}><input type="radio" name="role" checked={role === "buyer"} onChange={() => setRole("buyer")} /><strong>أنا المشتري</strong><span>أبدأ الاتفاق وأدعو البايع</span></label></div></Card>
    <Card className="form-card"><h2 className="card-title">تفاصيل الغرض</h2><div className="form-stack">
      <Field label="اسم الغرض" id="deal-item"><input id="deal-item" required maxLength={120} placeholder="مثال: كاميرا مستعملة" value={item} onChange={e => setItem(e.target.value)} /></Field>
       <Field label="التصنيف" id="deal-category"><select id="deal-category" value={category} onChange={e => setCategory(e.target.value)}>{["جوال", "إلكترونيات", "ساعة", "أثاث", "سيارة", "أخرى"].map(c => <option key={c}>{c}</option>)}</select></Field>
      <Field label="وصف الاتفاق" id="deal-description" hint="اكتب الحالة أو أي ملاحظة اتفقتوا عليها."><textarea id="deal-description" rows={3} maxLength={500} value={description} onChange={e => setDescription(e.target.value)} /></Field>
       <Field label="قيمة الغرض بالدينار الكويتي" id="deal-amount"><div className="amount-input"><input id="deal-amount" required type="number" min="0.100" max="1000000" step="0.001" inputMode="decimal" placeholder="0.000" value={amount} onChange={e => setAmount(e.target.value)} /><span>د.ك</span></div></Field>
       <Field label="صور الغرض" id="deal-photos" hint={`${photos.length}/5 صور — JPG أو PNG أو WEBP، 5MB كحد أقصى للصورة`}><input id="deal-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setPhotos(Array.from(event.target.files ?? []).slice(0, 5))} /></Field>
    </div></Card>
    <Card className="form-card"><h2 className="card-title">التسليم والفحص</h2><div className="form-stack">
      <Field label="مدة الفحص بعد الاستلام" id="deal-hours"><select id="deal-hours" value={hours} onChange={e => setHours(Number(e.target.value))}><option value={24}>٢٤ ساعة</option><option value={48}>٤٨ ساعة</option><option value={72}>٧٢ ساعة</option></select></Field>
      <Field label="طريقة التسليم" id="deal-delivery"><select id="deal-delivery" value={delivery} onChange={e => setDelivery(e.target.value as "in_person" | "delivery")}><option value="in_person">تسليم حضوري — تأكيد الطرفين</option><option value="delivery">عن طريق التوصيل — الفحص بعد الوصول</option></select></Field>
      <Field label="من يدفع رسوم الصفقة؟" id="deal-fee-payer"><select id="deal-fee-payer" value={payer} onChange={e => setPayer(e.target.value as "buyer" | "seller" | "split")}><option value="split">تنقسم بيننا</option><option value="buyer">المشتري</option><option value="seller">البائع</option></select></Field>
    </div>
      <div className="fee-preview"><div><span>رسوم عهدة التقديرية</span><strong>{formatKwd(fee)}</strong></div><small>{firstDeal ? "أول صفقة لك مجانًا." : "تظهر الرسوم قبل التأكيد، وتنخصم بس عند إتمام الصفقة."}</small></div>
    </Card>
    <FormMessage error={error} /><div className="form-submit"><SubmitButton busy={busy}>أنشئ الصفقة وأرسل الدعوة</SubmitButton><p>ما في خصم أو حجز مبلغ بمجرد إنشاء الصفقة.</p></div>
  </form>}</div></Shell>;
}
