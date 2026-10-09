import { q } from "@/lib/db";
import { designerFromToken } from "@/lib/designer-auth";
import { fmtDateTime, sign } from "@/lib/util";
import LeadActions from "@/components/LeadActions";

export const dynamic = "force-dynamic";

const CRIT: Record<string, string> = { real_project: "Real project", location: "Service area", timeline: "Timeline", budget: "Budget", decision_maker: "Decision-maker" };
const TABS = [["pending", "Needs decision"], ["approved", "Approved"], ["rejected", "Rejected"], ["screened", "Screened out"]] as const;
const ICON: Record<string, string> = { pass: "✅", fail: "❌", unclear: "❓" };

export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string; tab?: string }> }) {
  const { t, tab: tabParam } = await searchParams;
  const designer = await designerFromToken(t);
  if (!designer) return <main><p>This link isn't valid. Ask the studio admin for your dashboard link.</p></main>;
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam! : "pending";

  const where: Record<string, string> = {
    pending: "l.decision='pending'", approved: "l.decision='approved'", rejected: "l.decision='rejected'", screened: "l.routing='not_a_fit'",
  };
  const counts = await q("select count(*) filter (where decision='pending')::int pending, count(*) filter (where decision='approved')::int approved, count(*) filter (where decision='rejected')::int rejected, count(*) filter (where routing='not_a_fit')::int screened from leads");
  const leads = await q(
    `select l.*, coalesce(d.name, (select host_name from bookings where lead_id=l.id and status='booked' order by created_at desc limit 1)) designer_name, dd.name decided_name, c.id call_id, c.started_at, c.duration_sec, c.extraction, c.final_criteria, c.overrides, c.confidence, c.out_of_hours, c.urgent, c.urgent_reason
     from leads l
     join lateral (select * from calls where lead_id=l.id and extraction is not null order by started_at desc limit 1) c on true
     left join designers d on d.id=l.assigned_designer_id left join designers dd on dd.id=l.decided_by
     where ${where[tab]} order by l.last_call_at desc limit 100`,
  );
  const base = `/designer?t=${t}`;

  return (
    <main>
      <header>
        <h1>Leads · {designer.name}</h1>
        <nav>{TABS.map(([k, label]) => (
          <a key={k} href={`${base}&tab=${k}`} className={k === tab ? "on" : ""}>{label} <b>{(counts[0] as any)[k]}</b></a>
        ))}</nav>
      </header>
      {leads.length === 0 && <p className="empty">Nothing here.</p>}
      {leads.map((l: any) => {
        const ex = l.extraction ?? {}, crit = l.final_criteria ?? {};
        const unsure = l.routing === "unclear";
        const noted = Object.values(crit).some((c: any) => c.result === "unclear");
        const badge = l.decision === "approved" && l.booked_by === "vaani" ? ["Booked by Vaani", "ok"] : l.decision === "approved" ? ["Approved", "ok"] : l.decision === "rejected" ? ["Rejected", "bad"] : l.routing === "not_a_fit" ? ["Screened out", "bad"] : l.routing === "unclear" ? ["Not sure", "warn"] : ["Qualified", "ok"];
        const wa = l.phone && l.booking_time ? `https://wa.me/${l.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${l.name ?? ""}, your consultation with Aangan Studio is booked for ${fmtDateTime(l.booking_time)}.${l.meeting_url ? " Join here: " + l.meeting_url : ""}`)}` : null;
        return (
          <article key={l.id} className="card">
            <div className="top">
              {l.urgent && <span className="badge bad" title={l.urgent_reason ?? ""}>🔥 Urgent</span>}
              <span className={`badge ${badge[1]}`}>{badge[0]}</span>
              <h2>{l.name ?? "Unknown caller"}</h2>
              {l.phone && <a href={`tel:${l.phone}`} className="phone">{l.phone}</a>}
              <span className="when">{fmtDateTime(l.started_at)}{l.out_of_hours ? " · after hours" : ""}</span>
            </div>
            <dl>
              <dt>Location</dt><dd>{[ex.area, ex.city].filter(Boolean).join(", ") || "—"}</dd>
              <dt>Property</dt><dd>{[ex.property_type, ex.carpet_area_sqft && `${ex.carpet_area_sqft} sq ft`].filter(Boolean).join(" · ") || "—"}</dd>
              <dt>Scope</dt><dd>{ex.scope ?? "—"}</dd>
              <dt>Timeline</dt><dd>{ex.timeline_text ?? "—"}</dd>
              <dt>Budget said</dt><dd>{ex.volunteered_budget ?? "Not mentioned"}</dd>
              <dt>Decision-maker</dt><dd>{ex.decision_maker ?? "—"}</dd>
              <dt>Heard of us via</dt><dd>{ex.referral_source ?? "—"}</dd>
            </dl>
            {ex.is_repeat_caller && <p className="flag">🔁 Repeat caller: {ex.repeat_note ?? "called before"}</p>}
            <p className="summary">{ex.handoff_summary}</p>
            <details open={unsure || noted}>
              <summary>Screening ({l.confidence} confidence){unsure ? " · needs your judgement" : noted ? " · uncertainty noted" : ""}</summary>
              <ul>{Object.keys(CRIT).map((k) => crit[k] && <li key={k}>{ICON[crit[k].result]} <b>{CRIT[k]}</b>: {crit[k].reason || crit[k].result}</li>)}</ul>
              {l.overrides?.length > 0 && <p className="flag">Rules check overrode the AI: {l.overrides.map((o: any) => o.reason).join("; ")}</p>}
            </details>
            <p className="links"><a href={`/transcripts/${l.call_id}?t=${sign(l.call_id)}`} target="_blank">Full transcript ↗</a></p>
            {l.decision === "pending" && l.booking_time && <p className="flag">🚨 Vaani already booked {fmtDateTime(l.booking_time)}{l.meeting_url ? <> · <a href={l.meeting_url} target="_blank">link ↗</a></> : null}. Approve keeps it; Reject cancels it.</p>}
            {l.decision === "pending" && <LeadActions leadId={l.id} token={t!} />}
            {l.decision === "approved" && (
              <div className="booked">
                {l.booked_by === "vaani" ? <>✅ Booked automatically by Vaani during the call (no approval needed) · with <b>{l.designer_name ?? "team"}</b></> : <>✅ Approved by {l.decided_name} · assigned to <b>{l.designer_name}</b></>}<br />
                {l.booking_time ? <>📅 <b>{fmtDateTime(l.booking_time)}</b>{l.meeting_url && <> · <a href={l.meeting_url} target="_blank">Meeting link ↗</a></>}{wa && <> · <a href={wa} target="_blank">Send invite on WhatsApp ↗</a></>}</> : <span className="err">No meeting booked yet. Book manually.</span>}
              </div>
            )}
            {l.decision === "rejected" && <div className="booked">❌ Rejected by {l.decided_name}{l.decision_note ? `: “${l.decision_note}”` : " (reason pending)"}</div>}
            {l.routing === "not_a_fit" && <div className="booked">Screened out automatically. Not forwarded to designers.</div>}
          </article>
        );
      })}
    </main>
  );
}
