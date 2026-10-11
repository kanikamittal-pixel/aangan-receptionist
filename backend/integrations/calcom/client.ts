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
const GRID = [...Array(16)].map((_, i) => 9 * 60 + i * 30); // consultation start times: 9:00 am to 4:30 pm, in minutes after midnight

/**
 * Pure: turn Cal.com's free start times into plain text for the voice agent. For each day the agent gets the exact free times AND the
 * times that are not available (already booked or already past), as single times, never ranges, so it cannot misread them.
 */
export function formatSlotsForAgent(slots: string[], now = new Date(), days = 10): { today: string; text: string } | null {
  const part = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString("en-IN", { timeZone: IST, ...o });
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: IST });
  const minutes = (d: Date) => { const [h, m] = part(d, { hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number); return (h % 24) * 60 + m; };
  const clock = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "am" : "pm"}`;
  const free = new Map<string, Set<number>>();
  for (const s of slots) { const d = new Date(s); free.set(dayKey(d), (free.get(dayKey(d)) ?? new Set()).add(minutes(d))); }
  const lines: string[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(now.getTime() + i * 86_400_000), key = dayKey(day), ok = free.get(key) ?? new Set<number>();
    const label = part(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const freeTimes = GRID.filter((m) => ok.has(m)).map(clock), taken = GRID.filter((m) => !ok.has(m)).map(clock);
    lines.push(`${label}\n  FREE: ${freeTimes.join(", ") || "none"}\n  NOT AVAILABLE: ${taken.join(", ") || "none"}`);
  }
  if (!free.size) return null;
  return { today: part(now, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }), text: lines.join("\n") };
}

/** The designer's free consultation times as text for the voice agent (see formatSlotsForAgent). */
export async function freeSlotsForAgent(key: string, eventTypeId: number, days = 10) {
  const now = new Date();
  return formatSlotsForAgent(await findCalSlots(key, eventTypeId, new Date(now.getTime() + 30 * 60_000), days, 500), now, days);
}
