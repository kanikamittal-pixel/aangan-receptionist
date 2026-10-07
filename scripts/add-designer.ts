// npm run designer:add -- "<name>" <telegram_user_id> <calendly_personal_access_token> <consultation_event_type_uri>
import "./env";
import { q } from "../lib/db";

const [name, tgId, token, eventType] = process.argv.slice(2);
if (!name || !tgId) { console.error("usage: designer:add -- <name> <telegram_user_id> [calendly_token] [event_type_uri]"); process.exit(1); }
q(
  `insert into designers(name, telegram_user_id, calendly_token, calendly_event_type_uri) values($1,$2,$3,$4)
   on conflict (telegram_user_id) do update set name=excluded.name, calendly_token=coalesce(excluded.calendly_token, designers.calendly_token),
     calendly_event_type_uri=coalesce(excluded.calendly_event_type_uri, designers.calendly_event_type_uri) returning id`,
  [name, tgId, token ?? null, eventType ?? null],
).then((r) => console.log("designer id", r[0].id)).catch((e) => { console.error(e); process.exit(1); });
