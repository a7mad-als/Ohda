import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, Check, Clock3, Copy, Handshake, MessageCircle, PackageCheck, ShieldAlert, Star, Truck } from "lucide-react";
import { applyDealAction, attachDisputeEvidence, formatKwd, getDeal, getEvents, getMessages, getProfiles, joinDeal, listDeals, sendMessage, settleTestPayment, submitRating, uploadDealPhoto, type DealEvent, type DealMessage, type OhdaDeal, type OhdaProfile } from "@/lib/ohda-data";
import { Button, Card, ErrorMessage, FormMessage, PageHeading, Shell, SubmitButton, useOhdaSession } from "@/components/ohda-ui";
import { DealPaymentSheet } from "@/components/deal-payment-sheet";
import { QRCodeSVG } from "qrcode.react";

function statusTitle(status: string) {
  const names: Record<string, string> = { created: "بانتظار الطرف الثاني", pending: "بانتظار الطرف الثاني", awaiting_acceptance: "بانتظار الموافقة", awaiting_payment: "بانتظار الدفع", payment_pending: "جاري التحقق من الدفع", funded: "المبلغ محفوظ في العهدة", payment_authorized: "تم حجز المبلغ", authorized: "تم حجز المبلغ", shipped: "بالطريق", delivered: "وصل الغرض", inspection: "فترة الفحص", completed: "مكتملة", disputed: "فيها نزاع", refunded: "تم رد المبلغ", cancelled: "ملغاة", live_handover: "تسليم حضوري" };
  return names[status.toLowerCase()] || "قيد المتابعة";
}
function eventTitle(event: DealEvent) {
  if (event.event_type === "status_changed" && event.new_status) return `تغيرت الحالة إلى: ${statusTitle(event.new_status)}`;
  const labels: Record<string, string> = { deal_created: "انعملت الصفقة", party_joined: "انضم الطرف الثاني", dispute_resolved: "صدر قرار النزاع", live_approve: "وافق أحد الطرفين حضورياً", live_complete: "اكتمل التسليم الحضوري", payment_pending: "بدأ الدفع", void_payment: "تم فك حجز المبلغ", attach_photos: "أُرفقت صور", created: "انعملت الصفقة", joined: "انضم الطرف الثاني", accepted: "تم تأكيد الاتفاق", payment_authorized: "تم حجز المبلغ في العهدة", shipped: "تم تسجيل الشحن", delivery_confirmed: "تأكد استلام الغرض", inspection_started: "بدأت مدة الفحص", completed: "اكتملت الصفقة", disputed: "تم تسجيل نزاع", live_approved: "تم تأكيد التسليم الحضوري" };
  return labels[event.event_type] || "تحديث على الصفقة";
}
function inspectionRemaining(deadline: string, now: number) {
  const totalSeconds = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000));
  if (totalSeconds === 0) return "انتهت المهلة — جاري التحقق من النظام";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [days ? `${days} يوم` : "", `${hours} ساعة`, `${minutes} دقيقة`, `${seconds} ثانية`].filter(Boolean).join(" و");
}

export function DealsPage() {
  const { session, loading } = useOhdaSession();
  const [deals, setDeals] = useState<OhdaDeal[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  async function load() {
    if (!session) return;
    setBusy(true); setError("");
    try { setDeals(await listDeals(session)); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحميل الصفقات."); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [session]);
  const filtered = deals.filter(deal => filter === "all" || (filter === "active" ? !["completed", "cancelled"].includes(deal.status.toLowerCase()) : deal.status.toLowerCase() === filter));
  return <Shell><div className="page-container"><div className="heading-with-action"><PageHeading eyebrow="مساحتك" title="صفقاتي" description="تابع الاتفاقات المفتوحة واللي خلصت." /><Link className="button button-primary" href="/deals/new">صفقة جديدة <ArrowLeft size={17} /></Link></div>
    {!session && !loading ? <Card className="notice-card"><h2>سجّل دخولك لمتابعة صفقاتك</h2><Link className="button button-primary" href="/login">تسجيل الدخول</Link></Card> : <><div className="filter-row" aria-label="تصفية الصفقات">{[["all", "الكل"], ["active", "الجارية"], ["completed", "مكتملة"], ["disputed", "نزاع"]].map(([value, label]) => <button key={value} className={filter === value ? "filter-chip active" : "filter-chip"} onClick={() => setFilter(value)}>{label}</button>)}</div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {(loading || busy) && deals.length === 0 ? <div className="deal-list">{[0, 1, 2].map(n => <Card key={n}><div className="skeleton-line" /><div className="skeleton-line short" /></Card>)}</div> : filtered.length ? <div className="deal-list">{filtered.map(deal => <Link href={`/deals/${deal.id}`} className="deal-list-card" key={deal.id}><div className="deal-list-main"><span className="deal-avatar"><PackageCheck size={20} /></span><div><span className={`status-chip status-${deal.status.toLowerCase()}`}>{statusTitle(deal.status)}</span><h2>{deal.item_name}</h2><p>{deal.category} · {deal.delivery_method === "delivery" ? "عن طريق التوصيل" : "تسليم حضوري"}</p></div></div><div className="deal-list-price"><strong>{formatKwd(deal.amount)}</strong><span>رقم {deal.code}</span></div><ArrowLeft className="deal-open-icon" size={18} /></Link>)}</div> : <Card className="empty-state"><span className="empty-mark"><PackageCheck size={25} /></span><h2>{deals.length ? "ما عندك صفقات بهالتصفية" : "ما عندك صفقات للحين"}</h2><p>{deals.length ? "غيّر التصفية عشان تشوف باقي الصفقات." : "ابدأ اتفاقك الأول وشارك الدعوة مع الطرف الثاني."}</p><Link className="button button-primary" href="/deals/new">ابدأ صفقة <ArrowLeft size={17} /></Link></Card>}
    </>}</div></Shell>;
}

export function InvitePage() {
  const { code = "" } = useParams<{ code: string }>();
  const { session, loading } = useOhdaSession();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function accept() {
    if (!session) { navigate(`/login?next=${encodeURIComponent(`/j/${code}${window.location.search}`)}`); return; }
    setBusy(true); setError("");
    try {
      const deal = await joinDeal(session, code);
      navigate(new URLSearchParams(window.location.search).get("live") === "1" ? `/deals/${deal.id}/live` : `/deals/${deal.id}`);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر الانضمام للصفقة."); }
    finally { setBusy(false); }
  }
  return <Shell><div className="page-container narrow invite-page"><Card className="invite-card"><span className="invite-symbol"><PackageCheck size={27} /></span><span className="eyebrow">دعوة صفقة</span><h1>أحد داز لك اتفاق.</h1><p>راجع التفاصيل بعد الانضمام، وتأكد إن كل شيء مطابق للي اتفقتوا عليه.</p><div className="invite-code">رمز الدعوة <strong dir="ltr">{code}</strong></div>{error && <ErrorMessage>{error}</ErrorMessage>}
    {loading ? <div className="skeleton-line" /> : <Button disabled={busy} onClick={() => void accept()}>{busy ? "جاري فتح الصفقة…" : session ? "راجع الصفقة" : "سجّل دخولك للمتابعة"} <ArrowLeft size={17} /></Button>}
    <small>الانضمام ما ينفذ أي دفع أو حجز.</small></Card></div></Shell>;
}

export function DealDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { session, loading: sessionLoading } = useOhdaSession();
  const [deal, setDeal] = useState<OhdaDeal | null>(null);
  const [events, setEvents] = useState<DealEvent[]>([]);
  const [messages, setMessages] = useState<DealMessage[]>([]);
  const [people, setPeople] = useState<OhdaProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [chatError, setChatError] = useState("");
  const [rating, setRating] = useState(5);
  const [ratingText, setRatingText] = useState("");
  const [ratingState, setRatingState] = useState("");
  const [copied, setCopied] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [returnedTapAuthorizationId, setReturnedTapAuthorizationId] = useState<string | null>(null);
  const [returnedStripeSessionId, setReturnedStripeSessionId] = useState<string | null>(null);
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputePhotos, setDisputePhotos] = useState<File[]>([]);
  const [clockNow, setClockNow] = useState(Date.now());
  const expiryRunning = useRef(false);
  const reload = async (quiet = false) => {
    if (!session) return;
    if (!quiet) setLoading(true);
    try {
      const current = await getDeal(session, id);
      setDeal(current);
      if (!current) throw new Error("الصفقة مو موجودة أو ما عندك صلاحية تشوفها.");
      const [eventRows, messageRows, profiles] = await Promise.all([
        getEvents(session, id), getMessages(session, id),
        getProfiles(session, [current.seller_id || "", current.buyer_id || ""]),
      ]);
      setEvents(eventRows); setMessages(messageRows); setPeople(profiles); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحميل تفاصيل الصفقة."); }
    finally { if (!quiet) setLoading(false); }
  };
  useEffect(() => { if (session) void reload(); }, [session, id]);
  useEffect(() => {
    if (deal?.status.toLowerCase() !== "inspection" || !deal.inspection_deadline) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deal?.status, deal?.inspection_deadline]);
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => { void reload(true); }, 9000);
    return () => window.clearInterval(timer);
  }, [session, id]);
  useEffect(() => {
    if (!deal || !session) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tapReturn") === "1") {
      try {
        const pending = JSON.parse(window.sessionStorage.getItem("ohda.tap.authorization") ?? "null") as { authorizationId?: string; dealId?: string } | null;
        if (pending?.dealId === deal.id && pending.authorizationId) {
          setReturnedTapAuthorizationId(pending.authorizationId);
          setPaymentOpen(true);
        }
      } catch { /* Ignore invalid local return state. */ }
    }
    const stripeSessionId = params.get("session_id");
    if (params.get("stripeReturn") === "1" && stripeSessionId?.startsWith("cs_test_")) {
      try {
        const pending = JSON.parse(window.sessionStorage.getItem("ohda.stripe.session") ?? "null") as { sessionId?: string; dealId?: string } | null;
        if (pending?.dealId === deal.id && pending.sessionId === stripeSessionId) {
          setReturnedStripeSessionId(stripeSessionId);
          setPaymentOpen(true);
        }
      } catch { /* Ignore invalid local return state. */ }
    }
    if (params.has("tapReturn") || params.has("stripeReturn") || params.has("stripeCancel")) {
      params.delete("tapReturn");
      params.delete("stripeReturn");
      params.delete("stripeCancel");
      params.delete("session_id");
      window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    }
  }, [deal, session]);
  useEffect(() => {
    if (!deal || !session || deal.status.toLowerCase() !== "inspection" || !deal.inspection_deadline) return;
    const timer = window.setInterval(async () => {
      if (expiryRunning.current || new Date(deal.inspection_deadline as string).getTime() > Date.now()) return;
      if (!deal.payment_provider || !deal.payment_reference || !["tap", "stripe"].includes(deal.payment_provider)) {
        setActionError("انتهت مدة الفحص لكن ما في حجز مرتبط؛ تواصلوا مع الدعم قبل أي إجراء.");
        return;
      }
      expiryRunning.current = true;
      try {
        await settleTestPayment({
          provider: deal.payment_provider as "tap" | "stripe",
          session,
          action: "capture",
          reference: deal.payment_reference,
          amount: deal.amount,
          dealId: deal.id,
          email: session.user.email,
        });
        await applyDealAction(session, "expire", { deal_id: deal.id });
        await reload(true);
      } catch (cause) {
        setActionError(cause instanceof Error ? cause.message : "انتهى وقت الفحص، لكن تعذر إتمام التسوية.");
      } finally { expiryRunning.current = false; }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [deal?.id, deal?.status, deal?.inspection_deadline, session]);
  const isBuyer = deal?.buyer_id === session?.user.id;
  const isSeller = deal?.seller_id === session?.user.id;
  const otherId = isBuyer ? deal?.seller_id : deal?.buyer_id;
  const normalized = deal?.status.toLowerCase() || "";
  const paymentAuthorized = Boolean(deal?.payment_state.toLowerCase() === "authorized" && deal.payment_reference && deal.payment_provider && ["tap", "stripe"].includes(deal.payment_provider));
  const actions: { text: string; action: string; payload?: Record<string, unknown>; variant?: "primary" | "secondary" }[] = [];
  if (deal && (isBuyer || isSeller)) {
    if (normalized === "awaiting_acceptance" && deal.created_by !== session?.user.id && deal.buyer_id && deal.seller_id) actions.push({ text: "أوافق على الشروط", action: "accept" });
    if (["created", "awaiting_acceptance", "awaiting_payment", "payment_pending"].includes(normalized)) actions.push({ text: "إلغاء الصفقة", action: "cancel", variant: "secondary" });
    if (normalized === "funded" && isSeller && deal.delivery_method === "delivery") actions.push({ text: "تم شحن الغرض", action: "ship", payload: { carrier: carrier.trim(), tracking_number: trackingNumber.trim() } });
    if (normalized === "shipped" && isBuyer && deal.delivery_method === "delivery") actions.push({ text: "وصلني الغرض", action: "received" });
    if (normalized === "inspection" && isBuyer) actions.push({ text: "استلمت والغرض سليم", action: "complete" });
  }
  async function beginPayment() {
    if (!session || !deal) return;
    setBusy(true); setActionError("");
    try {
      if (normalized === "awaiting_payment") await applyDealAction(session, "payment_pending", { deal_id: id });
      await reload(true);
      setPaymentOpen(true);
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "تعذر بدء الدفع."); }
    finally { setBusy(false); }
  }
  async function runCompletion() {
    if (!session || !deal?.payment_provider || !deal.payment_reference || !["tap", "stripe"].includes(deal.payment_provider)) {
      setActionError("ما في حجز دفع مؤكد مرتبط بالصفقة.");
      return;
    }
    setBusy(true); setActionError("");
    try {
      const me = people.find((person) => person.id === session.user.id);
      const names = (me?.display_name || "Ohda Customer").trim().split(/\s+/);
      await settleTestPayment({
        provider: deal.payment_provider as "tap" | "stripe",
        session,
        action: "capture",
        reference: deal.payment_reference,
        amount: deal.amount,
        dealId: deal.id,
        firstName: names[0],
        lastName: names.slice(1).join(" ") || "Buyer",
        email: session.user.email,
      });
      await applyDealAction(session, "complete", { deal_id: id });
      await reload(true);
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "تعذر إتمام الصفقة."); }
    finally { setBusy(false); }
  }
  async function runDispute() {
    if (!session || !deal) return;
    setBusy(true); setActionError("");
    try {
      await applyDealAction(session, "dispute", { deal_id: id, reason: disputeReason.trim() });
      await reload(true);
      if (disputePhotos.length) {
        const paths = await Promise.all(disputePhotos.map((file, index) => uploadDealPhoto(session, deal.id, file, index)));
        await attachDisputeEvidence(session, deal.id, paths);
      }
      await reload(true);
    } catch (cause) {
      await reload(true);
      setActionError(cause instanceof Error ? cause.message : "تعذر تسجيل النزاع أو رفع الأدلة.");
    } finally { setBusy(false); }
  }
  async function uploadMoreEvidence() {
    if (!session || !deal || !disputePhotos.length) return;
    setBusy(true); setActionError("");
    try {
      const paths = await Promise.all(disputePhotos.map((file, index) => uploadDealPhoto(session, deal.id, file, index)));
      const existing = deal.dispute_evidence_paths ?? [];
      await attachDisputeEvidence(session, deal.id, [...existing, ...paths].slice(0, 5));
      setDisputePhotos([]);
      await reload(true);
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "تعذر رفع صور الأدلة."); }
    finally { setBusy(false); }
  }
  async function runAction(action: string, payload: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true); setActionError("");
    try {
      if (action === "cancel" && deal && ["pending", "authorized"].includes(deal.payment_state.toLowerCase())) {
        if (deal.payment_reference && deal.payment_provider && ["tap", "stripe"].includes(deal.payment_provider)) {
          const names = (people.find((person) => person.id === session.user.id)?.display_name || "Ohda Customer").trim().split(/\s+/);
          await settleTestPayment({
            provider: deal.payment_provider as "tap" | "stripe",
            session,
            action: "void",
            reference: deal.payment_reference,
            amount: deal.amount,
            dealId: deal.id,
            firstName: names[0],
            lastName: names.slice(1).join(" ") || "Buyer",
            email: session.user.email,
          });
        }
        await applyDealAction(session, "void_payment", { deal_id: id });
      }
      await applyDealAction(session, action, { deal_id: id, ...payload });
      await reload(true);
    }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "تعذر تحديث الصفقة."); }
    finally { setBusy(false); }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !message.trim()) return;
    setBusy(true); setChatError("");
    try { await sendMessage(session, id, message); setMessage(""); await reload(true); }
    catch (cause) { setChatError(cause instanceof Error ? cause.message : "تعذر إرسال الرسالة."); }
    finally { setBusy(false); }
  }
  async function rate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!session || !otherId) return;
    setRatingState(""); setChatError("");
    try { await submitRating(session, { deal_id: id, recipient_id: otherId, stars: rating, comment: ratingText }); setRatingState("وصل تقييمك، مشكور."); }
    catch (cause) { setChatError(cause instanceof Error ? cause.message : "تعذر إرسال التقييم."); }
  }
  async function copyInvite() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/j/${deal?.code}`); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setActionError("ما قدرنا ننسخ الرابط. انسخه من شريط العنوان."); }
  }
  return <Shell><div className="page-container">{sessionLoading || loading ? <div className="deal-detail-grid"><Card><div className="skeleton-line" /><div className="skeleton-line" /><div className="skeleton-line short" /></Card></div> : !session ? <Card className="notice-card"><h2>سجّل دخولك عشان تشوف الصفقة</h2><Link className="button button-primary" href="/login">تسجيل الدخول</Link></Card> : error ? <Card className="empty-state"><ErrorMessage>{error}</ErrorMessage><Button variant="secondary" onClick={() => void reload()}>إعادة المحاولة</Button></Card> : deal ? <>
    <div className="detail-back"><Link href="/deals">← كل الصفقات</Link><span>رمز الصفقة: <b dir="ltr">{deal.code}</b></span></div>
    <div className="deal-detail-grid"><div className="detail-main">
      <Card className="deal-summary"><div className="summary-top"><span className={`status-chip status-${normalized}`}>{statusTitle(deal.status)}</span><span className="summary-date">{new Date(deal.created_at).toLocaleDateString("ar-KW")}</span></div><h1>{deal.item_name}</h1><p>{deal.description || "ما في وصف إضافي."}</p><div className="summary-price"><span>قيمة الصفقة</span><strong>{formatKwd(deal.amount)}</strong></div><div className="summary-meta"><span>{deal.category}</span><span>{deal.inspection_hours} ساعة فحص</span><span>{deal.delivery_method === "delivery" ? "عن طريق التوصيل" : "تسليم حضوري"}</span></div></Card>
      {paymentAuthorized && <div className="held-seal" role="status"><span className="seal-icon"><LockKeyholeIcon /></span><div><strong>المبلغ محفوظ في العهدة</strong><small>ما ينصرف للبائع إلا بعد تأكيد المشتري أو انتهاء مدة الفحص.</small></div><span className="test-label">محفوظ</span></div>}
       {!paymentAuthorized && <div className="test-notice"><strong>المبلغ غير محجوز للحين.</strong> {normalized === "awaiting_payment" || normalized === "payment_pending" ? "اختر Tap أو Stripe لحجز المبلغ في العهدة." : "يتحجز المبلغ بعد موافقة الطرفين ودفع المشتري."}</div>}
      <Card className="participants-card"><h2 className="card-title">أطراف الصفقة</h2><div className="people-row"><Person label="البائع" name={deal.seller_id === session.user.id ? "أنت" : people.find(p => p.id === deal.seller_id)?.display_name || (deal.seller_id ? "عضو عهدة" : "بانتظار الانضمام")} /><Person label="المشتري" name={deal.buyer_id === session.user.id ? "أنت" : people.find(p => p.id === deal.buyer_id)?.display_name || (deal.buyer_id ? "عضو عهدة" : "بانتظار الانضمام")} /></div>{["created", "awaiting_acceptance"].includes(normalized) && <div className="invite-share"><div><strong>شارك الدعوة</strong><small>الطرف الثاني يقدر يراجع تفاصيل الاتفاق.</small></div><button className="icon-button" aria-label="نسخ رابط الدعوة" onClick={() => void copyInvite()}><Copy size={17} />{copied ? "اننسخ" : "نسخ الرابط"}</button></div>}</Card>
      <Card className="timeline-card"><h2 className="card-title">مسار الصفقة</h2>{events.length ? <ol className="timeline">{events.map((event, i) => <li key={event.id}><span className={i === events.length - 1 ? "timeline-dot current" : "timeline-dot"} /><div><strong>{eventTitle(event)}</strong><small>{new Date(event.created_at).toLocaleString("ar-KW", { dateStyle: "medium", timeStyle: "short" })}</small></div></li>)}</ol> : <p className="muted-copy">ما في تحديثات مسجلة للحين.</p>}</Card>
       <Card className="action-card"><h2 className="card-title">الخطوة الجاية</h2><p>كل خطوة تتأكد من حساب الطرف المعني.</p>{actionError && <ErrorMessage>{actionError}</ErrorMessage>}
       {(normalized === "awaiting_payment" || normalized === "payment_pending") && isBuyer && <Button disabled={busy} onClick={() => void beginPayment()}>{busy ? "جاري تجهيز الدفع…" : "ادفع الآن باستخدام Tap أو Stripe"}</Button>}
       {normalized === "payment_pending" && !isBuyer && <span className="muted-copy">بانتظار المشتري يكمل الدفع.</span>}
       {normalized === "funded" && isSeller && deal.delivery_method === "delivery" && <div className="form-stack"><label>شركة التوصيل (اختياري)<input value={carrier} onChange={(event) => setCarrier(event.target.value)} maxLength={100} /></label><label>رقم التتبع (اختياري)<input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} maxLength={120} /></label></div>}
       {actions.map(({ text, action, payload, variant }) => <Button key={action} disabled={busy || (action === "complete" && !paymentAuthorized)} variant={variant} onClick={() => action === "complete" ? void runCompletion() : void runAction(action, payload)}>{text}</Button>)}
       {!actions.length && !["awaiting_payment", "payment_pending"].includes(normalized) && <span className="muted-copy">ما عليك إجراء حالياً. آخر التحديثات تظهر هنا تلقائياً.</span>}
       {deal.delivery_method === "in_person" && normalized === "funded" && <Link className="button button-secondary live-link" href={`/deals/${id}/live`}>افتح شاشة التسليم الحضوري</Link>}
       {normalized === "inspection" && isBuyer && <div className="dispute-form"><label htmlFor="dispute-reason">إذا فيه مشكلة، اكتبها قبل فتح النزاع</label><textarea id="dispute-reason" rows={2} minLength={5} maxLength={1000} value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} placeholder="مثال: الغرض يختلف عن الوصف…" /><label htmlFor="dispute-photos">صور توضح المشكلة (اختياري، حتى 5)</label><input id="dispute-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setDisputePhotos(Array.from(event.target.files ?? []).slice(0, 5))} /><small className="muted-copy">{disputePhotos.length}/5 صور</small><Button variant="secondary" disabled={busy || disputeReason.trim().length < 5} onClick={() => void runDispute()}><ShieldAlert size={17} /> عندي مشكلة</Button></div>}
       {normalized === "disputed" && <div className="judge-panel judge-review"><div className="judge-head"><span className="judge-badge">حَكَم عهدة</span><strong>النزاع قيد المراجعة</strong></div><p>المبلغ محفوظ في العهدة لين يصدر القرار. حَكَم عهدة يراجع الاتفاق والصور والمحادثة، وفريق عهدة يعتمد القرار ويبلغكم هني. أضيفوا أي توضيح في المحادثة.</p></div>}
       {normalized === "disputed" && isBuyer && <div className="dispute-form"><label htmlFor="more-dispute-photos">أضف صور أدلة للنزاع (اختياري، حتى 5 بالمجموع)</label><input id="more-dispute-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setDisputePhotos(Array.from(event.target.files ?? []).slice(0, Math.max(0, 5 - (deal.dispute_evidence_paths?.length ?? 0))))} /><small className="muted-copy">{deal.dispute_evidence_paths?.length ?? 0}/5 صور محفوظة</small><Button variant="secondary" disabled={busy || !disputePhotos.length || (deal.dispute_evidence_paths?.length ?? 0) >= 5} onClick={() => void uploadMoreEvidence()}>رفع الأدلة</Button></div>}
       {normalized === "inspection" && deal.inspection_deadline && <small className="inspection-countdown" role="timer" aria-live="polite">متبقي للفحص: {inspectionRemaining(deal.inspection_deadline, clockNow)}</small>}
       </Card>
      {normalized === "completed" && otherId && <Card className="rating-card"><h2 className="card-title">قيّم تجربتك</h2><form onSubmit={rate}><div className="star-row" aria-label="عدد النجوم">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} aria-label={`${n} نجوم`} aria-pressed={rating === n} onClick={() => setRating(n)}><Star size={22} fill={rating >= n ? "currentColor" : "none"} /></button>)}</div><textarea aria-label="تعليقك" rows={2} placeholder="كلمة قصيرة عن تجربتك" value={ratingText} onChange={e => setRatingText(e.target.value)} /><Button type="submit">إرسال التقييم</Button><FormMessage success={ratingState} /></form></Card>}
    </div><aside className="detail-side"><Card className="chat-card"><h2 className="card-title"><MessageCircle size={19} /> محادثة الصفقة</h2><p className="chat-subtitle">الرسائل تتحدث تلقائياً كل شوي.</p><div className="chat-messages" aria-live="polite">{messages.length ? messages.map(msg => <div className={msg.sender_id === session.user.id ? "chat-bubble mine" : "chat-bubble"} key={msg.id}><p>{msg.body}</p><small>{new Date(msg.created_at).toLocaleTimeString("ar-KW", { hour: "2-digit", minute: "2-digit" })}</small></div>) : <div className="chat-empty">ابدأوا المحادثة وتأكدوا من التفاصيل قبل التسليم.</div>}</div><form className="chat-form" onSubmit={send}><label className="sr-only" htmlFor="chat-message">رسالتك</label><input id="chat-message" maxLength={2000} placeholder="اكتب رسالة…" value={message} onChange={e => setMessage(e.target.value)} /><Button type="submit" disabled={busy || !message.trim()}>إرسال</Button></form>{chatError && <ErrorMessage>{chatError}</ErrorMessage>}</Card><Card className="side-info"><h3><Clock3 size={18} /> مدة الفحص</h3><p>{deal.inspection_hours} ساعة من تأكيد الاستلام.</p><h3><Truck size={18} /> التوصيل</h3><p>{deal.delivery_method === "delivery" ? deal.delivery_carrier || "يحددها الطرفان بالاتفاق" : "تأكيد حضوري من الطرفين"}</p><div className="side-fee"><span>رسوم الصفقة</span><b>{formatKwd(deal.fee_amount)}</b><small>على {deal.fee_payer === "buyer" ? "المشتري" : deal.fee_payer === "seller" ? "البائع" : "الطرفين"}</small></div></Card></aside></div>
    <DealPaymentSheet open={paymentOpen} onClose={() => setPaymentOpen(false)} deal={deal} session={session} profile={people.find((person) => person.id === session.user.id) ?? null} returnedTapAuthorizationId={returnedTapAuthorizationId} returnedStripeSessionId={returnedStripeSessionId} onLinked={async () => { setPaymentOpen(false); setReturnedTapAuthorizationId(null); setReturnedStripeSessionId(null); window.sessionStorage.removeItem("ohda.tap.authorization"); window.sessionStorage.removeItem("ohda.stripe.session"); await reload(true); }} />
  </> : null}</div></Shell>;
}

function LockKeyholeIcon() { return <PackageCheck size={21} />; }
function Person({ label, name }: { label: string; name: string }) {
  return <div className="person-item"><span className="person-initial">{name === "أنت" ? "أ" : name.charAt(0)}</span><div><small>{label}</small><strong>{name}</strong></div><Check size={17} className="person-check" /></div>;
}

export function LiveHandoverPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { session } = useOhdaSession();
  const [deal, setDeal] = useState<OhdaDeal | null>(null);
  const [people, setPeople] = useState<OhdaProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [finalizeRetry, setFinalizeRetry] = useState(0);
  const finalizing = useRef(false);
  async function refresh() {
    if (!session) return;
    try {
      const current = await getDeal(session, id);
      if (!current) throw new Error("الصفقة مو موجودة أو ما عندك صلاحية تشوفها.");
      setDeal(current);
      setPeople(await getProfiles(session, [current.seller_id || "", current.buyer_id || ""]));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحميل الصفقة."); }
  }
  useEffect(() => { void refresh(); }, [session, id]);
  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [session, id]);
  const bothApproved = Boolean(deal?.live_buyer_approved && deal.live_seller_approved);
  async function finalize() {
    if (!session || !deal || !bothApproved || deal.status.toLowerCase() !== "funded" || finalizing.current) return;
    finalizing.current = true;
    setBusy(true);
    setError("");
    try {
      if (!deal.payment_provider || !deal.payment_reference || !["tap", "stripe"].includes(deal.payment_provider)) {
        throw new Error("ما في حجز مؤكد مرتبط بالصفقة.");
      }
      const names = (people.find((person) => person.id === session.user.id)?.display_name || "Ohda Customer").trim().split(/\s+/);
      await settleTestPayment({
        provider: deal.payment_provider as "tap" | "stripe",
        session,
        action: "capture",
        reference: deal.payment_reference,
        amount: deal.amount,
        dealId: deal.id,
        firstName: names[0],
        lastName: names.slice(1).join(" ") || "Buyer",
        email: session.user.email,
      });
      await applyDealAction(session, "live_complete", { deal_id: deal.id });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إتمام الصفقة.");
    } finally {
      finalizing.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (bothApproved && deal?.status.toLowerCase() === "funded") void finalize();
  }, [bothApproved, deal?.status, finalizeRetry]);
  async function approve() {
    if (!session) return;
    setBusy(true); setError("");
    try {
      const updated = await applyDealAction(session, "live_approve", { deal_id: id });
      setDeal(updated);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تسجيل التأكيد."); }
    finally { setBusy(false); }
  }
  async function pay() {
    if (!session || !deal) return;
    setBusy(true);
    setError("");
    try {
      if (deal.status.toLowerCase() === "awaiting_payment") await applyDealAction(session, "payment_pending", { deal_id: deal.id });
      await refresh();
      setPaymentOpen(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تجهيز الدفع."); }
    finally { setBusy(false); }
  }
  async function refuse() {
    if (!session || !deal || !window.confirm("هل تبي ترفض إتمام الصفقة؟ بنفك حجز المبلغ ونلغي الصفقة.")) return;
    setBusy(true);
    setError("");
    try {
      if (deal.payment_provider && deal.payment_reference && ["tap", "stripe"].includes(deal.payment_provider)) {
        await settleTestPayment({
          provider: deal.payment_provider as "tap" | "stripe",
          session,
          action: "void",
          reference: deal.payment_reference,
          amount: deal.amount,
          dealId: deal.id,
          email: session.user.email,
        });
      }
      await applyDealAction(session, "void_payment", { deal_id: deal.id });
      await applyDealAction(session, "cancel", { deal_id: deal.id });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إلغاء الصفقة."); }
    finally { setBusy(false); }
  }
  async function copyInvite() {
    if (!deal) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/j/${deal.code}?live=1`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { setError("تعذر نسخ الرابط. انسخه يدويًا."); }
  }
  const isParty = Boolean(session && (deal?.seller_id === session.user.id || deal?.buyer_id === session.user.id));
  const isBuyer = Boolean(session && deal?.buyer_id === session.user.id);
  const inviteUrl = deal ? `${window.location.origin}/j/${deal.code}?live=1` : "";
  return <main className="live-full-screen"><header className="live-top"><Link href={`/deals/${id}`}>← تفاصيل الصفقة</Link><span className="live-brand">عهدة <span>●</span></span><span className="live-status"><i /> وضع التسليم الحضوري</span></header>
    <div className="live-content">
      <div className="live-heading"><span className="live-icon"><Handshake size={26} /></span><p>تسليم حضوري مباشر</p><h1>{deal?.status.toLowerCase() === "completed" ? "تمت الصفقة بأمان" : "تأكدوا من الغرض سوا."}</h1><span className="live-subtitle">كل طرف يوافق من حسابه بعد ما يشوف الغرض. المبلغ محفوظ في العهدة لين توافقون.</span></div>
      {error && <div className="live-error" role="alert">{error}<button type="button" onClick={() => setFinalizeRetry((value) => value + 1)}>أعد المحاولة</button></div>}
      {!session ? <Link className="button button-primary" href={`/login?next=${encodeURIComponent(`/deals/${id}/live`)}`}>سجّل دخولك للمتابعة</Link> : !deal ? <div className="skeleton-line" /> : !isParty ? (
        <Card className="live-content-card"><h2>هالصفقة مو مرتبطة بحسابك</h2><Link className="button button-secondary" href={`/deals/${id}`}>رجوع للتفاصيل</Link></Card>
      ) : <div className="live-card-grid">
        {(!deal.seller_id || !deal.buyer_id) && <Card className="live-content-card live-qr-card"><p>امسح الرمز للانضمام للطرف الثاني</p><div className="live-qr"><QRCodeSVG value={inviteUrl} size={190} level="M" includeMargin /></div><strong>رمز الصفقة <b dir="ltr">{deal.code}</b></strong><button type="button" className="live-copy" onClick={() => void copyInvite()}>{copied ? "اننسخ الرابط" : "انسخ رابط الدعوة"}</button></Card>}
        <Card className="live-content-card live-deal-card"><span className="live-item-label">تفاصيل الصفقة</span><h2>{deal.item_name}</h2><strong className="live-amount">{formatKwd(deal.amount)}</strong><div className="live-parties"><div><small>البائع</small><b>{people.find((person) => person.id === deal.seller_id)?.display_name || "بانتظار البائع"}</b><span className={deal.live_seller_approved ? "live-approval yes" : "live-approval"}>{deal.live_seller_approved ? "أوافق ✓" : "بانتظار موافقة البائع"}</span></div><div><small>المشتري</small><b>{people.find((person) => person.id === deal.buyer_id)?.display_name || "بانتظار المشتري"}</b><span className={deal.live_buyer_approved ? "live-approval yes" : "live-approval"}>{deal.live_buyer_approved ? "أوافق ✓" : "بانتظار موافقة المشتري"}</span></div></div>
          {deal.status.toLowerCase() === "awaiting_acceptance" && deal.created_by !== session.user.id && <Button disabled={busy} onClick={() => void applyDealAction(session, "accept", { deal_id: deal.id }).then(refresh).catch((cause) => setError(cause instanceof Error ? cause.message : "تعذر قبول الشروط."))}>أوافق على الشروط</Button>}
          {["awaiting_payment", "payment_pending"].includes(deal.status.toLowerCase()) && isBuyer && <Button disabled={busy} onClick={() => void pay()}>{busy ? "جاري التجهيز…" : "ادفع الآن باستخدام Tap أو Stripe"}</Button>}
          {deal.status.toLowerCase() === "funded" && !bothApproved && <><Button disabled={busy || (isBuyer ? deal.live_buyer_approved : deal.live_seller_approved)} onClick={() => void approve()}>{busy ? "جاري حفظ موافقتك…" : isBuyer ? "أوافق ✓" : "أوافق ✓"}</Button><Button variant="secondary" disabled={busy} onClick={() => void refuse()}>ما أوافق ✕</Button><span className="live-waiting">{isBuyer ? deal.live_seller_approved ? "تم تأكيد البائع، ننتظر تأكيدك." : "بانتظار موافقة البائع…" : deal.live_buyer_approved ? "تم تأكيد المشتري، ننتظر تأكيدك." : "بانتظار موافقة المشتري…"}</span></>}
          {bothApproved && deal.status.toLowerCase() === "funded" && <div className="success-band">تمت موافقة الطرفين. جاري إتمام الصفقة…</div>}
          {deal.status.toLowerCase() === "completed" && <div className="live-celebration" role="status">تمت الصفقة بأمان</div>}
          {deal.status.toLowerCase() === "cancelled" && <div className="live-cancelled">تم إلغاء الصفقة وفك حجز المبلغ.</div>}
        </Card>
      </div>}
      {session && deal && <DealPaymentSheet open={paymentOpen} onClose={() => setPaymentOpen(false)} deal={deal} session={session} profile={people.find((person) => person.id === session.user.id) ?? null} onLinked={async () => { setPaymentOpen(false); await refresh(); }} />}
    </div>
  </main>;
}
