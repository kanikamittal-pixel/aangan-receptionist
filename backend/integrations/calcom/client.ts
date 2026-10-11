import crypto from "node:crypto";
import { safeEqual } from "@/backend/shared/util";

// Cal.com API v2. Each endpoint family needs its own cal-api-version header: bookings "2026-02-25", slots "2024-09-04", webhooks "2024-08-13".
const BASE = "https://api.cal.com/v2";

async function calcom<T = any>(key: string, version: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { authorization: `Bearer ${key}`, "cal-api-version": version, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cal.com ${res.status} ${path}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : ({} as T);
}

export async function findCalSlots(key: string, eventTypeId: number, from: Date, days: number, max = 5): Promise<string[]> {
  const q = new URLSearchParams({ eventTypeId: String(eventTypeId), start: from.toISOString(), end: new Date(from.getTime() + days * 86_400_000).toISOString() });
  const r = await calcom<{ data: Record<string, { start: string }[]> }>(key, "2024-09-04", `/slots?${q}`);
  return Object.values(r.data ?? {}).flat().map((s) => s.start).sort().slice(0, max);
}

export async function createCalBooking(key: string, p: { eventTypeId: number; start: string; name: string; email: string; phone: string | null; timezone: string }) {
  const r = await calcom<{ data: { uid: string; start: string; location?: string; meetingUrl?: string } }>(key, "2026-02-25", "/bookings", {
    method: "POST",
    body: JSON.stringify({
      start: p.start, eventTypeId: p.eventTypeId,
      attendee: { name: p.name, email: p.email, timeZone: p.timezone, ...(p.phone ? { phoneNumber: p.phone } : {}) },
      metadata: { source: "aangan-receptionist" },
    }),
  });
  return { uid: r.data.uid, meetingUrl: r.data.location ?? r.data.meetingUrl ?? null };
}

export async function cancelCalBooking(key: string, uid: string, reason: string) {
  return calcom(key, "2026-02-25", `/bookings/${uid}/cancel`, { method: "POST", body: JSON.stringify({ cancellationReason: reason }) });
}

/** Move a booking to a new start time. Cal.com emails the attendee. Returns the new booking uid. */
export async function rescheduleCalBooking(key: string, uid: string, start: string, rescheduledBy: string | null, reason: string) {
  const r = await calcom<{ data: { uid: string; start: string } }>(key, "2026-02-25", `/bookings/${uid}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ start, reschedulingReason: reason, ...(rescheduledBy ? { rescheduledBy } : {}) }),
  });
  return { uid: r.data.uid, start: r.data.start };
}

/** x-cal-signature-256 = hex(HMAC_SHA256(secret, rawBody)) */
export function verifyCalWebhook(header: string | null, raw: string, secret: string) {
  if (!header || !secret) return false;
  return safeEqual(crypto.createHmac("sha256", secret).update(raw).digest("hex"), header);
}

/** Subscribe the app to booking events. Safe to run twice: an existing subscription is left alone. */
export async function registerCalWebhook(key: string, url: string, secret: string) {
  try {
    await calcom(key, "2024-08-13", "/webhooks", { method: "POST", body: JSON.stringify({ subscriberUrl: url, triggers: ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"], active: true, secret }) });
    return "created";
  } catch (e: any) {
    if (/409|already exists/i.test(String(e.message))) return "already exists";
    throw e;
  }
}

const IST = "Asia/Kolkata";

/**
 * The designer's free consultation times as plain text for the voice agent, e.g.
 * "Mon 12 Oct 2026: 9:00 am to 4:00 pm, 4:30 pm". Weekdays are computed here so the agent never has to work them out.
 */
export async function freeSlotsForAgent(key: string, eventTypeId: number, days = 10): Promise<{ today: string; text: string } | null> {
  const slots = await findCalSlots(key, eventTypeId, new Date(Date.now() + 30 * 60_000), days, 500);
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-IN", { timeZone: IST, ...o });
  const byDay = new Map<string, string[]>();
  for (const s of slots) {
    const d = fmt(s, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    byDay.set(d, [...(byDay.get(d) ?? []), s]);
  }
  const clock = (iso: string) => fmt(iso, { hour: "numeric", minute: "2-digit", hour12: true });
  const lines = [...byDay].map(([day, list]) => {
    const runs: string[][] = [];
    for (const s of list) {
      const last = runs[runs.length - 1];
      if (last && +new Date(s) - +new Date(last[last.length - 1]) === 30 * 60_000) last.push(s); else runs.push([s]);
    }
    return `${day}: ${runs.map((r) => (r.length === 1 ? clock(r[0]) : `${clock(r[0])} to ${clock(r[r.length - 1])}`)).join(", ")}`;
  });
  if (!lines.length) return null;
  return { today: fmt(new Date().toISOString(), { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }), text: lines.join("\n") };
}
