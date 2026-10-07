// Deterministic tests for hard checks + routing. No network, no DB. npm run test:unit
import { applyHardChecks } from "../lib/hardchecks";
import { decideRoute } from "../lib/route";
import { DEFAULT_RULES, DEFAULT_SETTINGS } from "../lib/defaults";
import type { Extraction } from "../lib/extract";

const ok = { result: "pass" as const, reason: "" };
const base = (o: Partial<Extraction> = {}): Extraction => ({
  name: "A", phone: null, email: null, city: "Pune", area: "Baner", property_type: "3BHK", project_category: "residential_full",
  carpet_area_sqft: 1200, scope: "full", timeline_text: null, needed_by_date: "2027-03-31", volunteered_budget: null,
  decision_maker: "on_call", referral_source: null, call_type: "new_enquiry", is_repeat_caller: false, repeat_note: null,
  consent_to_record: "yes", criteria: { real_project: ok, location: ok, timeline: ok, budget: ok, decision_maker: ok },
  confidence: "high", handoff_summary: "x", complaint: null, ...o,
});
const now = new Date("2026-09-08T10:00:00Z");
let fail = 0;
const t = (name: string, cond: boolean) => { console.log(cond ? "PASS" : "FAIL", name); if (!cond) fail++; };
const run = (o: Partial<Extraction>) => { const e = base(o); const h = applyHardChecks(e, DEFAULT_RULES, now); return { ...h, d: decideRoute(e, h.criteria, DEFAULT_SETTINGS) }; };

t("clean lead qualifies", run({}).d.route === "qualified");
t("Nashik overrides AI pass and logs it", (() => { const r = run({ city: "Nashik", area: null }); return r.criteria.location.result === "fail" && r.overrides.length === 1 && r.d.route === "not_a_fit"; })());
t("Talegaon excluded", run({ city: "Pune", area: "Talegaon" }).d.route === "not_a_fit");
t("Pimple Saudagar passes by locality", run({ city: null, area: "Pimple Saudagar" }).d.route === "qualified");
t("unknown city fails", run({ city: "Satara", area: null }).d.route === "not_a_fit");
t("restaurant out of scope", run({ project_category: "restaurant" }).d.route === "not_a_fit");
t("commercial 3,500 sq ft fails", run({ project_category: "commercial_office", carpet_area_sqft: 3500 }).d.route === "not_a_fit");
t("commercial 800 sq ft ok", run({ project_category: "commercial_office", carpet_area_sqft: 800 }).d.route === "qualified");
t("commercial 180 sq ft below minimum", run({ project_category: "commercial_other", carpet_area_sqft: 180 }).d.route === "not_a_fit");
t("needed in 3 weeks fails timeline", run({ needed_by_date: "2026-09-29" }).criteria.timeline.result === "fail");
t("needed in 8 weeks ok", run({ needed_by_date: "2026-11-10" }).d.route === "qualified");
t("budget unclear still qualified, noted", (() => { const r = run({ criteria: { ...base().criteria, budget: { result: "unclear", reason: "?" } } }); return r.d.route === "qualified" && r.d.noted.includes("budget"); })());
t("timeline unclear -> designer decides", run({ criteria: { ...base().criteria, timeline: { result: "unclear", reason: "?" } } }).d.route === "unclear");
t("budget fail -> not a fit", run({ criteria: { ...base().criteria, budget: { result: "fail", reason: "1L for kitchen+bedroom" } } }).d.route === "not_a_fit");
t("complaint routes to complaint", run({ call_type: "complaint" }).d.route === "complaint");
t("dropped call is held", run({ call_type: "dropped_call" }).d.route === "dropped");
t("low confidence -> review", run({ confidence: "low" }).d.route === "unclear");
process.exit(fail ? 1 : 0);
