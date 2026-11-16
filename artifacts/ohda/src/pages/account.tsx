import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowLeft, ShieldCheck, UserRound } from "lucide-react";
import { applyDealAction, getDealPhotoUrl, getMessages, getProfiles, listAdminPayoutRecords, listDeals, listReceivedRatings, listWaitlistInterests, recordAdminPayout, settleTestPayment, updateProfile, type AdminPayoutRecord, type DealMessage, type OhdaDeal, type OhdaProfile, type WaitlistInterest } from "@/lib/ohda-data";
import { Card, ErrorMessage, Field, FormMessage, PageHeading, Shell, SubmitButton, WaitlistButton, useOhdaSession } from "@/components/ohda-ui";

export function ProfilePage() {
  const { session, profile, loading, refresh } = useOhdaSession();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [iban, setIban] = useState("");
  const [country, setCountry] = useState("الكويت");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [completedDeals, setCompletedDeals] = useState<number | null>(null);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  useEffect(() => {
    if (!profile) return;
    setName(profile.display_name || "");
    setPhone(profile.phone || "");
    setIban(profile.iban || "");
    setCountry(profile.country || "الكويت");
  }, [profile]);
  useEffect(() => {
    if (!session) return;
    void Promise.all([listDeals(session), listReceivedRatings(session)]).then(([deals, ratings]) => {
      setCompletedDeals(deals.filter((deal) => deal.status.toLowerCase() === "completed").length);
      setAverageRating(ratings.length ? ratings.reduce((sum, row) => sum + row.stars, 0) / ratings.length : null);
    }).catch(() => {
      setCompletedDeals(0);
      setAverageRating(null);
    });
  }, [session]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session) return;
    setBusy(true); setError(""); setSuccess("");
    const normalizedIban = iban.replace(/\s+/g, "").toUpperCase();
    if (country === "الكويت" && normalizedIban && !/^KW[A-Z0-9]{28}$/.test(normalizedIban)) {
      setError("آيبان الكويت لازم يبدأ بـ KW ويتكون من 30 خانة.");
      setBusy(false);
      return;
    }
    try {
      await updateProfile(session, { display_name: name.trim(), phone: phone.trim() || null, iban: normalizedIban || null, country });
      setSuccess("انحفظت تعديلاتك."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر حفظ التغييرات."); }
    finally { setBusy(false); }
  }
  return <Shell><div className="page-container narrow"><PageHeading eyebrow="حسابك" title="معلوماتك الشخصية" description="تقدر تعدل بياناتك بأي وقت." />{loading ? <Card><div className="skeleton-line" /></Card> : !session ? <Card className="notice-card"><h2>سجّل دخولك أول</h2><Link className="button button-primary" href="/login">تسجيل الدخول</Link></Card> : <Card className="profile-card"><div className="profile-avatar"><UserRound size={27} /></div><div className="profile-email"><strong>{session.user.email}</strong><small>عضو عهدة</small></div><form className="form-stack" onSubmit={save}>
    <Field label="الاسم المعروض" id="profile-name"><input id="profile-name" required maxLength={90} value={name} onChange={e => setName(e.target.value)} /></Field>
    <Field label="رقم الهاتف" id="profile-phone" hint="اختياري"><input id="profile-phone" type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
     <Field label="الدولة" id="profile-country"><select id="profile-country" value={country} onChange={e => setCountry(e.target.value)}>{["الكويت", "السعودية", "الإمارات", "قطر", "البحرين", "عُمان", "أخرى"].map(c => <option key={c}>{c}</option>)}</select></Field>
     <Field label="الآيبان" id="profile-iban" hint="اختياري — آيبان الكويت يبدأ بـ KW ويتكون من 30 خانة. ما يتم أي تحويل في النسخة التجريبية."><input id="profile-iban" autoComplete="off" dir="ltr" maxLength={30} value={iban} onChange={e => setIban(e.target.value.toUpperCase())} /></Field>
    <FormMessage error={error} success={success} /><SubmitButton busy={busy}>حفظ التغييرات</SubmitButton>
  </form><div className="profile-stats"><div><small>صفقات مكتملة</small><strong>{completedDeals === null ? "—" : completedDeals.toLocaleString("ar-KW")}</strong></div><div><small>متوسط التقييم</small><strong>{averageRating === null ? "—" : `${averageRating.toFixed(1)} / 5`}</strong></div></div>{country === "الكويت" && <div className="profile-coming"><div><strong>وثّق هويتك بـ هويتي</strong><span>خدمة توثيق الهوية ما نزلت للحين.</span></div><WaitlistButton feature="hawiyati_verification" label="سجل اهتمامك" /></div>}</Card>}</div></Shell>;
}

type AdminTab = "overview" | "deals" | "disputes" | "payouts" | "waitlist" | "people";
const WAITLIST_LABELS: Record<string, string> = {
  hawiyati_verification: "هويتي",
  smart_assistant: "مساعد عهدة الذكي",
  calendar_reminder: "أضف الموعد للتقويم",
  sahel_transfer: "تحويل الملكية في سهل",
  certified_inspection: "فحص معتمد",
  courier_tracking: "تتبع التوصيل",
};
function adminStatus(value: string) {
  const labels: Record<string, string> = {
    awaiting_acceptance: "بانتظار الموافقة",
    awaiting_payment: "بانتظار الدفع",
    payment_pending: "جاري التحقق",
    funded: "المبلغ محفوظ",
    shipped: "تم الشحن",
    inspection: "فترة الفحص",
    disputed: "نزاع",
    completed: "مكتملة",
    cancelled: "ملغاة",
    refunded: "تم الرد",
  };
  return labels[value.toLowerCase()] || value;
}

export function AdminPage() {
  const { session, profile, loading } = useOhdaSession();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [deals, setDeals] = useState<OhdaDeal[]>([]);
  const [people, setPeople] = useState<OhdaProfile[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistInterest[]>([]);
  const [payouts, setPayouts] = useState<AdminPayoutRecord[]>([]);
  const [disputeMessages, setDisputeMessages] = useState<Record<string, DealMessage[]>>({});
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyDeal, setBusyDeal] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function loadAdminData() {
    if (!session || profile?.role !== "admin") return;
    setBusy(true); setError("");
    try {
      const [rows, waitlistRows, payoutRows] = await Promise.all([
        listDeals(session),
        listWaitlistInterests(session),
        listAdminPayoutRecords(session),
      ]);
      setDeals(rows);
      setWaitlist(waitlistRows);
      setPayouts(payoutRows);
      const ids = rows.flatMap((deal) => [deal.seller_id || "", deal.buyer_id || ""]);
      setPeople(await getProfiles(session, ids));
      const disputes = rows.filter((deal) => deal.status.toLowerCase() === "disputed");
      const messages: Record<string, DealMessage[]> = {};
      const photos: Record<string, string[]> = {};
      await Promise.all(disputes.map(async (deal) => {
        const [rowsForDeal, urls] = await Promise.all([
          getMessages(session, deal.id).catch(() => []),
          Promise.all((deal.dispute_evidence_paths ?? []).map((path) => getDealPhotoUrl(session, path).catch(() => ""))),
        ]);
        messages[deal.id] = rowsForDeal;
        photos[deal.id] = urls.filter(Boolean);
      }));
      setDisputeMessages(messages);
      setEvidenceUrls(photos);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل بيانات الإدارة.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void loadAdminData();
  }, [session, profile]);
  async function resolveDispute(deal: OhdaDeal, decision: "buyer" | "seller") {
    if (!session || !deal.payment_provider || !deal.payment_reference || !["tap", "stripe"].includes(deal.payment_provider)) {
      setError("ما في حجز اختبار مرتبط بالنزاع يمكن تسويته.");
      return;
    }
    setBusyDeal(deal.id); setError("");
    try {
      const names = (people.find((person) => person.id === session.user.id)?.display_name || "Ohda Admin").trim().split(/\s+/);
      await settleTestPayment({
        session,
        provider: deal.payment_provider,
        action: decision === "buyer" ? "void" : "capture",
        reference: deal.payment_reference,
        amount: deal.amount,
        dealId: deal.id,
        firstName: names[0],
        lastName: names.slice(1).join(" ") || "Admin",
        email: session.user.email,
      });
      await applyDealAction(session, decision === "buyer" ? "resolve_buyer" : "resolve_seller", {
        deal_id: deal.id,
        note: notes[deal.id]?.trim() ?? "",
      });
      await loadAdminData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حل النزاع.");
    } finally { setBusyDeal(""); }
  }
  async function recordPayout(deal: OhdaDeal) {
    if (!session) return;
    setBusyDeal(deal.id); setError("");
    try {
      await recordAdminPayout(session, deal, notes[deal.id] ?? "");
      await loadAdminData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل التحويل.");
    } finally { setBusyDeal(""); }
  }
  const completed = deals.filter((deal) => deal.status.toLowerCase() === "completed");
  const heldKwd = deals.filter((deal) => deal.payment_state.toLowerCase() === "authorized").reduce((sum, deal) => sum + deal.amount, 0);
  const feesEarned = completed.reduce((sum, deal) => sum + deal.fee_amount, 0);
  const completionRate = deals.length ? Math.round(completed.length / deals.length * 100) : 0;
  const disputed = deals.filter((deal) => deal.status.toLowerCase() === "disputed");
  const featureCounts = waitlist.reduce<Record<string, number>>((counts, interest) => {
    counts[interest.feature] = (counts[interest.feature] ?? 0) + 1;
    return counts;
  }, {});
  return <Shell><div className="admin-layout"><aside className="admin-rail"><div className="admin-brand"><span className="brand-lock"><ShieldCheck size={18} /></span><strong>إدارة عهدة</strong></div><p>لوحة إدارة داخلية</p><button className={tab === "overview" ? "admin-tab active" : "admin-tab"} onClick={() => setTab("overview")}>نظرة عامة</button><button className={tab === "deals" ? "admin-tab active" : "admin-tab"} onClick={() => setTab("deals")}>الصفقات</button><button className={tab === "disputes" ? "admin-tab active" : "admin-tab"} onClick={() => setTab("disputes")}>النزاعات</button><button className={tab === "payouts" ? "admin-tab active" : "admin-tab"} onClick={() => setTab("payouts")}>التحويلات</button><button className={tab === "waitlist" ? "admin-tab active" : "admin-tab"} onClick={() => setTab("waitlist")}>قائمة الانتظار</button><button className={tab === "people" ? "admin-tab active" : "admin-tab"} onClick={() => setTab("people")}>الأعضاء</button><Link href="/" className="admin-home-link">العودة لعهدة <ArrowLeft size={15} /></Link></aside><main className="admin-content">
    {loading ? <Card><div className="skeleton-line" /></Card> : !session ? <Card className="notice-card"><h2>تسجيل دخول مطلوب</h2><p>لوحة الإدارة للمخولين فقط.</p><Link href="/login" className="button button-primary">تسجيل الدخول</Link></Card> : profile?.role !== "admin" ? <Card className="access-denied"><ShieldCheck size={27} /><h1>هالصفحة للإدارة فقط</h1><p>حسابك ما عنده صلاحية دخول لوحة الإدارة.</p><Link className="button button-secondary" href="/">الرئيسية</Link></Card> : <>
       <PageHeading eyebrow="إدارة عهدة" title={tab === "overview" ? "نظرة عامة" : tab === "deals" ? "الصفقات" : tab === "disputes" ? "النزاعات" : tab === "payouts" ? "التحويلات" : tab === "waitlist" ? "قائمة الانتظار" : "الأعضاء"} description="بيانات مباشرة من سجلات عهدة." />
      {error && <ErrorMessage>{error}</ErrorMessage>}
       {tab === "overview" && <><div className="admin-stats"><Card><small>إجمالي الصفقات</small><strong>{busy ? "—" : deals.length.toLocaleString("ar-KW")}</strong></Card><Card><small>المبلغ المحجوز للاختبار</small><strong>{heldKwd.toFixed(3)} د.ك</strong></Card><Card><small>نسبة الإتمام</small><strong>{completionRate}%</strong></Card><Card><small>العمولات المسجلة</small><strong>{feesEarned.toFixed(3)} د.ك</strong></Card><Card><small>نزاعات مفتوحة</small><strong>{disputed.length.toLocaleString("ar-KW")}</strong></Card></div><Card className="admin-note"><h2>تنبيه تشغيل</h2><p>كل المدفوعات اختبار فقط. سجل التحويل لا يرسل أموالاً، والتحويل الفعلي ينتظر تفعيل Tap Marketplace.</p></Card></>}
       {tab === "deals" && <Card className="admin-table-card"><div className="table-scroll"><table className="admin-table"><thead><tr><th>الرمز</th><th>الغرض</th><th>القيمة</th><th>طريقة التسليم</th><th>الحالة</th><th>ملاحظة</th><th>فتح</th></tr></thead><tbody>{deals.map(deal => { const late = deal.status.toLowerCase() === "shipped" && Date.now() - new Date(deal.updated_at).getTime() >= 7 * 24 * 60 * 60 * 1000; return <tr key={deal.id}><td dir="ltr">{deal.code}</td><td>{deal.item_name}</td><td>{deal.amount.toFixed(3)} د.ك</td><td>{deal.delivery_method === "delivery" ? "توصيل" : "حضوري"}</td><td><span className={`status-chip status-${deal.status}`}>{adminStatus(deal.status)}</span></td><td>{late ? <span className="late-flag">تأخر الشحن 7+ أيام</span> : "—"}</td><td><Link href={`/deals/${deal.id}`}>التفاصيل</Link></td></tr>; })}</tbody></table>{!busy && deals.length === 0 && <p className="muted-copy">ما في صفقات للعرض.</p>}</div></Card>}
       {tab === "disputes" && <div className="admin-dispute-list">{disputed.map((deal) => <Card className="admin-dispute" key={deal.id}><div className="admin-dispute-head"><div><span className="status-chip status-disputed">نزاع</span><h2>{deal.item_name}</h2><small>{deal.code} · {deal.amount.toFixed(3)} د.ك</small></div><Link href={`/deals/${deal.id}`}>صفحة الصفقة</Link></div><p className="admin-dispute-reason">{deal.dispute_reason || "ما تم تسجيل سبب."}</p>{(evidenceUrls[deal.id] ?? []).length > 0 && <div className="admin-evidence">{evidenceUrls[deal.id].map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}><img src={url} alt={`دليل ${index + 1}`} /></a>)}</div>}<div className="admin-chat-excerpt">{(disputeMessages[deal.id] ?? []).slice(-5).map((message) => <p key={message.id}><b>{people.find((person) => person.id === message.sender_id)?.display_name || "عضو"}:</b> {message.body}</p>)}</div><textarea aria-label="ملاحظة حل النزاع" placeholder="اكتب ملاحظة القرار" maxLength={1000} value={notes[deal.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [deal.id]: event.target.value }))} /><div className="admin-dispute-actions"><button className="button button-secondary" disabled={busyDeal === deal.id} onClick={() => void resolveDispute(deal, "buyer")}>إرجاع المبلغ للمشتري</button><button className="button button-primary" disabled={busyDeal === deal.id} onClick={() => void resolveDispute(deal, "seller")}>صرف للبائع</button></div></Card>)}{!busy && !disputed.length && <Card className="empty-state"><h2>ما في نزاعات مفتوحة</h2></Card>}</div>}
       {tab === "payouts" && <><Card className="admin-note"><h2>سجل التحويل اليدوي</h2><p>هذا يسجل صافي مستحقات البائع فقط؛ ما ينفذ تحويلاً. تحويل Tap الفعلي غير متاح حتى تفعيل Tap Marketplace.</p></Card><Card className="admin-table-card"><div className="table-scroll"><table className="admin-table"><thead><tr><th>الصفقة</th><th>البائع</th><th>القيمة</th><th>العمولة</th><th>الصافي</th><th>الإجراء</th></tr></thead><tbody>{completed.map((deal) => { const payout = payouts.find((row) => row.deal_id === deal.id); return <tr key={deal.id}><td dir="ltr">{deal.code}</td><td>{people.find((person) => person.id === deal.seller_id)?.display_name || "بائع"}</td><td>{deal.amount.toFixed(3)} د.ك</td><td>{deal.fee_amount.toFixed(3)} د.ك</td><td>{Math.max(deal.amount - deal.fee_amount, 0).toFixed(3)} د.ك</td><td>{payout ? "تم التسجيل" : <button className="table-action" disabled={busyDeal === deal.id} onClick={() => void recordPayout(deal)}>تسجيل التحويل</button>}</td></tr>; })}</tbody></table>{!busy && !completed.length && <p className="muted-copy">ما في صفقات مكتملة للتحويل.</p>}</div></Card><Card className="admin-table-card"><h2 className="card-title">التحويلات المسجلة</h2><div className="table-scroll"><table className="admin-table"><thead><tr><th>الصفقة</th><th>الصافي</th><th>ملاحظة</th><th>التاريخ</th></tr></thead><tbody>{payouts.map((row) => <tr key={row.id}><td dir="ltr">{deals.find((deal) => deal.id === row.deal_id)?.code || row.deal_id.slice(0, 8)}</td><td>{Number(row.net_amount).toFixed(3)} د.ك</td><td>{row.note || "—"}</td><td>{new Date(row.created_at).toLocaleDateString("ar-KW")}</td></tr>)}</tbody></table></div></Card></>}
       {tab === "waitlist" && <Card className="waitlist-admin"><h2 className="card-title">اهتمام الأعضاء بالميزات القادمة</h2>{Object.entries(WAITLIST_LABELS).map(([feature, label]) => <div key={feature}><span>{label}</span><strong>{(featureCounts[feature] ?? 0).toLocaleString("ar-KW")}</strong></div>)}</Card>}
      {tab === "people" && <Card className="admin-table-card"><div className="table-scroll"><table className="admin-table"><thead><tr><th>الاسم</th><th>الدولة</th><th>تاريخ الانضمام</th><th>الدور</th></tr></thead><tbody>{people.map(person => <tr key={person.id}><td>{person.display_name}</td><td>{person.country}</td><td>{new Date(person.created_at).toLocaleDateString("ar-KW")}</td><td>{person.role === "admin" ? "إدارة" : "عضو"}</td></tr>)}</tbody></table>{!busy && people.length === 0 && <p className="muted-copy">ما في أعضاء مرتبطين بصفقات للعرض.</p>}</div></Card>}
    </>}
  </main></div></Shell>;
}
