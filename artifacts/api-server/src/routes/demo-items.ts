import { Router, type IRouter } from "express";
import {
  CreateDemoItemBody,
  CreateDemoItemResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/demo-items", async (req, res): Promise<void> => {
  const parsed = CreateDemoItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "اكتب اسم الغرض بشكل صحيح." });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    req.log.error("Supabase environment is not configured");
    res.status(503).json({ error: "حفظ البيانات غير متاح حالياً." });
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/ohda_demo_items`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ name: parsed.data.name.trim() }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    req.log.error({ err: error }, "Supabase insert request failed");
    res.status(503).json({ error: "تعذر الاتصال بقاعدة البيانات. جرّب مرة ثانية." });
    return;
  }

  if (!response.ok) {
    req.log.error({ statusCode: response.status }, "Supabase rejected demo item");
    res.status(503).json({ error: "تعذر حفظ الغرض حالياً. جرّب مرة ثانية." });
    return;
  }

  res.status(201).json(
    CreateDemoItemResponse.parse({ saved: true, name: parsed.data.name.trim() }),
  );
});

export default router;
