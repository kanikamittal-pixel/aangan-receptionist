import { q } from "@/lib/db";
import { designerFromToken } from "@/lib/designer-auth";
import { fmtDateTime, phoneLooksValid, sign } from "@/lib/util";
import { bookingLinkFor } from "@/lib/links";
import LeadActions from "@/components/LeadActions";

export const dynamic = "force-dynamic";

const TABS = [["review", "To review"], ["accepted", "Taken"], ["declined", "Passed"], ["notfit", "Not a fit"]] as const;
const WHERE: Record<string, string> = { review: "l.decision='pending'", accepted: "l.decision='approved'", declined: "l.decision='rejected'", notfit: "l.routing='not_a_fit'" };
const CRIT: [string, string][] = [["real_project", "Real project"], ["location", "In our area"], ["timeline", "Timeline"], ["budget", "Budget"], ["decision_maker", "Decision-maker"]];
const MARK: Record<string, string> = { pass: "✓", fail: "✕", unclear: "?" };

function ago(d: string | Date) {
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string; tab?: string; lead?: string }> }) {
  const { t, tab: tabParam, lead: leadParam } = await searchParams;
  const designer: any = await designerFromToken(t);
  if (!designer) return <main className="d-app"><p>This link isn't valid. Ask the studio for your dashboard link.</p></main>;
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam! : "review";

  const counts: any = (await q("select count(*) filter (where decision='pending')::int review, count(*) filter (where decision='approved')::int accepted, count(*) filter (where decision='rejected')::int declined, count(*) filter (where routing='not_a_fit')::int notfit from leads"))[0];
  const leads = await q(
    `select l.*, coalesce(d.name, (select host_name from bookings where lead_id=l.id and status='booked' order by created_at desc limit 1)) designer_name, dd.name decided_name,
            c.id call_id, c.started_at, c.extraction, c.final_criteria, c.overrides, c.confidence, c.out_of_hours, c.urgent, c.urgent_reason
     from leads l
     join lateral (select * from calls where lead_id=l.id and extraction is not null order by started_at desc limit 1) c on true
     left join designers d on d.id=l.assigned_designer_id left join designers dd on dd.id=l.decided_by
     where ${WHERE[tab]} order by l.last_call_at desc limit 100`,
  );
  const sel: any = leads.find((l: any) => l.id === leadParam) ?? (leadParam ? null : leads[0]);
  const base = `/designer?t=${t}&tab=${tab}`;

  const chips = (l: any) => {
    const out: [string, string][] = [];
    if (l.urgent) out.push(["Urgent", "red"]);
    if (l.booking_time && l.booking_status !== "canceled") out.push([`Booked ${fmtDateTime(l.booking_time)}`, "green"]);
    else if (l.routing === "unclear") out.push(["Not sure", "amber"]);
    else if (l.decision === "approved") out.push(["Taken", "green"]);
    else if (l.decision === "rejected") out.push(["Passed", "grey"]);
    else if (l.routing === "not_a_fit") out.push(["Not a fit", "grey"]);
    else out.push(["Qualified", "green"]);
    return out;
  };

  return (
    <main className="d-app">
      <header className="d-top"><h1>Leads</h1><span>{designer.name}</span></header>
      <nav className="d-tabs">{TABS.map(([k, label]) => <a key={k} href={`/designer?t=${t}&tab=${k}`} className={k === tab ? "on" : ""}>{label} <b>{counts[k]}</b></a>)}</nav>

      <div className={`d-grid ${leadParam ? "has-param" : ""}`}>
        <aside className="d-list">
          {leads.length === 0 && <p className="d-empty">Nothing here.</p>}
          {leads.map((l: any) => {
            const ex = l.extraction ?? {};
            return (
              <a key={l.id} href={`${base}&lead=${l.id}`} className={`d-item ${sel?.id === l.id ? "on" : ""}`}>
                <div className="d-item-top"><b>{l.name ?? "Unknown caller"}</b><span>{ago(l.last_call_at)}</span></div>
                <div className="d-item-sub">{[ex.area ?? ex.city, ex.property_type].filter(Boolean).join(" · ") || "—"}</div>
                <div className="d-chips">{chips(l).map(([text, c]) => <i key={text} className={`d-chip ${c}`}>{text}</i>)}</div>
              </a>
            );
          })}
        </aside>

        <section className="d-detail">
          {!sel ? <p className="d-empty">Select a lead.</p> : (() => {
            const l = sel, ex = l.extraction ?? {}, crit = l.final_criteria ?? {};
            const link = bookingLinkFor(designer, l, ex.email);
            const phoneDigits = (l.phone ?? "").replace(/\D/g, "");
            const wa = (text: string) => phoneDigits ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}` : null;
            const booked = l.booking_time && l.booking_status !== "canceled";
            const rows: [string, string][] = [
              ["Location", [ex.area, ex.city].filter(Boolean).join(", ") || "—"],
              ["Property", [ex.property_type, ex.carpet_area_sqft && `${ex.carpet_area_sqft} sq ft`].filter(Boolean).join(" · ") || "—"],
              ["Scope", ex.scope ?? "—"],
              ["Timeline", ex.timeline_text ?? "—"],
              ["Budget said", ex.volunteered_budget ?? "Not mentioned"],
              ["Decision-maker", ({ on_call: "On the call", represented: "Represented", unclear: "Not clear", no: "No" } as any)[ex.decision_maker] ?? "—"],
              ["Heard of us via", ex.referral_source ?? "—"],
              ["Call", `${fmtDateTime(l.started_at)}${l.out_of_hours ? " (after hours)" : ""}`],
            ];
            return (
              <>
                <a className="d-back" href={base}>← All leads</a>
                <div className="d-head">
                  <h2>{l.name ?? "Unknown caller"}</h2>
                  <div className="d-chips">{chips(l).map(([text, c]) => <i key={text} className={`d-chip ${c}`}>{text}</i>)}</div>
                </div>
                {l.phone && (
                  <div className="d-contact">
                    <a className="d-btn" href={`tel:${l.phone}`}>📞 {l.phone}</a>
                    {wa(`Hi ${l.name ?? ""}, this is Aangan Studio about your design enquiry.`) && <a className="d-btn" href={wa(`Hi ${l.name ?? ""}, this is Aangan Studio about your design enquiry.`)!} target="_blank">WhatsApp</a>}
                  </div>
                )}
                {l.phone && !phoneLooksValid(l.phone) && <p className="d-urgent">⚠️ The phone number looks incomplete ({l.phone}). Please check it with the customer.</p>}
                {l.urgent && <p className="d-urgent">🔥 Urgent: {l.urgent_reason}</p>}
                {ex.is_repeat_caller && <p className="d-note">Repeat caller: {ex.repeat_note ?? "called before"}</p>}

                <h3>Summary</h3>
                <p className="d-summary">{ex.handoff_summary}</p>

                <h3>Project</h3>
                <dl className="d-dl">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>

                <h3>Why it was screened this way</h3>
                <ul className="d-crit">{CRIT.map(([k, label]) => crit[k] && (
                  <li key={k} className={crit[k].result}><span>{MARK[crit[k].result]}</span><div><b>{label}</b><small>{crit[k].reason || (crit[k].result === "pass" ? "OK" : "")}</small></div></li>
                ))}</ul>
                {l.overrides?.length > 0 && <p className="d-note">The rules check changed the AI's answer: {l.overrides.map((o: any) => o.reason).join("; ")}</p>}
                <p><a href={`/transcripts/${l.call_id}?t=${sign(l.call_id)}`} target="_blank">Read the full call transcript ↗</a></p>

                {l.decision === "pending" && (
                  <>
                    {booked && <p className="d-urgent">Vaani already booked {fmtDateTime(l.booking_time)}. Taking the lead keeps it; passing cancels it.</p>}
                    <LeadActions leadId={l.id} token={t!} />
                  </>
                )}

                {l.decision === "approved" && (
                  <div className="d-next">
                    <h3>{booked ? "Meeting" : "Next step"}</h3>
                    {booked ? (
                      <>
                        <p><b>{fmtDateTime(l.booking_time)}</b> with {l.designer_name ?? "the team"}{l.booked_by === "vaani" ? " · booked by Vaani during the call" : l.booked_by === "customer" ? " · booked by the customer" : ""}</p>
                        <div className="d-contact">
                          {l.meeting_url && <a className="d-btn" href={l.meeting_url} target="_blank">Meeting link ↗</a>}
                          {wa(`Hi ${l.name ?? ""}, your consultation with Aangan Studio is booked for ${fmtDateTime(l.booking_time)}.${l.meeting_url ? " Join here: " + l.meeting_url : ""}`) && <a className="d-btn" href={wa(`Hi ${l.name ?? ""}, your consultation with Aangan Studio is booked for ${fmtDateTime(l.booking_time)}.${l.meeting_url ? " Join here: " + l.meeting_url : ""}`)!} target="_blank">Send on WhatsApp</a>}
                        </div>
                      </>
                    ) : (
                      <>
                        <p>Ask {l.name ?? "the customer"} when they would like to meet, or send them your booking link so they choose a time.</p>
                        {link && <div className="d-contact">{wa(`Hi ${l.name ?? ""}, thanks for your enquiry with Aangan Studio. Please choose a time for your free consultation here: ${link}`) && <a className="d-btn d-yes" href={wa(`Hi ${l.name ?? ""}, thanks for your enquiry with Aangan Studio. Please choose a time for your free consultation here: ${link}`)!} target="_blank">Send booking link on WhatsApp</a>}</div>}
                        {!link && <p className="d-err">No booking link is set up for you yet.</p>}
                      </>
                    )}
                    <small className="d-muted">Accepted by {l.decided_name ?? "Vaani"}</small>
                  </div>
                )}

                {l.decision === "rejected" && <div className="d-next"><p>Passed by {l.decided_name}{l.decision_note ? `: “${l.decision_note}”` : ""}</p></div>}
                {l.routing === "not_a_fit" && l.decision === "none" && <div className="d-next"><p>Screened out automatically. It was not sent to designers.</p></div>}
              </>
            );
          })()}
        </section>
      </div>
    </main>
  );
}
