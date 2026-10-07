import type { Extraction, CriterionKey } from "./extract";
import type { Criteria } from "./hardchecks";
import type { Decision } from "./route";
import { esc } from "./util";

export const CRITERION_LABEL: Record<CriterionKey, string> = {
  real_project: "Real project", location: "Service area", timeline: "Timeline", budget: "Budget", decision_maker: "Decision-maker",
};

const line = (icon: string, v: unknown) => (v ? `${icon} ${esc(v)}` : null);

/** Phone-readable in five seconds: header, key facts, three-sentence note, link. */
export function renderLead(ex: Extraction, decision: Decision, criteria: Criteria, link: string, kind: "qualified" | "unclear") {
  const size = ex.carpet_area_sqft ? `${ex.carpet_area_sqft.toLocaleString("en-IN")} sq ft` : null;
  const head = kind === "qualified" ? "🟢 <b>QUALIFIED</b>" : "🟡 <b>NEEDS A DECISION</b>";
  const lines = [
    `${head} · <b>${esc(ex.name ?? "Unknown caller")}</b>${ex.phone ? ` · ${esc(ex.phone)}` : ""}`,
    line("📍", ex.area ?? ex.city),
    line("🏠", [ex.property_type, size].filter(Boolean).join(" · ")),
    line("🛠", ex.scope),
    line("⏱", ex.timeline_text),
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
