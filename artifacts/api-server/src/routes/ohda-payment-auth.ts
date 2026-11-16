import type { Request } from "express";

type DealRow = {
  id: string;
  buyer_id: string | null;
  seller_id: string | null;
  amount: number;
  status: string;
  payment_provider: "tap" | "stripe" | null;
  payment_reference: string | null;
  payment_state: string;
  inspection_deadline: string | null;
};

export type OhdaPaymentContext = {
  userId: string;
  deal: DealRow;
  isAdmin: boolean;
};

function clean(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^(?:export\s+)?(?:NEXT_PUBLIC_|VITE_)?[A-Z0-9_]+\s*=\s*/i, "").trim().replace(/^(['"])(.*)\1$/, "$2");
}

function config() {
  const rawUrl = clean(process.env.SUPABASE_URL);
  const anonKey = clean(process.env.SUPABASE_ANON_KEY);
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !anonKey) return null;
    return { url: url.origin, anonKey };
  } catch {
    return null;
  }
}

function accessToken(req: Request): string | null {
  const value = req.header("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(value);
  return match?.[1] ?? null;
}

export async function getOhdaPaymentContext(req: Request, dealId: string): Promise<OhdaPaymentContext | null> {
  const supabase = config();
  const token = accessToken(req);
  if (!supabase || !token || !/^[0-9a-f-]{36}$/i.test(dealId)) return null;
  const headers = {
    apikey: supabase.anonKey,
    Authorization: `Bearer ${token}`,
  };
  try {
    const userResponse = await fetch(`${supabase.url}/auth/v1/user`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (!userResponse.ok) return null;
    const user = await userResponse.json() as { id?: unknown };
    if (typeof user.id !== "string") return null;
    const dealResponse = await fetch(
      `${supabase.url}/rest/v1/deals?id=eq.${encodeURIComponent(dealId)}&select=id,buyer_id,seller_id,amount,status,payment_provider,payment_reference,payment_state,inspection_deadline&limit=1`,
      { headers, signal: AbortSignal.timeout(5_000) },
    );
    if (!dealResponse.ok) return null;
    const rows = await dealResponse.json() as DealRow[];
    const deal = rows[0];
    if (!deal) return null;
    let isAdmin = false;
    const profileResponse = await fetch(
      `${supabase.url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,
      { headers, signal: AbortSignal.timeout(5_000) },
    );
    if (profileResponse.ok) {
      const profiles = await profileResponse.json() as Array<{ role?: unknown }>;
      isAdmin = profiles[0]?.role === "admin";
    }
    return { userId: user.id, deal, isAdmin };
  } catch {
    return null;
  }
}
