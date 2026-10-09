import type { Extraction, CriterionKey } from "./extract";
import type { Criteria } from "./hardchecks";
import type { Decision } from "./route";
import { esc } from "./util";

export const CRITERION_LABEL: Record<CriterionKey, string> = {
  real_project: "Real project", location: "Service area", timeline: "Timeline", budget: "Budget", decision_maker: "Decision-maker",
};

const line = (icon: string, v: unknown) => (v ? `${icon} ${esc(v)}` : null);

/** Phone-readable in five seconds: header, key facts, three-sentence note, link. */
export function renderLead(ex: Extraction, decision: Decision, criteria: Criteria, link: string, kind: "qualified" | "unclear", warn?: string, urgent?: { urgent: boolean; reason: string | null }) {
  const size = ex.carpet_area_sqft ? `${ex.carpet_area_sqft.toLocaleString("en-IN")} sq ft` : null;
  const base = kind === "qualified" ? "🟢 <b>QUALIFIED</b>" : "🟡 <b>NEEDS A DECISION</b>";
  const head = urgent?.urgent ? `🔥 <b>URGENT</b> · ${base}` : base;
  const lines = [
    `${head} · <b>${esc(ex.name ?? "Unknown caller")}</b>${ex.phone ? ` · ${esc(ex.phone)}` : ""}`,
    line("📍", ex.area ?? ex.city),
    line("🏠", [ex.property_type, size].filter(Boolean).join(" · ")),
    line("🛠", ex.scope),
    line("⏱", ex.timeline_text),
    urgent?.urgent ? `🔥 <b>Urgent:</b> ${esc(urgent.reason)}` : null,
    ex.is_repeat_caller ? `🔁 <b>Repeat caller</b>: ${esc(ex.repeat_note ?? "called before")}` : null,
    "",
    esc(ex.handoff_summary),
  ];
  const all = [...decision.blocking, ...decision.noted];
  if (all.length) {
    lines.push("");
    for (const k of all) lines.push(`⚠️ <b>${CRITERION_LABEL[k]} unclear:</b> ${esc(criteria[k].reason)}`);
  } else if (kind === "unclear") {
    lines.push("", `⚠️ ${esc(decision.reason)}`);
  }
  if (warn) lines.push("", `🚨 <b>${esc(warn)}</b>`);
  lines.push("", `📄 <a href="${esc(link)}">Full transcript</a>`);
  return lines.filter((l) => l !== null).join("\n");
}

export function renderComplaint(ex: Extraction, link: string) {
  return [
    `🔴 <b>URGENT: CLIENT COMPLAINT</b>`,
    `<b>${esc(ex.name ?? "Unknown")}</b>${ex.phone ? ` · ${esc(ex.phone)}` : ""}`,
    ex.complaint?.project_details ? `🏠 ${esc(ex.complaint.project_details)}` : null,
    "",
    esc(ex.complaint?.summary ?? ex.handoff_summary),
    "",
    "☎️ Callback promised from a senior person.",
    `📄 <a href="${esc(link)}">Full transcript</a>`,
  ].filter((l) => l !== null).join("\n");
}

/** FYI only: Vaani booked the consultation during the call. No buttons. */
export function renderBooked(ex: Extraction, link: string, when: string, host: string | null, meetingUrl: string | null, urgent?: { urgent: boolean; reason: string | null }) {
  const size = ex.carpet_area_sqft ? `${ex.carpet_area_sqft.toLocaleString("en-IN")} sq ft` : null;
  return [
    `${urgent?.urgent ? "🔥 <b>URGENT</b> · " : ""}📅 <b>BOOKED BY VAANI</b> · <b>${esc(ex.name ?? "Unknown caller")}</b>${ex.phone ? ` · ${esc(ex.phone)}` : ""}`,
    `<b>${esc(when)}</b>${host ? ` · with ${esc(host)}` : ""}`,
    meetingUrl ? `🔗 ${esc(meetingUrl)}` : null,
    urgent?.urgent ? `🔥 ${esc(urgent.reason)}` : null,
    line("📍", ex.area ?? ex.city),
    line("🏠", [ex.property_type, size].filter(Boolean).join(" · ")),
    line("🛠", ex.scope),
    "",
    esc(ex.handoff_summary),
    "",
    `📄 <a href="${esc(link)}">Full transcript</a>`,
  ].filter((l) => l !== null).join("\n");
}
