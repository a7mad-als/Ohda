import type { DealMessage, OhdaDeal } from "@/lib/ohda-data";

/**
 * حَكَم عهدة — a transparent, rule-based dispute reviewer.
 *
 * It reads the deal terms, the dispute reason, the evidence count and the
 * chat, weighs a fixed set of factors, and writes a reasoned recommendation.
 * The recommendation is never executed on its own: an admin approves it.
 * Every factor is listed with its weight so the decision can be explained to
 * both parties.
 */

export type JudgeDecision = "buyer" | "seller" | "review";

export type JudgeFactor = { text: string; weight: number };

export type JudgeVerdict = {
  decision: JudgeDecision;
  title: string;
  confidence: "عالية" | "متوسطة" | "منخفضة";
  score: number;
  factors: JudgeFactor[];
  summary: string;
};

const ITEM_PROBLEM = /(مو مطابق|غير مطابق|مختلف|خربان|خراب|مكسور|كسر|ما يشتغل|مايشتغل|لا يعمل|عطلان|عطل|ناقص|مزيف|تقليد|مقلد|مضروب|خدش|خدوش|مستعمل واجد|غير الموصوف|غير اللي|ما وصل|مو واصل|فاضي)/;
const SELLER_ADMITS = /(آسف|اسف|أعتذر|اعتذر|معك حق|صج|أرجع لك|ارجع لك|نرجع|استرجاع|رجّع|رجع الفلوس|ما انتبهت|غلطتي|خطأ مني)/;
const BUYER_SATISFIED = /(تمام|سليم|ممتاز|زين|الحمدلله وصل|وصل وكله|شكرا|مشكور|يعطيك العافية)/;
const SELLER_DENIES = /(كان سليم|كان يشتغل|جربته|فحصته|قدامك|شفته|انت كسرته|مو مني|بعد الاستلام)/;

function bodiesFrom(messages: DealMessage[], senderId: string | null): string[] {
  if (!senderId) return [];
  return messages.filter((message) => message.sender_id === senderId).map((message) => message.body);
}

export function judgeDispute(deal: OhdaDeal, messages: DealMessage[], evidenceCount = deal.dispute_evidence_paths?.length ?? 0): JudgeVerdict {
  const factors: JudgeFactor[] = [];
  const reason = (deal.dispute_reason ?? "").trim();
  const buyerText = bodiesFrom(messages, deal.buyer_id).join(" \n ");
  const sellerText = bodiesFrom(messages, deal.seller_id).join(" \n ");

  if (reason.length >= 15 && ITEM_PROBLEM.test(reason)) {
    factors.push({ text: "سبب النزاع يصف مشكلة واضحة في الغرض نفسه (عدم مطابقة أو عطل).", weight: 2 });
  } else if (reason.length >= 15) {
    factors.push({ text: "سبب النزاع مكتوب بتفصيل، لكنه ما يحدد عيب واضح في الغرض.", weight: 1 });
  } else {
    factors.push({ text: "سبب النزاع مختصر وما فيه تفاصيل كافية.", weight: -1 });
  }

  if (evidenceCount >= 2) factors.push({ text: `المشتري أرفق ${evidenceCount} صور كأدلة.`, weight: 2 });
  else if (evidenceCount === 1) factors.push({ text: "المشتري أرفق صورة وحدة كدليل.", weight: 1 });
  else factors.push({ text: "ما في صور أدلة مرفقة مع النزاع.", weight: -1 });

  if (deal.delivery_method === "in_person" && deal.live_buyer_approved) {
    factors.push({ text: "المشتري فحص الغرض حضورياً ووافق عليه قدام البائع.", weight: -2 });
  } else if (deal.delivery_method === "delivery") {
    factors.push({ text: "التسليم كان بالتوصيل، فالمشتري ما شاف الغرض قبل الدفع.", weight: 1 });
  }

  if (deal.photo_paths?.length) factors.push({ text: "البائع وثّق الغرض بصور وقت إنشاء الصفقة، ونقدر نقارن فيها.", weight: -1 });

  if (sellerText && SELLER_ADMITS.test(sellerText)) factors.push({ text: "البائع أقر بالمشكلة أو عرض الاسترجاع في المحادثة.", weight: 3 });
  if (sellerText && SELLER_DENIES.test(sellerText)) factors.push({ text: "البائع يؤكد إن الغرض كان سليم وقت التسليم.", weight: -1 });
  if (buyerText && BUYER_SATISFIED.test(buyerText) && !ITEM_PROBLEM.test(buyerText)) factors.push({ text: "المشتري عبّر عن رضاه في المحادثة قبل فتح النزاع.", weight: -2 });
  if (!sellerText) factors.push({ text: "البائع ما رد في محادثة الصفقة.", weight: 1 });

  const score = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const decision: JudgeDecision = score >= 3 ? "buyer" : score <= -2 ? "seller" : "review";
  const magnitude = Math.abs(score);
  const confidence = decision === "review" ? "منخفضة" : magnitude >= 5 ? "عالية" : "متوسطة";
  const title = decision === "buyer" ? "التوصية: إرجاع المبلغ للمشتري" : decision === "seller" ? "التوصية: صرف المبلغ للبائع" : "التوصية: يحتاج أدلة إضافية";
  const summary = decision === "buyer"
    ? "الأدلة ترجّح إن الغرض ما وصل مطابق للاتفاق، فالأعدل إرجاع المبلغ للمشتري بعد إرجاع الغرض للبائع."
    : decision === "seller"
      ? "الأدلة ترجّح إن الغرض سُلّم مطابق للاتفاق، فالأعدل صرف المبلغ للبائع."
      : "الأدلة الحالية غير كافية للترجيح. اطلبوا صور أو توضيح إضافي من الطرفين قبل القرار.";
  return { decision, title, confidence, score, factors, summary };
}
