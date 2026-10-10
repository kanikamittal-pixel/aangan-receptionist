// Creates the deal pipeline + custom deal properties. Safe to re-run.
import "./env";
import { hs } from "../lib/hubspot";
import { loadConfig, setConfigValue } from "../lib/config";

const GROUP = "aangan_phone";
const props: any[] = [
  { name: "call_time", label: "Call time", type: "datetime", fieldType: "date" },
  { name: "answered_within_5_min", label: "Answered within 5 min", type: "enumeration", fieldType: "booleancheckbox", options: yn() },
  { name: "out_of_hours", label: "Out of hours", type: "enumeration", fieldType: "booleancheckbox", options: yn() },
  { name: "criteria_results", label: "Criteria results", type: "string", fieldType: "textarea" },
  { name: "confidence", label: "Confidence", type: "enumeration", fieldType: "select", options: ["high", "medium", "low"].map((v, i) => ({ label: v, value: v, displayOrder: i })) },
  { name: "routing_decision", label: "Routing decision", type: "enumeration", fieldType: "select", options: ["qualified", "unclear", "complaint", "not_a_fit", "dropped"].map((v, i) => ({ label: v, value: v, displayOrder: i })) },
  { name: "assigned_designer", label: "Assigned designer", type: "string", fieldType: "text" },
  { name: "transcript_link", label: "Transcript link", type: "string", fieldType: "text" },
  { name: "call_cost_inr", label: "Cost of this call (INR)", type: "number", fieldType: "number" },
  { name: "consultation_time", label: "Consultation time", type: "datetime", fieldType: "date" },
  { name: "meeting_link", label: "Meeting link", type: "string", fieldType: "text" },
  { name: "booked_by", label: "Booked by", type: "string", fieldType: "text" },
  { name: "lead_summary", label: "Lead summary", type: "string", fieldType: "textarea" },
  { name: "lead_location", label: "Location", type: "string", fieldType: "text" },
  { name: "lead_property", label: "Property and size", type: "string", fieldType: "text" },
  { name: "lead_scope", label: "Scope of work", type: "string", fieldType: "text" },
  { name: "lead_timeline", label: "Customer timeline", type: "string", fieldType: "text" },
  { name: "lead_decision_maker", label: "Decision-maker", type: "string", fieldType: "text" },
];
function yn() { return [{ label: "Yes", value: "true", displayOrder: 0 }, { label: "No", value: "false", displayOrder: 1 }]; }

(async () => {
  const { settings } = await loadConfig();
  await hs("/crm/v3/properties/deals/groups", { method: "POST", body: JSON.stringify({ name: GROUP, label: "Aangan phone enquiry", displayOrder: -1 }) })
    .catch((e) => { if (!/409|already exists/i.test(String(e))) throw e; });
  for (const p of props) {
    await hs("/crm/v3/properties/deals", { method: "POST", body: JSON.stringify({ ...p, groupName: GROUP }) })
      .then(() => console.log("created property", p.name))
      .catch((e) => { if (/409|already exists/i.test(String(e))) console.log("exists", p.name); else throw e; });
  }
  const existing = await hs<{ results: any[] }>("/crm/v3/pipelines/deals");
  let pipe = existing.results.find((p) => p.label === settings.hubspot.pipeline_label);
  if (!pipe) {
    pipe = await hs("/crm/v3/pipelines/deals", {
      method: "POST",
      body: JSON.stringify({
        label: settings.hubspot.pipeline_label, displayOrder: 10,
        stages: settings.hubspot.stages.map((s, i) => ({ label: s.label, displayOrder: i, metadata: { probability: String(s.probability) } })),
      }),
    });
    console.log("created pipeline", pipe.id);
  }
  const stages: Record<string, string> = {};
  for (const s of settings.hubspot.stages) {
    const found = pipe.stages.find((x: any) => x.label === s.label);
    if (!found) throw new Error(`Stage "${s.label}" missing in pipeline ${pipe.id}; fix in HubSpot or settings`);
    stages[s.key] = found.id;
  }
  await setConfigValue("hubspot_ids", { pipelineId: pipe.id, stages });
  console.log("HubSpot ready. Dashboard reports: see docs/HUBSPOT_DASHBOARD.md");
})().catch((e) => { console.error(e); process.exit(1); });
