import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { LockKeyhole } from "lucide-react";
import { savePendingWaitlistInterests, signIn, signUp } from "@/lib/ohda-data";
import { Card, Field, FormMessage, PageHeading, Shell, SubmitButton } from "@/components/ohda-ui";

export function LoginPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const session = await signIn(email.trim(), password);
      await savePendingWaitlistInterests(session);
      window.dispatchEvent(new Event("ohda-auth"));
      const next = new URLSearchParams(window.location.search).get("next");
      navigate(next?.startsWith("/") && !next.startsWith("//") ? next : "/deals");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الدخول. حاول مرة ثانية.");
    } finally { setBusy(false); }
  }
  return <Shell><div className="auth-layout"><div className="auth-aside"><span className="auth-lock"><LockKeyhole size={27} /></span><span className="eyebrow">حسابك في عهدة</span><h2>اتفاقاتك،<br />بمكان واحد.</h2><p>تابع الصفقات اللي بينك وبين الناس بكل وضوح.</p></div><Card className="auth-card"><PageHeading eyebrow="حياك الله" title="دخول" description="سجّل دخولك عشان تتابع صفقاتك." /><form className="form-stack" onSubmit={submit}>
    <Field label="البريد الإلكتروني" id="login-email"><input id="login-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
    <Field label="كلمة المرور" id="login-password"><input id="login-password" type="password" autoComplete="current-password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /></Field>
    <FormMessage error={error} /><SubmitButton busy={busy}>دخول إلى حسابي</SubmitButton>
   </form><p className="auth-switch">ما عندك حساب؟ <Link href={`/signup${window.location.search}`}>سوّ حساب جديد</Link></p><p className="quiet-note">خدمة الحسابات التجريبية قد تحتاج إعداد اتصال قاعدة البيانات.</p></Card></div></Shell>;
}

export function SignupPage() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState("الكويت");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const result = await signUp({ name, email: email.trim(), password, country });
      if (result.session) {
        await savePendingWaitlistInterests(result.session);
        window.dispatchEvent(new Event("ohda-auth"));
        const next = new URLSearchParams(window.location.search).get("next");
        navigate(next?.startsWith("/") && !next.startsWith("//") ? next : "/deals");
      } else {
        setSuccess(result.needsEmailConfirmation ? "سجلنا حسابك. راجع بريدك الإلكتروني لتأكيده، وبعدها سجل دخولك." : "تم إنشاء الحساب.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء الحساب. حاول مرة ثانية.");
    } finally { setBusy(false); }
  }
  return <Shell><div className="auth-layout"><div className="auth-aside"><span className="auth-lock"><LockKeyhole size={27} /></span><span className="eyebrow">بداية أوضح</span><h2>حسابك جاهز<br />لصفقات أضمن.</h2><p>أنشئ حسابك وابدأ أول اتفاق مع الطرف الثاني.</p></div><Card className="auth-card"><PageHeading eyebrow="أهلاً في عهدة" title="حساب جديد" description="معلوماتك تبقى مرتبطة بحسابك فقط." /><form className="form-stack" onSubmit={submit}>
    <Field label="الاسم" id="signup-name"><input id="signup-name" autoComplete="name" required maxLength={90} value={name} onChange={e => setName(e.target.value)} /></Field>
    <Field label="البريد الإلكتروني" id="signup-email"><input id="signup-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
    <Field label="كلمة المرور" id="signup-password" hint="على الأقل ٦ أحرف"><input id="signup-password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} /></Field>
     <Field label="الدولة" id="signup-country"><select id="signup-country" value={country} onChange={e => setCountry(e.target.value)}><option>الكويت</option><option>السعودية</option><option>الإمارات</option><option>قطر</option><option>البحرين</option><option>عُمان</option><option>أخرى</option></select></Field>
    <FormMessage error={error} success={success} /><SubmitButton busy={busy}>إنشاء حساب</SubmitButton>
   </form><p className="auth-switch">عندك حساب؟ <Link href={`/login${window.location.search}`}>سجّل دخولك</Link></p><p className="quiet-note">ما راح نطلب بيانات بطاقة دفع.</p></Card></div></Shell>;
}
