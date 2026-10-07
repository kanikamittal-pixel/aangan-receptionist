import { q } from "./db";
import { answerCallback, editMessage, esc, sendMessage, who } from "./telegram";
import { assignDesigner, type Designer } from "./assign";
import { bookConsultation } from "./booking";
import { syncLeadToHubspot } from "./hubsync";
import { fmtDateTime } from "./util";

/** Atomically claim a message: a button works exactly once. */
async function claim(id: number, action: string, actorId: number, actorName: string) {
  const r = await q(
    "update telegram_messages set acted=true, action=$2, actor_id=$3, actor_name=$4, acted_at=now() where id=$1 and acted=false returning *",
    [id, action, actorId, actorName],
  );
  return r[0] ?? null;
}
const log = (tm: any, action: string, actorId: number, actorName: string, detail?: string) =>
  q("insert into telegram_actions(telegram_message_id, lead_id, action, actor_id, actor_name, detail) values($1,$2,$3,$4,$5,$6)", [tm.id, tm.lead_id, action, actorId, actorName, detail ?? null]);
const stamp = () => fmtDateTime(new Date());

export async function handleCallback(cb: any) {
  const [kind, idStr] = String(cb.data ?? "").split(":");
  const id = Number(idStr);
  const actorId: number = cb.from.id, actorName = who(cb.from);
  if (!id || !["take", "decl", "cb"].includes(kind)) return answerCallback(cb.id);

  if (kind === "cb") {
    const tm = await claim(id, "callback_done", actorId, actorName);
    if (!tm) return answerCallback(cb.id, "Already handled");
    await answerCallback(cb.id, "Marked done");
    await log(tm, "callback_done", actorId, actorName);
    return editMessage(tm.chat_id, tm.message_id, `${tm.text}\n\n✅ <b>Callback done</b> by ${esc(actorName)} · ${stamp()}`);
  }

  // take / decline: caller must be a registered designer
  const [designer] = await q<Designer>("select * from designers where telegram_user_id=$1 and active", [actorId]);
  if (!designer) return answerCallback(cb.id, "You're not registered as a designer. Ask the admin to add you.", true);

  if (kind === "take") {
    const tm = await claim(id, "take", actorId, designer.name);
    if (!tm) return answerCallback(cb.id, "Already handled");
    await answerCallback(cb.id, "Booking…");
    const all = await q<Designer>("select * from designers where active");
    const [lead] = await q("select * from leads where id=$1", [tm.lead_id]);
    const chosen = assignDesigner(lead, designer, all);
    await q("update leads set assigned_designer_id=$2, updated_at=now() where id=$1", [tm.lead_id, chosen.id]);
    await log(tm, "take", actorId, designer.name, `assigned to ${chosen.name}`);
    await editMessage(tm.chat_id, tm.message_id, `${tm.text}\n\n⏳ <b>${esc(chosen.name)}</b> is taking this · booking…`);
    try {
      const b = await bookConsultation(tm.lead_id, chosen);
      await editMessage(tm.chat_id, tm.message_id, `${tm.text}\n\n✅ <b>Taken by ${esc(chosen.name)}</b> · ${stamp()}\n📅 <b>Consultation: ${fmtDateTime(b.start, chosen.calendly_timezone)}</b>`);
      await log(tm, "booked", actorId, designer.name, b.start);
    } catch (e: any) {
      await editMessage(tm.chat_id, tm.message_id, `${tm.text}\n\n✅ <b>Taken by ${esc(chosen.name)}</b> · ${stamp()}\n⚠️ <b>Booking failed:</b> ${esc(e.message)}. Please book manually.`);
      await log(tm, "booking_failed", actorId, designer.name, e.message);
    }
    await syncLeadToHubspot(tm.lead_id).catch((e) => console.error("[hubspot]", e));
    return;
  }

  // decline: claim now, then ask for a one-line reason via force-reply
  const tm = await claim(id, "decline_pending", actorId, designer.name);
  if (!tm) return answerCallback(cb.id, "Already handled");
  await answerCallback(cb.id);
  await editMessage(tm.chat_id, tm.message_id, `${tm.text}\n\n❌ <b>Declining</b> · ${esc(designer.name)} · ${stamp()} (reason needed)`);
  const prompt = await sendMessage(tm.chat_id, `${esc(designer.name)}, one-line reason for declining? <i>Reply to this message.</i>`, undefined, {
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Reason…" },
    reply_to_message_id: tm.message_id,
  });
  await q("update telegram_messages set decline_prompt_message_id=$2 where id=$1", [tm.id, prompt.message_id]);
}

/** A reply to the decline prompt supplies the reason. */
export async function handleMessage(msg: any) {
  const replyTo = msg.reply_to_message?.message_id;
  if (!replyTo || !msg.text) return;
  const [tm] = await q(
    "select * from telegram_messages where decline_prompt_message_id=$1 and chat_id=$2 and action='decline_pending'",
    [replyTo, msg.chat.id],
  );
  if (!tm || tm.actor_id !== msg.from.id) return;
  const claimed = await q("update telegram_messages set action='decline' where id=$1 and action='decline_pending' returning id", [tm.id]);
  if (!claimed.length) return;
  const reason = String(msg.text).slice(0, 300);
  await q("update leads set status='lost', decline_reason=$2, updated_at=now() where id=$1", [tm.lead_id, reason]);
  await log(tm, "decline", msg.from.id, tm.actor_name, reason);
  await editMessage(tm.chat_id, tm.message_id, `${tm.text}\n\n❌ <b>Declined by ${esc(tm.actor_name)}</b> · ${stamp()}\n“${esc(reason)}”`);
  await syncLeadToHubspot(tm.lead_id).catch((e) => console.error("[hubspot]", e));
}
