import { q } from "@/backend/database/client";
import { answerCallback, editMessage, esc, sendMessage, setKeyboard, who, type Button } from "@/backend/integrations/telegram/client";
import { findCalSlots, rescheduleCalBooking } from "@/backend/integrations/calcom/client";
import { renderRescheduled } from "@/backend/integrations/telegram/messages";
import { syncLeadToHubspot } from "@/backend/integrations/hubspot/sync-lead";
import type { Designer } from "@/backend/leads/assign-designer";
import { approveLead, rejectLead, setRejectReason } from "@/backend/leads/actions";
import { fmtDateTime } from "@/backend/shared/util";

/** Atomically claim a message (used for the complaint "Callback done" button): works exactly once. */
async function claim(id: number, action: string, actorId: number, actorName: string) {
  const r = await q(
    "update telegram_messages set acted=true, action=$2, actor_id=$3, actor_name=$4, acted_at=now() where id=$1 and acted=false returning *",
    [id, action, actorId, actorName],
  );
  return r[0] ?? null;
}

const IST = "Asia/Kolkata";
const istDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: IST }); // 2026-10-12
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** "Change time" flow on a booked message: pick a day, pick a time, the meeting is moved in Cal.com. */
async function handleReschedule(cb: any, kind: string, id: number, arg: string | undefined) {
  const [designer] = await q<Designer>("select * from designers where telegram_user_id=$1 and active", [cb.from.id]);
  if (!designer) return answerCallback(cb.id, "You're not registered as a designer. Ask the admin to add you.", true);
  const [tm] = await q("select * from telegram_messages where id=$1 and kind='booked'", [id]);
  if (!tm) return answerCallback(cb.id);
  const change: Button[][] = [[{ text: "🕐 Change time", callback_data: `rs:${tm.id}` }]];
  if (kind === "rb") { await setKeyboard(tm.chat_id, tm.message_id, change); return answerCallback(cb.id); }

  const [b] = await q("select * from bookings where lead_id=$1 and status='booked' order by created_at desc limit 1", [tm.lead_id]);
  const key = process.env.CAL_API_KEY, eventTypeId = Number(process.env.CAL_EVENT_TYPE_ID);
  if (!b || !key || !eventTypeId) return answerCallback(cb.id, "This meeting can't be changed here. Use Cal.com.", true);

  const slots = await findCalSlots(key, eventTypeId, new Date(Date.now() + 3_600_000), 14, 400).catch(() => [] as string[]);
  if (!slots.length) return answerCallback(cb.id, "No free times found in the next 2 weeks. Use Cal.com.", true);

  if (kind === "rs") {
    const days = [...new Set(slots.map(istDay))].slice(0, 7);
    const rows: Button[][] = chunk(days.map((d) => ({ text: dayLabel(slots.find((s) => istDay(s) === d)!), callback_data: `rd:${tm.id}:${d.replaceAll("-", "")}` })), 3);
    rows.push([{ text: "⬅ Keep current time", callback_data: `rb:${tm.id}` }]);
    await setKeyboard(tm.chat_id, tm.message_id, rows);
    return answerCallback(cb.id, "Pick a new day");
  }
  if (kind === "rd" && arg) {
    const day = `${arg.slice(0, 4)}-${arg.slice(4, 6)}-${arg.slice(6, 8)}`;
    const times = slots.filter((s) => istDay(s) === day);
    const rows: Button[][] = chunk(times.map((s) => ({ text: timeLabel(s), callback_data: `rt:${tm.id}:${Math.round(+new Date(s) / 60000)}` })), 3);
    rows.push([{ text: "⬅ Other day", callback_data: `rs:${tm.id}` }]);
    await setKeyboard(tm.chat_id, tm.message_id, rows);
    return answerCallback(cb.id, "Pick a time");
  }
  if (kind === "rt" && arg) {
    const start = new Date(Number(arg) * 60000).toISOString();
    if (!slots.includes(start)) { await answerCallback(cb.id, "That time was just taken. Pick another.", true); return handleReschedule(cb, "rs", id, undefined); }
    try {
      const r = await rescheduleCalBooking(key, b.external_id, start, b.host_email ?? designer.email ?? null, `Moved by ${designer.name} from Telegram`);
      await q("update bookings set external_id=$2, start_time=$3, status='booked', updated_at=now() where id=$1", [b.id, r.uid, start]);
      await q("update leads set booking_id=$2, booking_time=$3, booking_status='rescheduled', status='consultation_booked', updated_at=now() where id=$1", [tm.lead_id, r.uid, start]);
      const when = fmtDateTime(start);
      const text = renderRescheduled(tm.text, when);
      await q("update telegram_messages set text=$2 where id=$1", [tm.id, text]);
      await editMessage(tm.chat_id, tm.message_id, text, change[0]);
      await q("insert into telegram_actions(telegram_message_id, lead_id, action, actor_id, actor_name, detail) values($1,$2,'reschedule',$3,$4,$5)", [tm.id, tm.lead_id, cb.from.id, who(cb.from), when]);
      await syncLeadToHubspot(tm.lead_id).catch((e) => console.error("[hubspot]", e));
      return answerCallback(cb.id, `Moved to ${when}. The customer is emailed.`);
    } catch (e: any) {
      console.error("[reschedule]", e.message);
      return answerCallback(cb.id, "Could not move it. Please use Cal.com.", true);
    }
  }
  return answerCallback(cb.id);
}

export async function handleCallback(cb: any) {
  const [kind, idStr, arg] = String(cb.data ?? "").split(":");
  const id = Number(idStr);
  const actorId: number = cb.from.id, actorName = who(cb.from);
  if (id && ["rs", "rd", "rt", "rb"].includes(kind)) return handleReschedule(cb, kind, id, arg);
  if (!id || !["take", "decl", "cb"].includes(kind)) return answerCallback(cb.id);

  if (kind === "cb") {
    const tm = await claim(id, "callback_done", actorId, actorName);
    if (!tm) return answerCallback(cb.id, "Already handled");
    await answerCallback(cb.id, "Marked done");
    await q("insert into telegram_actions(telegram_message_id, lead_id, action, actor_id, actor_name) values($1,$2,'callback_done',$3,$4)", [tm.id, tm.lead_id, actorId, actorName]);
    return editMessage(tm.chat_id, tm.message_id, `${tm.compact ? tm.compact + "\n" : tm.text + "\n\n"}✅ <b>Callback done</b> by ${esc(actorName)} · ${fmtDateTime(new Date())}`);
  }

  const [designer] = await q<Designer>("select * from designers where telegram_user_id=$1 and active", [actorId]);
  if (!designer) return answerCallback(cb.id, "You're not registered as a designer. Ask the admin to add you.", true);
  const [tm] = await q("select * from telegram_messages where id=$1", [id]);
  if (!tm) return answerCallback(cb.id);

  if (kind === "take") {
    const r = await approveLead(tm.lead_id, designer, "telegram");
    return answerCallback(cb.id, r.ok ? "Booking…" : "Already handled");
  }

  // decline: decide now, then ask for the reason via force-reply
  const r = await rejectLead(tm.lead_id, designer, null, "telegram");
  if (!r.ok) return answerCallback(cb.id, "Already handled");
  await answerCallback(cb.id);
  const prompt = await sendMessage(tm.chat_id, `${esc(designer.name)}, one-line reason for passing? <i>Reply to this message.</i>`, undefined, {
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Reason…" },
    reply_to_message_id: tm.message_id,
  });
  await q("update telegram_messages set decline_prompt_message_id=$2 where id=$1", [tm.id, prompt.message_id]);
}

/** A reply to the decline prompt supplies the reason. */
export async function handleMessage(msg: any) {
  // Onboarding helper: anyone who messages the bot privately gets their IDs back, to give to the studio admin.
  if (msg.chat?.type === "private" && msg.text && !msg.reply_to_message) {
    await sendMessage(msg.chat.id, `👋 Hi ${esc(who(msg.from))}.\nYour Telegram ID: <code>${msg.from.id}</code>\nThis chat's ID: <code>${msg.chat.id}</code>\nSend these to the studio admin to be set up.`);
    return;
  }
  const replyTo = msg.reply_to_message?.message_id;
  if (!replyTo || !msg.text) return;
  const [tm] = await q("select * from telegram_messages where decline_prompt_message_id=$1 and chat_id=$2 and action='decline_pending'", [replyTo, msg.chat.id]);
  if (!tm || tm.actor_id !== msg.from.id) return;
  const [designer] = await q<Designer>("select * from designers where telegram_user_id=$1", [msg.from.id]);
  if (!designer) return;
  await setRejectReason(tm.lead_id, designer, String(msg.text).slice(0, 300));
}
