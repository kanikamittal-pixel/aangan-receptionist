import { q } from "./db";
import { hubspotIds, upsertContact, upsertDeal, type StageKey } from "./hubspot";
import { CRITERIA_KEYS } from "./extract";
import { CRITERION_LABEL } from "./messages";
import { transcriptUrl } from "./util";

const STATUS_TO_STAGE: Record<string, StageKey> = {
  needs_review: "needs_review", qualified: "qualified", consultation_booked: "consultation_booked",
  not_a_fit: "not_a_fit", complaint: "complaint", won: "won", lost: "lost", declined: "lost",
};

/** Push the lead's current state to HubSpot (contact + deal). Safe to call repeatedly. */
export async function syncLeadToHubspot(leadId: string) {
  const [lead] = await q("select l.*, d.name as designer_name from leads l left join designers d on d.id=l.assigned_designer_id where l.id=$1", [leadId]);
  if (!lead) return;
  const calls = await q("select * from calls where lead_id=$1 order by started_at", [leadId]);
  const last = calls[calls.length - 1];
  const first = calls[0];
  if (!last) return;
  const ids = await hubspotIds();
  const contactId = await upsertContact(lead.phone, lead.name, lead.hubspot_contact_id);
  const crit = last.final_criteria
    ? CRITERIA_KEYS.map((k) => `${CRITERION_LABEL[k]}: ${last.final_criteria[k].result} (${last.final_criteria[k].reason})`).join("\n")
    : "";
  const cost = calls.reduce((s: number, c: any) => s + Number(c.cost_total_inr ?? 0), 0);
  const props = {
    dealname: `${lead.name ?? "Unknown caller"} · ${lead.phone ?? "no number"}`,
    pipeline: ids.pipelineId,
    dealstage: ids.stages[STATUS_TO_STAGE[lead.status] ?? "needs_review"],
    call_time: first?.started_at ? new Date(first.started_at).toISOString() : null,
    answered_within_5_min: first?.answered_within_5min ?? null,
    out_of_hours: first?.out_of_hours ?? null,
    criteria_results: crit,
    confidence: last.confidence,
    routing_decision: lead.routing,
    assigned_designer: lead.designer_name,
    transcript_link: transcriptUrl(last.id),
    call_cost_inr: Math.round(cost * 100) / 100,
  };
  const dealId = await upsertDeal(lead.hubspot_deal_id, contactId, props);
  await q("update leads set hubspot_contact_id=$2, hubspot_deal_id=$3, updated_at=now() where id=$1", [leadId, contactId, dealId]);
}
