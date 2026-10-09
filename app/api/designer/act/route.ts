import { approveLead, rejectLead } from "@/lib/actions";
import { designerFromToken } from "@/lib/designer-auth";

export const maxDuration = 60;

// POST { t, leadId, action: "approve" | "reject", reason? }  (reason is required for reject)
export async function POST(req: Request) {
  const { t, leadId, action, reason } = await req.json().catch(() => ({}));
  const designer = await designerFromToken(t);
  if (!designer) return Response.json({ error: "Invalid link" }, { status: 401 });
  if (!leadId || !["approve", "reject"].includes(action)) return Response.json({ error: "Bad request" }, { status: 400 });
  if (action === "approve") {
    const r = await approveLead(leadId, designer, "dashboard");
    return Response.json(r, { status: r.ok || r.error === "already_decided" ? 200 : 404 });
  }
  const why = String(reason ?? "").trim().slice(0, 300);
  if (!why) return Response.json({ ok: false, error: "A reason is required" }, { status: 400 });
  return Response.json(await rejectLead(leadId, designer, why, "dashboard"));
}
