import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LockKeyhole, House, FileText, Plus, CircleUserRound, ArrowLeft, LoaderCircle } from "lucide-react";
import { addWaitlistInterest, getProfile, getSession, signOut, type OhdaProfile, type OhdaSession } from "@/lib/ohda-data";

export function useOhdaSession() {
  const [session, setSession] = useState<OhdaSession | null>(null);
  const [profile, setProfile] = useState<OhdaProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    setLoading(true);
    try {
      const current = await getSession();
      setSession(current);
      setProfile(current ? await getProfile(current) : null);
    } catch {
      setSession(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    window.addEventListener("ohda-auth", listener);
    return () => window.removeEventListener("ohda-auth", listener);
  }, []);
  return { session, profile, loading, refresh };
}

export function Brand() {
  return <Link href="/" className="brand" aria-label="عهدة، الرئيسية"><span className="brand-lock"><LockKeyhole size={18} /></span><span className="brand-word">عهدة</span></Link>;
}

export function Shell({ children }: { children: ReactNode }) {
  const { session, profile } = useOhdaSession();
  const [, setLocation] = useLocation();
  const [logoutError, setLogoutError] = useState("");
  async function logout() {
    try {
      await signOut();
      window.dispatchEvent(new Event("ohda-auth"));
      setLocation("/");
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "تعذر تسجيل الخروج.");
    }
  }
  const links = [
    { href: "/", label: "الرئيسية", icon: House },
    { href: "/deals", label: "صفقاتي", icon: FileText },
    { href: "/deals/new", label: "صفقة جديدة", icon: Plus },
    { href: "/profile", label: "حسابي", icon: CircleUserRound },
  ];
  return <div className="app-shell" dir="rtl">
    <header className="topbar"><div className="topbar-inner"><Brand /><nav aria-label="التنقل الرئيسي" className="desktop-nav">
      {links.map(({ href, label }) => <Link href={href} key={href}>{label}</Link>)}
    </nav><div className="top-actions">{session ? <><span className="hello-user">{profile?.display_name || session.user.email}</span><button className="text-button" onClick={() => void logout()}>تسجيل خروج</button></> : <><Link className="text-button" href="/login">دخول</Link><Link className="button button-small" href="/signup">حساب جديد</Link></>}</div></div></header>
    {logoutError && <div role="alert" className="inline-error top-error">{logoutError}</div>}
    <main className="main-content">{children}</main>
    <footer className="site-footer"><Brand /><span>صفقات أوضح للمستعمل في الكويت.</span><small>نموذج تجريبي — لا توجد مدفوعات حقيقية</small></footer>
    <nav aria-label="التنقل السفلي" className="mobile-nav">{links.map(({ href, label, icon: Icon }) => <Link href={href} key={href}><Icon size={19} /><span>{label}</span></Link>)}</nav>
  </div>;
}

export function PageHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return <div className="page-heading">{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`surface-card ${className}`}>{children}</section>;
}

export function Button({ children, type = "button", disabled, onClick, variant = "primary" }: { children: ReactNode; type?: "button" | "submit"; disabled?: boolean; onClick?: () => void; variant?: "primary" | "secondary" | "quiet" }) {
  return <button className={`button button-${variant}`} type={type} disabled={disabled} onClick={onClick}>{children}</button>;
}

export function Field({ label, id, children, hint }: { label: string; id: string; children: ReactNode; hint?: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}{hint && <small className="field-hint">{hint}</small>}</div>;
}

export function useNotice() {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return { notice, setNotice, Notice: () => notice ? <div role="status" aria-live="polite" className="toast-note">{notice}</div> : null };
}

export function WaitlistButton({ feature, label }: { feature: string; label: string }) {
  const { session, loading } = useOhdaSession();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function join() {
    if (!session) {
      try {
        const key = "ohda.pending.waitlist";
        const existing = JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as unknown;
        const pending = Array.isArray(existing) ? existing.filter((item): item is string => typeof item === "string") : [];
        if (!pending.includes(feature)) pending.push(feature);
        window.sessionStorage.setItem(key, JSON.stringify(pending));
      } catch {
        window.sessionStorage.setItem("ohda.pending.waitlist", JSON.stringify([feature]));
      }
      window.location.assign("/login?next=%2F");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addWaitlistInterest(session, feature);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ما قدرنا نسجل اهتمامك.");
    } finally {
      setBusy(false);
    }
  }
  return <span className="waitlist-wrap"><button className="waitlist-button" type="button" disabled={busy || loading || done} onClick={() => void join()} title={error || undefined}>{busy ? <LoaderCircle size={15} className="spin" /> : done ? "تم تسجيل اهتمامك" : <>{label}<span className="coming-pill">قريبًا</span></>}</button>{done && <span role="status" aria-live="polite" className="waitlist-toast">سجلناك! بنبلغك أول ما تنزل الميزة.</span>}{error && <span role="alert" className="waitlist-error">{error}</span>}</span>;
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  return <div className="inline-error" role="alert">{children}</div>;
}

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (error) return <ErrorMessage>{error}</ErrorMessage>;
  if (success) return <p className="success-message" role="status">{success}</p>;
  return null;
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <Button type="submit" disabled={busy}>{busy && <LoaderCircle size={17} className="spin" />}{children}<ArrowLeft size={17} /></Button>;
}

export function preventSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
}
