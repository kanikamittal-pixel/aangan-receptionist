// Add or update a designer and print their personal dashboard link.
//   npm run designer:add -- "Name" <telegram_user_id|0> calendly <calendly_token> <event_type_uri>
//   npm run designer:add -- "Name" <telegram_user_id|0> cal <cal_api_key> <cal_event_type_id>
// Telegram id 0 = dashboard-only designer (not in the Telegram group).
import "./env";
import crypto from "node:crypto";
import { q } from "../lib/db";

const [name, tgIdRaw, provider = "calendly", secret, eventType] = process.argv.slice(2);
if (!name || tgIdRaw === undefined) { console.error('usage: designer:add -- "Name" <telegram_user_id|0> [calendly|cal] [token/api_key] [event_type_uri|id]'); process.exit(1); }
(async () => {
  const tg = Number(tgIdRaw) || null;
  const existing = tg ? await q("select id, dashboard_token from designers where telegram_user_id=$1", [tg]) : await q("select id, dashboard_token from designers where name=$1 and telegram_user_id is null", [name]);
  const token = existing[0]?.dashboard_token ?? crypto.randomBytes(18).toString("base64url");
  const cal = provider === "cal";
  const vals = [name, tg, token, cal ? "cal" : "calendly", cal ? secret ?? null : null, cal ? Number(eventType) || null : null, cal ? null : secret ?? null, cal ? null : eventType ?? null];
  if (existing[0]) await q("update designers set name=$1, telegram_user_id=$2, dashboard_token=$3, scheduler=$4, cal_api_key=coalesce($5,cal_api_key), cal_event_type_id=coalesce($6,cal_event_type_id), calendly_token=coalesce($7,calendly_token), calendly_event_type_uri=coalesce($8,calendly_event_type_uri) where id=$9", [...vals, existing[0].id]);
  else await q("insert into designers(name, telegram_user_id, dashboard_token, scheduler, cal_api_key, cal_event_type_id, calendly_token, calendly_event_type_uri) values($1,$2,$3,$4,$5,$6,$7,$8)", vals);
  console.log(`${name} saved. Dashboard link:\n  ${process.env.APP_URL ?? "http://localhost:3000"}/designer?t=${token}`);
})().catch((e) => { console.error(e); process.exit(1); });
