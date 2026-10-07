import { after } from "next/server";
import { parseVaaniWebhook } from "@/lib/vaani";
import { processInteraction } from "@/lib/pipeline";
import { safeEqual } from "@/lib/util";

export const maxDuration = 60;

export async function POST(req: Request) {
  const key = process.env.VAANI_WEBHOOK_KEY ?? "";
  const given = new URL(req.url).searchParams.get("key") ?? req.headers.get("x-vaani-key") ?? "";
  if (!key || !safeEqual(key, given)) return new Response("unauthorized", { status: 401 });
  let n;
  try { n = parseVaaniWebhook(await req.json()); } catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }
  // Acknowledge fast; the pipeline continues after the response.
  after(async () => { try { await processInteraction(n); } catch (e) { console.error("pipeline failed", e); } });
  return Response.json({ ok: true });
}
