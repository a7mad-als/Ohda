import { Router, type IRouter } from "express";

const router: IRouter = Router();

function clean(value: string | undefined, name: string): string {
  if (!value) return "";
  const assignment = new RegExp(
    `^(?:export\\s+)?(?:NEXT_PUBLIC_|VITE_)?${name}\\s*=\\s*`,
    "i",
  );
  return value.trim().replace(assignment, "").trim().replace(/^(['"])(.*)\1$/, "$2");
}

router.get("/supabase/config", (_req, res): void => {
  const rawUrl = clean(process.env.SUPABASE_URL, "SUPABASE_URL");
  const anonKey = clean(process.env.SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY");
  let url = "";
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === "https:") url = parsed.origin;
  } catch {
    url = "";
  }
  res.json({
    configured: Boolean(url && anonKey),
    url: url || null,
    anonKey: anonKey || null,
  });
});

export default router;
