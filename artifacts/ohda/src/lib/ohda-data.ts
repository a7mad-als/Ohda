export type OhdaUser = {
  id: string;
  email: string;
  user_metadata?: { name?: string; country?: string };
};

export type OhdaSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: OhdaUser;
};

export type OhdaProfile = {
  id: string;
  display_name: string;
  phone: string | null;
  iban: string | null;
  country: string;
  role: "user" | "admin";
  created_at: string;
};

export type OhdaDeal = {
  id: string;
  code: string;
  created_by: string;
  seller_id: string | null;
  buyer_id: string | null;
  item_name: string;
  description: string;
  category: string;
  amount: number;
  currency: "KWD";
  fee_amount: number;
  fee_payer: "buyer" | "seller" | "split";
  inspection_hours: number;
  delivery_method: "in_person" | "delivery";
  delivery_carrier: string | null;
  tracking_number: string | null;
  delivery_photo_path: string | null;
  photo_paths: string[];
  dispute_evidence_paths?: string[];
  status: string;
  inspection_started_at: string | null;
  inspection_deadline: string | null;
  dispute_reason: string | null;
  live_seller_approved: boolean;
  live_buyer_approved: boolean;
  payment_provider: "tap" | "stripe" | null;
  payment_reference: string | null;
  payment_state: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DealEvent = {
  id: string;
  deal_id: string;
  actor_id: string | null;
  event_type: string;
  old_status: string | null;
  new_status: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type DealMessage = {
  id: string;
  deal_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type DealRating = {
  id: string;
  deal_id: string;
  recipient_id: string;
  stars: number;
  comment: string;
  created_at: string;
};

export type WaitlistInterest = {
  id: string;
  user_id: string;
  feature: string;
  created_at: string;
};

export type AdminPayoutRecord = {
  id: string;
  deal_id: string;
  seller_id: string;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  note: string;
  recorded_by: string;
  created_at: string;
};

type SupabaseConfig = { configured: boolean; url: string | null; anonKey: string | null };
type AuthResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: OhdaUser;
};

const SESSION_KEY = "ohda.auth.session";
let cachedConfig: SupabaseConfig | null = null;

async function getConfig(): Promise<{ url: string; anonKey: string }> {
  if (!cachedConfig) {
    const response = await fetch("/api/supabase/config");
    if (!response.ok) throw new Error("تعذر التحقق من إعداد قاعدة البيانات.");
    cachedConfig = (await response.json()) as SupabaseConfig;
  }
  if (!cachedConfig.configured || !cachedConfig.url || !cachedConfig.anonKey) {
    throw new Error("خدمة الحسابات غير مهيأة حالياً.");
  }
  return { url: cachedConfig.url, anonKey: cachedConfig.anonKey };
}

function storedSession(): OhdaSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as OhdaSession;
    if (
      typeof value.access_token !== "string" ||
      typeof value.refresh_token !== "string" ||
      typeof value.expires_at !== "number" ||
      !value.user?.id
    ) return null;
    return value;
  } catch {
    return null;
  }
}

function saveSession(session: OhdaSession | null): void {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
}

function authSession(payload: AuthResponse): OhdaSession | null {
  if (!payload.access_token || !payload.refresh_token || !payload.user) return null;
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at ?? Math.floor(Date.now() / 1000) + (payload.expires_in ?? 3600),
    user: payload.user,
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as
    | Record<string, unknown>
    | null;
  if (!response.ok) {
    const message =
      (typeof body?.msg === "string" && body.msg) ||
      (typeof body?.message === "string" && body.message) ||
      (typeof body?.error_description === "string" && body.error_description) ||
      (typeof body?.error === "string" && body.error) ||
      "تعذر إكمال الطلب. حاول مرة ثانية.";
    throw new Error(message);
  }
  return body as T;
}

async function authRequest<T>(path: string, body: unknown): Promise<T> {
  const { url, anonKey } = await getConfig();
  return parseResponse<T>(await fetch(`${url}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

export async function getSession(): Promise<OhdaSession | null> {
  const session = storedSession();
  if (!session) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
  try {
    const payload = await authRequest<AuthResponse>("token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    });
    const refreshed = authSession(payload);
    saveSession(refreshed);
    return refreshed;
  } catch {
    saveSession(null);
    return null;
  }
}

export async function signIn(email: string, password: string): Promise<OhdaSession> {
  const payload = await authRequest<AuthResponse>("token?grant_type=password", { email, password });
  const session = authSession(payload);
  if (!session) throw new Error("ما وصلتنا جلسة تسجيل دخول صالحة.");
  saveSession(session);
  return session;
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
  country: string;
}): Promise<{ session: OhdaSession | null; needsEmailConfirmation: boolean }> {
  const payload = await authRequest<AuthResponse>("signup", {
    email: input.email,
    password: input.password,
    data: { name: input.name.trim(), country: input.country },
  });
  const session = authSession(payload);
  saveSession(session);
  return { session, needsEmailConfirmation: !session };
}

export async function signOut(): Promise<void> {
  const session = await getSession();
  if (session) {
    const { url, anonKey } = await getConfig();
    await fetch(`${url}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
    }).catch(() => undefined);
  }
  saveSession(null);
}

async function rest<T>(
  path: string,
  session: OhdaSession | null,
  init: RequestInit = {},
): Promise<T> {
  const { url, anonKey } = await getConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", anonKey);
  headers.set("Authorization", `Bearer ${session?.access_token ?? anonKey}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return parseResponse<T>(await fetch(`${url}/rest/v1/${path}`, { ...init, headers }));
}

export async function getProfile(session: OhdaSession): Promise<OhdaProfile | null> {
  const rows = await rest<OhdaProfile[]>(
    `profiles?select=*&id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
    session,
  );
  return rows[0] ?? null;
}

export async function updateProfile(
  session: OhdaSession,
  profile: Pick<OhdaProfile, "display_name" | "phone" | "iban" | "country">,
): Promise<void> {
  await rest<unknown>(
    `profiles?id=eq.${encodeURIComponent(session.user.id)}`,
    session,
    { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(profile) },
  );
}

export async function listDeals(session: OhdaSession): Promise<OhdaDeal[]> {
  return rest<OhdaDeal[]>("deals?select=*&order=created_at.desc", session);
}

export async function getDeal(session: OhdaSession, id: string): Promise<OhdaDeal | null> {
  const rows = await rest<OhdaDeal[]>(
    `deals?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
    session,
  );
  return rows[0] ?? null;
}

export async function getEvents(session: OhdaSession, dealId: string): Promise<DealEvent[]> {
  return rest<DealEvent[]>(
    `deal_events?select=*&deal_id=eq.${encodeURIComponent(dealId)}&order=created_at.asc`,
    session,
  );
}

export async function getMessages(session: OhdaSession, dealId: string): Promise<DealMessage[]> {
  return rest<DealMessage[]>(
    `deal_messages?select=*&deal_id=eq.${encodeURIComponent(dealId)}&order=created_at.asc`,
    session,
  );
}

export async function getProfiles(session: OhdaSession, ids: string[]): Promise<OhdaProfile[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const list = unique.map((id) => `"${id}"`).join(",");
  return rest<OhdaProfile[]>(`profiles?select=*&id=in.(${encodeURIComponent(list)})`, session);
}

export async function applyDealAction(
  session: OhdaSession,
  action: string,
  payload: Record<string, unknown>,
): Promise<OhdaDeal> {
  return rest<OhdaDeal>("rpc/ohda_api", session, {
    method: "POST",
    body: JSON.stringify({ p_action: action, p_payload: payload }),
  });
}

export async function createDeal(
  session: OhdaSession,
  input: {
    role: "seller" | "buyer";
    item_name: string;
    description: string;
    category: string;
    amount: number;
    inspection_hours: number;
    delivery_method: "in_person" | "delivery";
    fee_payer: "buyer" | "seller" | "split";
  },
): Promise<OhdaDeal> {
  return applyDealAction(session, "create", input);
}

export async function joinDeal(session: OhdaSession, code: string): Promise<OhdaDeal> {
  return applyDealAction(session, "join", { code });
}

export async function sendMessage(
  session: OhdaSession,
  dealId: string,
  body: string,
): Promise<void> {
  await rest<unknown>("deal_messages", session, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ deal_id: dealId, sender_id: session.user.id, body: body.trim() }),
  });
}

export async function attachDisputeEvidence(
  session: OhdaSession,
  dealId: string,
  paths: string[],
): Promise<void> {
  if (paths.length > 5) throw new Error("الحد الأعلى خمس صور.");
  await rest<unknown>(`deals?id=eq.${encodeURIComponent(dealId)}`, session, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ dispute_evidence_paths: paths }),
  });
}

export async function submitRating(
  session: OhdaSession,
  input: { deal_id: string; recipient_id: string; stars: number; comment: string },
): Promise<void> {
  await rest<unknown>("deal_ratings", session, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...input, author_id: session.user.id }),
  });
}

export async function listReceivedRatings(session: OhdaSession): Promise<DealRating[]> {
  return rest<DealRating[]>(
    `deal_ratings?select=id,deal_id,recipient_id,stars,comment,created_at&recipient_id=eq.${encodeURIComponent(session.user.id)}&order=created_at.desc`,
    session,
  );
}

export async function listWaitlistInterests(session: OhdaSession): Promise<WaitlistInterest[]> {
  return rest<WaitlistInterest[]>(
    "waitlist_interests?select=id,user_id,feature,created_at&order=created_at.desc&limit=1000",
    session,
  );
}

export async function listAdminPayoutRecords(session: OhdaSession): Promise<AdminPayoutRecord[]> {
  return rest<AdminPayoutRecord[]>(
    "admin_payout_records?select=*&order=created_at.desc",
    session,
  );
}

export async function recordAdminPayout(
  session: OhdaSession,
  deal: OhdaDeal,
  note: string,
): Promise<AdminPayoutRecord> {
  if (!deal.seller_id || deal.status.toLowerCase() !== "completed") {
    throw new Error("רק صفقة مكتملة ولها بائع تقدر تسجل تحويلها.");
  }
  const rows = await rest<AdminPayoutRecord[]>("admin_payout_records?select=*", session, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      deal_id: deal.id,
      seller_id: deal.seller_id,
      gross_amount: deal.amount,
      fee_amount: deal.fee_amount,
      net_amount: Math.max(deal.amount - deal.fee_amount, 0),
      note: note.trim(),
      recorded_by: session.user.id,
    }),
  });
  return rows[0];
}

export async function getDealPhotoUrl(session: OhdaSession, path: string): Promise<string> {
  const { url, anonKey } = await getConfig();
  const response = await fetch(
    `${url}/storage/v1/object/sign/ohda-deal-photos/${path.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 300 }),
    },
  );
  const result = await parseResponse<{ signedURL: string }>(response);
  return `${url}${result.signedURL}`;
}

export async function addWaitlistInterest(
  session: OhdaSession,
  feature: string,
): Promise<void> {
  await rest<unknown>("waitlist_interests", session, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: session.user.id, feature }),
  });
}

export async function savePendingWaitlistInterests(session: OhdaSession): Promise<string[]> {
  if (typeof window === "undefined") return [];
  const key = "ohda.pending.waitlist";
  let pending: string[] = [];
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? "[]");
    if (Array.isArray(value)) pending = value.filter((item): item is string => typeof item === "string");
  } catch {
    pending = [];
  }
  const completed: string[] = [];
  for (const feature of pending) {
    try {
      await addWaitlistInterest(session, feature);
      completed.push(feature);
    } catch {
      // Preserve failed interests for the next successful sign-in.
    }
  }
  const remaining = pending.filter((feature) => !completed.includes(feature));
  if (remaining.length) window.sessionStorage.setItem(key, JSON.stringify(remaining));
  else window.sessionStorage.removeItem(key);
  return completed;
}

export type StripeKwdQuote = {
  enabled: boolean;
  currency: "USD";
  kwdToUsdRate: number | null;
  rateUpdatedAt: string | null;
};

export async function getStripeKwdQuote(): Promise<StripeKwdQuote> {
  const response = await fetch("/api/stripe/config");
  return parseResponse<StripeKwdQuote>(response);
}

export async function settleTestPayment(input: {
  provider: "tap" | "stripe";
  action: "capture" | "void";
  reference: string;
  session: OhdaSession;
  amount?: number;
  dealId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}): Promise<{ action: string; status: string; reference: string }> {
  const currentSession = await getSession() ?? input.session;
  const path = input.provider === "tap" ? "/api/tap/settlements" : "/api/stripe/settlements";
  const body = input.provider === "tap"
    ? {
        action: input.action,
        authorizationId: input.reference,
        amount: input.amount,
        requestId: input.dealId ?? crypto.randomUUID(),
        firstName: input.firstName ?? "Ohda",
        lastName: input.lastName ?? "Test",
        email: input.email ?? "test@example.com",
      }
    : { action: input.action, paymentIntentId: input.reference, dealId: input.dealId };
  return parseResponse<{ action: string; status: string; reference: string }>(
    await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentSession.access_token}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

export async function uploadDealPhoto(
  session: OhdaSession,
  dealId: string,
  file: File,
  index: number,
): Promise<string> {
  const { url, anonKey } = await getConfig();
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${session.user.id}/${dealId}/${Date.now()}-${index}.${extension}`;
  const response = await fetch(
    `${url}/storage/v1/object/ohda-deal-photos/${path.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": file.type,
        "x-upsert": "false",
      },
      body: file,
    },
  );
  await parseResponse<unknown>(response);
  return path;
}

export function formatKwd(value: number): string {
  return `${value.toLocaleString("en-KW", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} د.ك`;
}

export function calculateFee(amount: number, category: string, freeDeal: boolean): number {
  if (freeDeal) return 0;
  if (category === "سيارة") return 3;
  if (amount <= 50) return 0.25;
  if (amount <= 250) return 0.5;
  if (amount <= 1000) return 1;
  if (amount <= 5000) return 2;
  return 3;
}
