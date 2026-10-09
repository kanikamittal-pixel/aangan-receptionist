// Sends one sample of each Telegram message to TELEGRAM_DESIGNERS_CHAT_ID. Buttons are inert (callback "dry:0"). No DB, HubSpot or calendar writes.
import "./env";
import { renderBooked, renderComplaint, renderLead } from "../lib/messages";
import { sendMessage } from "../lib/telegram";

const ok = { result: "pass", reason: "" } as const;
const ex: any = { name: "Priya", phone: "+919800000001", area: "Kothrud (Dahanukar Colony)", city: "Pune", property_type: "3BHK apartment", carpet_area_sqft: 1400, scope: "Full home: kitchen, living room, 2 bedrooms", timeline_text: "Done by March, no rush", is_repeat_caller: false, handoff_summary: "Priya (via Shruti Joshi) wants a full redesign of her 3BHK in Kothrud. Wants it done by March with no rush; husband knows and is happy to proceed. Book a consultation.", complaint: null };
const crit: any = { real_project: ok, location: ok, timeline: ok, budget: ok, decision_maker: ok };
const link = `${process.env.APP_URL}/`;
const buttons = [{ text: "✅ Take it forward", callback_data: "dry:0" }, { text: "❌ Decline", callback_data: "dry:0" }];
const tag = "🧪 <i>SAMPLE, not a real lead</i>\n";

(async () => {
  const chat = process.env.TELEGRAM_DESIGNERS_CHAT_ID!;
  const q = { route: "qualified" as const, blocking: [], noted: [], reason: "" };
  const items: [string, import("../lib/telegram").Button[] | undefined][] = [
    [renderLead(ex, q, crit, link, "qualified"), buttons],
    [renderLead({ ...ex, name: "Aman (for his parents)", phone: "+919800000014", area: "Hadapsar", property_type: "3BHK, new possession", carpet_area_sqft: null, scope: "Full interiors", timeline_text: "Not stated", handoff_summary: "Son enquiring for his parents' new 3BHK in Hadapsar. Parents will decide and attend the consultation; he is checking if it is worth pursuing. Confirm the parents can attend, then book." },
      { route: "qualified", blocking: [], noted: ["decision_maker"], reason: "" }, { ...crit, decision_maker: { result: "unclear", reason: "Caller is checking for his parents, who decide" } }, link, "qualified"), buttons],
    [renderLead({ ...ex, name: "Rohan", phone: "+919800000022", area: "Baner", property_type: "2BHK", carpet_area_sqft: 950, scope: "Full redesign", timeline_text: "Possession next month, wants to start immediately", handoff_summary: "Rohan has just taken possession of a 2BHK in Baner and wants a full redesign. He needs to start within weeks. Book the earliest consultation." }, q, crit, link, "qualified", undefined, { urgent: true, reason: "Possession next month, wants to start immediately" }), buttons],
    [renderBooked({ ...ex, name: "Aarti Mehta", phone: "+919800000005", area: "Koregaon Park", property_type: "4BHK", carpet_area_sqft: 2400, scope: "Complete redesign", handoff_summary: "Aarti is redoing a 4BHK in Koregaon Park, referred by Vikram Agarwal. Wants to move back by February. Prefers a site visit for the consultation." }, link, "Sat, 11 Oct, 11:00 am", "Aarav (designer)", "https://cal.com/video/sample"), undefined],
    [renderComplaint({ ...ex, name: "Sheetal Deshpande", complaint: { project_details: "2BHK, Viman Nagar, designer Aryan", summary: "Designer hasn't replied in 5 days after 3 messages and 2 calls; wants a callback from Nikhil or a senior person." } }, link), [{ text: "✅ Callback done", callback_data: "dry:0" }]],
  ];
  for (const [text, b] of items) { await sendMessage(chat, tag + text, b); await new Promise((r) => setTimeout(r, 700)); }
  console.log(`sent ${items.length} samples`);
})().catch((e) => { console.error(e.message); process.exit(1); });
