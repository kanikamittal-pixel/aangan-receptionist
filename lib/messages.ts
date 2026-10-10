import type { Extraction, CriterionKey } from "./extract";
import type { Criteria } from "./hardchecks";
import type { Decision } from "./route";
import { esc } from "./util";

export const CRITERION_LABEL: Record<CriterionKey, string> = {
  real_project: "Real project", location: "Service area", timeline: "Timeline", budget: "Budget", decision_maker: "Decision-maker",
};

const line = (icon: string, v: unknown) => (v ? `${icon} ${esc(v)}` : null);

type Urgency = { urgent: boolean; reason: string | null };

/** One line used when a message is resolved (taken/declined) so open items stand out and closed ones shrink. */
export function compactLine(ex: Extraction) {
  const size = ex.carpet_area_sqft ? `${ex.carpet_area_sqft.toLocaleString("en-IN")} sq ft` : null;
  return `<b>${esc(ex.name ?? "Unknown caller")}</b> · ${esc([ex.area ?? ex.city, ex.property_type, size].filter(Boolean).join(" · ") || "details in dashboard")}`;
}

const facts = (ex: Extraction) => {
  const size = ex.carpet_area_sqft ? `${ex.carpet_area_sqft.toLocaleString("en-IN")} sq ft` : null;
  return [
    line("📍", ex.area ?? ex.city),
    line("🏠", [ex.property_type, size].filter(Boolean).join(" · ")),
    line("🛠", ex.scope),
    line("⏱", ex.timeline_text),
  ];
};

/**
 * A lead that needs the designer's decision. The first line says what to do; the last line repeats it.
 * 🟢 = new lead, 🔥 = urgent.
 */
export function renderLead(ex: Extraction, decision: Decision, criteria: Criteria, link: string, kind: "qualified" | "unclear", warn?: string, urgent?: Urgency) {
  const head = urgent?.urgent ? "🔥 <b>URGENT · NEW LEAD</b> · action needed" : kind === "qualified" ? "🟢 <b>NEW LEAD</b> · action needed" : "🟡 <b>NEW LEAD, NOT SURE</b> · your call";
  const lines = [
    head,
    `<b>${esc(ex.name ?? "Unknown caller")}</b>${ex.phone ? ` · ${esc(ex.phone)}` : ""}`,
    ...facts(ex),
    urgent?.urgent ? `🔥 <b>Why urgent:</b> ${esc(urgent.reason)}` : null,
    ex.is_repeat_caller ? `🔁 <b>Repeat caller:</b> ${esc(ex.repeat_note ?? "called before")}` : null,
    "",
    esc(ex.handoff_summary),
  ];
  const all = [...decision.blocking, ...decision.noted];
  if (all.length) { lines.push(""); for (const k of all) lines.push(`⚠️ <b>${CRITERION_LABEL[k]} unclear:</b> ${esc(criteria[k].reason)}`); }
  else if (kind === "unclear") lines.push("", `⚠️ ${esc(decision.reason)}`);
  if (warn) lines.push("", `🚨 <b>${esc(warn)}</b>`);
  lines.push("", `👉 <b>Take this lead, or pass?</b>`, `📄 <a href="${esc(link)}">Full transcript</a>`);
  return lines.filter((l) => l !== null).join("\n");
}

/** Complaint for the front desk: red, with the one thing to do. */
export function renderComplaint(ex: Extraction, link: string) {
  return [
    `🔴 <b>URGENT · CALL THIS CLIENT BACK</b>`,
    `<b>${esc(ex.name ?? "Unknown")}</b>${ex.phone ? ` · ${esc(ex.phone)}` : ""}`,
    ex.complaint?.project_details ? `🏠 ${esc(ex.complaint.project_details)}` : null,
    "",
    esc(ex.complaint?.summary ?? ex.handoff_summary),
    "",
    "👉 <b>A senior person was promised to call back.</b> Tap the button when done.",
    `📄 <a href="${esc(link)}">Full transcript</a>`,
  ].filter((l) => l !== null).join("\n");
}

/** FYI only: a consultation is already booked. No buttons, nothing to do. */
export function renderBooked(ex: Extraction, link: string, when: string, host: string | null, meetingUrl: string | null, urgent?: Urgency) {
  return [
    `${urgent?.urgent ? "🔥 <b>URGENT · </b>" : ""}📅 <b>BOOKED</b> · no action needed`,
    `<b>${esc(when)}</b>${host ? ` · with ${esc(host)}` : ""}`,
    `<b>${esc(ex.name ?? "Unknown caller")}</b>${ex.phone ? ` · ${esc(ex.phone)}` : ""}`,
    meetingUrl ? `🔗 ${esc(meetingUrl)}` : null,
    urgent?.urgent ? `🔥 <b>Why urgent:</b> ${esc(urgent.reason)}` : null,
    ...facts(ex),
    "",
    esc(ex.handoff_summary),
    "",
    `📄 <a href="${esc(link)}">Full transcript</a>`,
  ].filter((l) => l !== null).join("\n");
}
