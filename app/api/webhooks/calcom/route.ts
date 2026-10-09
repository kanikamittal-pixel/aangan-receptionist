import { q } from "@/lib/db";
import { verifyCalWebhook } from "@/lib/cal";
import { syncLeadToHubspot } from "@/lib/hubsync";
import { linkBookingToFinishedCall } from "@/lib/autobook";

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyCalWebhook(req.headers.get("x-cal-signature-256"), raw, process.env.CAL_WEBHOOK_SECRET ?? "")) return new Response("bad signature", { status: 401 });
  const { triggerEvent, payload } = JSON.parse(raw);

  if (triggerEvent === "BOOKING_CREATED") {
    // Bookings we made ourselves (designer approval) are already stored; this is for ones Vaani made during a call.
    if (payload.metadata?.source === "aangan-receptionist") return Response.json({ ok: true, own: true });
    const att = payload.attendees?.[0] ?? {};
    const attendee = { name: att.name ?? payload.responses?.name?.value ?? null, email: att.email ?? payload.responses?.email?.value ?? null, phoneNumber: att.phoneNumber ?? payload.responses?.attendeePhoneNumber?.value ?? payload.responses?.phone?.value ?? null };
    const meetingUrl = payload.videoCallData?.url ?? payload.metadata?.videoCallUrl ?? (typeof payload.location === "string" && payload.location.startsWith("http") ? payload.location : null);
    const ins = await q(
      `insert into bookings(provider, external_id, start_time, meeting_url, created_by, host_name, host_email, attendee, status)
       values('cal',$1,$2,$3,'vaani',$4,$5,$6,'booked') on conflict (provider, external_id) where external_id is not null do nothing returning id`,
      [payload.uid, payload.startTime, meetingUrl, payload.organizer?.name ?? null, payload.organizer?.email ?? null, JSON.stringify(attendee)],
    );
    // Normally the post-call pipeline attaches it. If the call was already processed, attach now.
    if (ins[0]) {
      const leadId = await linkBookingToFinishedCall(ins[0].id);
      if (leadId) await syncLeadToHubspot(leadId).catch(console.error);
    }
  } else if (triggerEvent === "BOOKING_CANCELLED") {
    const [b] = await q("select * from bookings where provider='cal' and external_id=$1", [payload.uid]);
    if (b) {
      await q("update bookings set status='canceled', updated_at=now() where id=$1", [b.id]);
      if (b.lead_id) {
        await q("update leads set booking_status='canceled', status='qualified', updated_at=now() where id=$1", [b.lead_id]);
        await syncLeadToHubspot(b.lead_id).catch(console.error);
      }
    }
  } else if (triggerEvent === "BOOKING_RESCHEDULED" && payload.rescheduleUid) {
    const [b] = await q("select * from bookings where provider='cal' and external_id=$1", [payload.rescheduleUid]);
    if (b) {
      await q("update bookings set external_id=$2, start_time=$3, status='booked', updated_at=now() where id=$1", [b.id, payload.uid, payload.startTime]);
      if (b.lead_id) {
        await q("update leads set booking_id=$2, booking_time=$3, booking_status='rescheduled', status='consultation_booked', updated_at=now() where id=$1", [b.lead_id, payload.uid, payload.startTime]);
        await syncLeadToHubspot(b.lead_id).catch(console.error);
      }
    }
  }
  return Response.json({ ok: true });
}
