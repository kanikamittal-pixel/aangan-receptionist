import { z } from "zod";
import type { Rules } from "./defaults";

const Result = z.enum(["pass", "fail", "unclear"]);
const Criterion = z.object({ result: Result, reason: z.string() });

export const CATEGORIES = [
  "residential_full", "residential_partial", "residential_single_room", "commercial_office", "commercial_other",
  "restaurant", "hotel", "retail", "gym", "decor_only", "standalone_furniture", "vastu_only", "structural_only",
  "advice_only", "other",
] as const;

export const ExtractionSchema = z.object({
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  city: z.string().nullable(),
  area: z.string().nullable(),
  property_type: z.string().nullable(),
  project_category: z.enum(CATEGORIES),
  carpet_area_sqft: z.number().nullable(),
  scope: z.string().nullable(),
  timeline_text: z.string().nullable(),
  needed_by_date: z.string().nullable(), // YYYY-MM-DD, the date the caller needs the project complete or started
  volunteered_budget: z.string().nullable(),
  decision_maker: z.enum(["on_call", "represented", "unclear", "no"]),
  referral_source: z.string().nullable(),
  call_type: z.enum(["new_enquiry", "complaint", "follow_up", "dropped_call"]),
  is_repeat_caller: z.boolean(),
  repeat_note: z.string().nullable(),
  consent_to_record: z.enum(["yes", "no", "not_asked"]),
  criteria: z.object({
    real_project: Criterion, location: Criterion, timeline: Criterion, budget: Criterion, decision_maker: Criterion,
  }),
  confidence: z.enum(["high", "medium", "low"]),
  handoff_summary: z.string(),
  complaint: z.object({ project_details: z.string(), summary: z.string() }).nullable(),
});
export type Extraction = z.infer<typeof ExtractionSchema>;
export type CriterionKey = keyof Extraction["criteria"];

export const CRITERIA_KEYS: CriterionKey[] = ["real_project", "location", "timeline", "budget", "decision_maker"];

export function buildPrompt(transcript: string, callDate: Date, rules: Rules) {
  const today = callDate.toISOString().slice(0, 10);
  return `You read a phone-call transcript between a caller and the studio's receptionist (voice agent or front desk) for Aangan Studio, an interior design studio in Pune. Return ONLY one JSON object, no prose.

Today's date (call date): ${today}. Resolve relative dates ("by March", "before Diwali", "in 3 weeks") to a YYYY-MM-DD in needed_by_date (use the END of a named month; null if no date is stated).

Evaluate the five criteria (pass / fail / unclear, each with a one-line reason):
${Object.values(rules.criteria_text).join("\n")}

Boundary rules: ${rules.boundary_rules}

Field rules:
- Use null for anything not said. Never invent a name, number, area or budget.
- phone: only if the caller gave a number in the text; otherwise null.
- project_category: one of ${CATEGORIES.join(", ")}. Single-room redesign with execution = residential_single_room. Advice/ideas only = advice_only. Coworking pod/office/clinic = commercial_*.
- call_type: complaint = an existing client complaining about a current project (set "complaint" object with project details and summary; criteria may all be "unclear"); dropped_call = the line dropped before the need was understood; follow_up = caller refers to an earlier call/enquiry; else new_enquiry.
- is_repeat_caller true when the caller says they called before; repeat_note says what happened earlier (e.g. promised callback never came).
- consent_to_record: "yes" only if the transcript shows the caller agreeing to recording, "no" if refused, else "not_asked".
- decision_maker: on_call, represented (caller acts for the decision-makers who will attend/authorised), unclear, or no.
- If the transcript contains several calls from one person (marked 'Earlier call' / 'Callback'), treat them as ONE enquiry: dropped_call only if the final call also dropped.
- confidence: your confidence in the overall assessment.
- handoff_summary: exactly three short sentences for the designer: who and what/where, the timeline and any caveats (budget/decision-maker uncertainty, possible later start, repeat caller), and the recommended next step. For a complaint, summarise the complaint instead.

JSON shape:
{"name":null,"phone":null,"email":null,"city":null,"area":null,"property_type":null,"project_category":"other","carpet_area_sqft":null,"scope":null,"timeline_text":null,"needed_by_date":null,"volunteered_budget":null,"decision_maker":"unclear","referral_source":null,"call_type":"new_enquiry","is_repeat_caller":false,"repeat_note":null,"consent_to_record":"not_asked","criteria":{"real_project":{"result":"pass","reason":""},"location":{"result":"pass","reason":""},"timeline":{"result":"pass","reason":""},"budget":{"result":"pass","reason":""},"decision_maker":{"result":"pass","reason":""}},"confidence":"high","handoff_summary":"","complaint":null}

TRANSCRIPT:
${transcript}`;
}

export type ExtractionOutcome = { extraction: Extraction; tokensIn: number; tokensOut: number };

export async function extractTranscript(transcript: string, callDate: Date, rules: Rules): Promise<ExtractionOutcome> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let tokensIn = 0, tokensOut = 0, lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(transcript, callDate, rules) + (lastErr ? `\n\nYour previous reply was invalid: ${lastErr}. Fix it.` : "") }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body: any = await res.json();
    tokensIn += body.usageMetadata?.promptTokenCount ?? 0;
    // thinking tokens are billed as output
    tokensOut += (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0);
    const text: string = body.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
    try {
      const parsed = ExtractionSchema.parse(JSON.parse(text.replace(/^```json\s*|```$/g, "").trim()));
      return { extraction: parsed, tokensIn, tokensOut };
    } catch (e: any) {
      lastErr = String(e.message).slice(0, 300);
    }
  }
  throw new Error("Gemini returned invalid JSON twice: " + lastErr);
}
