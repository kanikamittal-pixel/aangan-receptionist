import { q } from "@/lib/db";
import { verifyWebhook } from "@/lib/calendly";
import { syncLeadToHubspot } from "@/lib/hubsync";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(req.headers.get("calendly-webhook-signature"), raw, process.env.CALENDLY_WEBHOOK_SIGNING_KEY ?? "")) {
    return new Response("bad signature", { status: 401 });
  }
  const { event, payload } = JSON.parse(raw);
  const invitee = payload.uri as string;
  const start = payload.scheduled_event?.start_time as string | undefined;

  if (event === "invitee.canceled") {
    const [b] = await q("select * from bookings where calendly_invitee_uri=$1", [invitee]);
    if (b) {
      // A reschedule shows up as cancel (rescheduled=true) + a new invitee.created pointing back at it.
      const status = payload.rescheduled ? "rescheduled" : "canceled";
      await q("update bookings set status=$2, updated_at=now() where id=$1", [b.id, status]);
      if (!payload.rescheduled) {
        await q("update leads set booking_status='canceled', status='qualified', updated_at=now() where id=$1", [b.lead_id]);
        await syncLeadToHubspot(b.lead_id).catch(console.error);
      }
    }
  } else if (event === "invitee.created" && payload.old_invitee) {
    const [b] = await q("select * from bookings where calendly_invitee_uri=$1", [payload.old_invitee]);
    if (b) {
      await q("update bookings set calendly_invitee_uri=$2, calendly_event_uri=$3, start_time=$4, status='booked', updated_at=now() where id=$1", [b.id, invitee, payload.event, start]);
      await q("update leads set booking_id=$2, booking_time=$3, booking_status='rescheduled', status='consultation_booked', updated_at=now() where id=$1", [b.lead_id, payload.event, start]);
      await syncLeadToHubspot(b.lead_id).catch(console.error);
    }
  }
  // invitee.created for bookings we made ourselves is already stored; nothing to do.
  return Response.json({ ok: true });
}
