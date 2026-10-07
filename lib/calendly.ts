import crypto from "node:crypto";
import type { Settings } from "./defaults";
import { safeEqual } from "./util";

const BASE = "https://api.calendly.com";

type Auth = { token: string };

async function cal<T = any>(auth: Auth, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Calendly ${res.status} ${path}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : ({} as T);
}

/** Earliest free slots for an event type. Queries in 7-day windows (safe under any documented window limit). */
export async function findSlots(auth: Auth, eventTypeUri: string, from: Date, days: number, max = 5): Promise<string[]> {
  const slots: string[] = [];
  for (let off = 0; off < days && slots.length < max; off += 7) {
    const start = new Date(from.getTime() + off * 86_400_000);
    const end = new Date(Math.min(start.getTime() + 7 * 86_400_000 - 1000, from.getTime() + days * 86_400_000));
    const q = new URLSearchParams({ event_type: eventTypeUri, start_time: start.toISOString(), end_time: end.toISOString() });
    const r = await cal<{ collection: { status: string; start_time: string }[] }>(auth, `/event_type_available_times?${q}`);
    for (const s of r.collection) if (s.status === "available") slots.push(s.start_time);
  }
  return slots.sort().slice(0, max);
}

export function inviteeEmail(email: string | null | undefined, phone: string | null, s: Settings["calendly"]) {
  if (email) return email;
  const digits = (phone ?? "unknown").replace(/\D/g, "");
  return `${digits}@${s.placeholder_domain}`;
}

export async function createBooking(
  auth: Auth,
  p: { eventTypeUri: string; start: string; name: string; email: string; phone: string | null; timezone: string; s: Settings["calendly"] },
) {
  const body: any = {
    event_type: p.eventTypeUri,
    start_time: p.start,
    invitee: { name: p.name, email: p.email, timezone: p.timezone },
  };
  if (p.s.location_kind) body.location = { kind: p.s.location_kind, ...(p.s.location_text ? { location: p.s.location_text } : {}) };
  if (p.s.pass_text_reminder_number && p.phone) body.invitee.text_reminder_number = p.phone;
  const r = await cal<{ resource: { uri: string; event: string; email: string } }>(auth, "/invitees", { method: "POST", body: JSON.stringify(body) });
  return { inviteeUri: r.resource.uri, eventUri: r.resource.event };
}

export async function cancelEvent(auth: Auth, eventUri: string, reason: string) {
  const uuid = eventUri.split("/").pop();
  return cal(auth, `/scheduled_events/${uuid}/cancellation`, { method: "POST", body: JSON.stringify({ reason }) });
}

export async function currentOrg(auth: Auth) {
  const r = await cal<{ resource: { uri: string; current_organization: string } }>(auth, "/users/me");
  return { user: r.resource.uri, org: r.resource.current_organization };
}

export async function registerWebhook(auth: Auth, url: string, signingKey: string) {
  const { org } = await currentOrg(auth);
  return cal(auth, "/webhook_subscriptions", {
    method: "POST",
    body: JSON.stringify({ url, events: ["invitee.created", "invitee.canceled"], organization: org, scope: "organization", signing_key: signingKey }),
  });
}

/** Calendly-Webhook-Signature: "t=<unix>,v1=<hmac_sha256(t + '.' + rawBody)>" */
export function verifyWebhook(header: string | null, raw: string, key: string, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", key).update(`${parts.t}.${raw}`).digest("hex");
  return safeEqual(expected, parts.v1);
}
