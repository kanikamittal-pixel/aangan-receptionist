# Aangan Studio: AI phone receptionist (Case 3)

Phone only. Flow: Vaani voice agent → post-call webhook → Gemini extraction → hard checks in code → routing → Telegram (designers / front desk) → Calendly booking → HubSpot (contact + deal) → Neon log.

```
app/api/webhooks/vaani      post-call webhook (parse → lib/pipeline.processInteraction)
app/api/webhooks/telegram   buttons + decline-reason replies (registered via setWebhook, no polling)
app/api/webhooks/calendly   cancel / reschedule → lead status
app/api/cron/reminders      complaint reminders
app/designer                designer dashboard: /designer?t=<personal token>. Approve (books the meeting) / Reject (needs a reason) / see everything captured
app/nikhil                  Nikhil's pipeline dashboard, live from HubSpot: /nikhil?t=<NIKHIL_TOKEN>
app/api/webhooks/calcom     Cal.com cancel/reschedule (Cal.com is an alternative to Calendly, chosen per designer)
app/admin, /api/admin/*     view calls, edit rules + settings without a redeploy (ADMIN_TOKEN)
lib/vaani.ts                ONLY file that knows Vaani's payload → NormalizedInteraction (channel-agnostic)
lib/hardchecks.ts           area / project type / commercial size / <6-week deadline; code overrides AI, logged in calls.overrides
lib/route.ts                qualified | unclear | complaint | not_a_fit | dropped
lib/assign.ts               the single designer-assignment function (currently: whoever taps)
agent/system-prompt.md      Vaani agent prompt; knowledge/*.md are inlined by `npm run agent:build`
```

## Set up
1. `cp .env.example .env.local`, fill in keys. `npm install`.
2. `npm run db:migrate`
3. `npm run hubspot:setup` (pipeline "Phone Enquiries" + 9 deal properties), then build the dashboard from `docs/HUBSPOT_DASHBOARD.md`.
4. Deploy: push to GitHub, import in Vercel, add the same env vars, set `APP_URL`.
5. `npm run webhooks:setup` (Telegram webhook + Calendly org webhook; prints the Vaani URL).
6. Add each designer (prints their personal dashboard link):
   `npm run designer:add -- "Name" <telegram_user_id|0> calendly <calendly_PAT> <event_type_uri>` or `... cal <cal_api_key> <cal_event_type_id>`
7. `npm run agent:build`, then put `agent/compiled-prompt.md` into Vaani and point its post-call webhook at the printed URL.
8. Put the bot in both groups (designers, front desk), and set the two chat ids.

## Auto-booking by Vaani (for very sure leads)
Vaani's built-in Cal.com integration books during the call; our backend picks it up from the Cal.com webhook and links it to the call.
1. Cal.com: create a **team** event type with round-robin hosting (needs Cal.com Teams). Add each designer's `email` to the `designers` table (matches the host to a designer).
2. Vaani dashboard: Settings -> Integrations -> Cal.com: paste the API key, select that event type.
3. Cal.com: Settings -> Developer -> Webhooks: URL `<APP_URL>/api/webhooks/calcom`, secret = `CAL_WEBHOOK_SECRET`, triggers Booking created / cancelled / rescheduled.
4. Only then switch the agent on: `npm run agent:build -- --booking && npm run agent:create` (without `--booking` the agent never claims to book).
5. Optional: `CAL_API_KEY` (team owner) lets "Decline" cancel a meeting Vaani booked.
"Very sure" = all five criteria pass + high confidence (`lib/route.ts isSure`). Those leads get an FYI in Telegram, no approval. If our after-call checks disagree with a booking the agent made, the lead goes to a designer with a warning; Decline cancels the meeting.

## Dashboards
- **Designers** open their own link; Approve and the Telegram "Take it forward" button do the same thing (first decision wins, the other surface updates). Approve books the earliest free slot and shows the meeting link plus a WhatsApp invite link.
- **Nikhil** reads deals from HubSpot (needs `npm run hubspot:setup` first). `?range=7|30|90|all`.
- Preview with sample data: `npm run demo:seed` (designer dashboard), `NIKHIL_DEMO=1` (Nikhil's). `npm run demo:clear` removes it.

## Tests
- `npm run test:unit`: hard checks and routing, offline.
- `npm run test:transcripts`: T01–T20 through live Gemini + hard checks vs expected outcomes (T17 as a two-call merge), then a dry run of Telegram (test group) and Calendly (books and cancels a slot on a test event type). Needs `GEMINI_API_KEY`; dry run needs the `TEST_*` vars. Options: `-- --only T01,T07`, `-- --no-dry-run`.
- Transcripts live in `tests/transcripts/` (regenerate: `python3 scripts/extract_transcripts.py <pdf>`).

## Config defaults to confirm before go-live
| Setting | Proposed | Where |
|---|---|---|
| Dropped-call merge window | 30 min | settings.merge_window_minutes |
| Complaint reminder | 30 min, up to 2 reminders (30, 60) | settings.complaint_* |
| Telegram groups | "Aangan Designers - Leads", "Aangan Front Desk - Urgent" | settings.telegram_group_names (names only; ids in env) |
| HubSpot pipeline/stages | Phone Enquiries: Needs review, Qualified, Consultation booked, Not a fit, Complaint, Won, Lost | settings.hubspot |
| Designer assignment | **Pending Nikhil's rule**; tapper gets the lead | lib/assign.ts |

## Open questions / known gaps
- **Vaani:** payload, signature scheme, inbound number and Marathi support are not in public docs. `lib/vaani.ts` guesses; webhook auth is a shared `?key=`. Consent is a prompt instruction, not a Vaani feature; the extractor records `consent_to_record`.
- **Calendly needs an invitee email.** Callers don't give one, so a placeholder `<digits>@bookings.aangan.example` is used (`settings.calendly`). Calendly's confirmation email will not reach the caller; the voice agent therefore promises a designer will confirm, not a time. Decide: collect email on the call, or confirm by WhatsApp/SMS. Paid Calendly plans required for each designer.
- **Timeline rule conflict:** `qualified.md` says site ready within 8–10 weeks of consultation; `services.md` and the brief say under 6 weeks fails. Code uses 6 (`rules.min_weeks_to_deadline`). Confirm.
- **500 sq ft commercial minimum** comes from transcript T18, not services.md (`rules.commercial_min_sqft`). Confirm.
- `qualified.md` contains an example budget figure ("₹1–1.5 lakh"); it is in the agent prompt as a rubric example. The prompt forbids quoting prices, but review the first test calls for leakage. The indicative tables from pricing.md are deliberately NOT given to the agent.
- Reminders need Vercel cron every 5 min (Pro plan) or an external pinger hitting `/api/cron/reminders` with `Authorization: Bearer $CRON_SECRET`.
- Declining: a Decline tap with no reply leaves the lead claimed in "declining" state; there's no timeout yet.
- Gemini/Vaani prices in `settings.costs` are placeholders: verify.
- HubSpot dashboards: manual, see `docs/HUBSPOT_DASHBOARD.md`. Won revenue is read by HubSpot itself from the deal Amount.
