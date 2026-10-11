# Changelog

## v1.0.0

First complete release.

- Vaani voice agent (English; Hindi in progress) with in-call booking on Cal.com.
- Post-call webhook, Gemini extraction, code-based hard checks, routing.
- Telegram alerts for urgent, booked and new qualified leads.
- HubSpot contact and deal sync in a single "Sales pipeline" (INR).
- Designer dashboard, Nikhil's dashboard, web call page, signed transcript and recording links.
- Neon Postgres log with per-call cost in rupees.
- Frontend and backend separated; backend grouped by connection.
- 44 unit checks and 20 transcript tests (T01-T20).

## Unreleased

- Telegram: booked messages have a "Change time" button (pick a day, then a time; the meeting moves in Cal.com and the customer is emailed).
- Booking: the web call gives the agent today's date and the designer's real free times, so it only offers times that can be booked.
- Fixed: the reminder workflow file was invalid YAML, so complaint reminders never ran.
- Dashboard: Take and Pass answer at once (the HubSpot update runs afterwards); Pass offers quick reasons; the old view-only mode was removed.
- Cleanup: unused scripts, exports and old styles removed.
- Dashboard: Urgent tab and tile, "Before you call" guidance from the studio rubric, call length, "Follow up" flag for taken leads not yet contacted.
