import { q } from "@/lib/db";
import { designerFromToken } from "@/lib/designer-auth";
import { fmtDateTime, phoneLooksValid, sign } from "@/lib/util";
import { bookingLinkFor } from "@/lib/links";
import LeadActions from "@/components/LeadActions";
import Shell, { type NavItem } from "@/components/ds/Shell";
import Icon from "@/components/ds/Icon";

export const dynamic = "force-dynamic";

const TABS = [["review", "To review", "inbox"], ["accepted", "Taken", "check"], ["declined", "Passed", "xcircle"], ["notfit", "Not a fit", "ban"]] as const;
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
  if (!designer) return <main style={{ padding: 32, fontFamily: "system-ui" }}><p>This link isn't valid. Ask the studio for your dashboard link.</p></main>;
  const tab = TABS.some(([k]) => k === tabParam) ? tabParam! : "review";

  const counts: any = (await q("select count(*) filter (where decision='pending')::int review, count(*) filter (where decision='approved')::int accepted, count(*) filter (where decision='rejected')::int declined, count(*) filter (where routing='not_a_fit')::int notfit from leads"))[0];
  const leads = await q(
    `select l.*, coalesce(d.name, (select host_name from bookings where lead_id=l.id and status='booked' order by created_at desc limit 1)) designer_name, dd.name decided_name,
            c.id call_id, c.started_at, c.extraction, c.final_criteria, c.overrides, c.confidence, c.out_of_hours, c.urgent, c.urgent_reason
     from leads l
     join lateral (select * from calls where lead_id=l.id and extraction is not null order by started_at desc limit 1) c on true
     left join designers d on d.id=l.assigned_designer_id left join designers dd on dd.id=l.decided_by
     where ${WHERE[tab]} order by c.urgent desc, l.last_call_at desc limit 100`,
  );
  const sel: any = leads.find((l: any) => l.id === leadParam) ?? (leadParam ? null : leads[0]);
  const base = `/designer?t=${t}&tab=${tab}`;

  const nav: NavItem[] = TABS.map(([k, label, icon]) => ({ href: `/designer?t=${t}&tab=${k}`, label, icon, count: counts[k], active: k === tab }));
  const extra: NavItem[] = designer.booking_link ? [
    { href: designer.booking_link, label: "My booking page", icon: "link", external: true },
    { href: "https://app.cal.com/bookings/upcoming", label: "My Cal.com bookings", icon: "calendar", external: true },
  ] : [];

  const chips = (l: any) => {
    const out: [string, string][] = [];
    if (l.urgent) out.push(["🔥 Urgent", "red"]);
    if (l.booking_time && l.booking_status !== "canceled") out.push([`Booked ${fmtDateTime(l.booking_time)}`, "green"]);
    else if (l.routing === "unclear") out.push(["Not sure", "amber"]);
    else if (l.decision === "approved") out.push(["Taken", "green"]);
    else if (l.decision === "rejected") out.push(["Passed", ""]);
    else if (l.routing === "not_a_fit") out.push(["Not a fit", ""]);
    else out.push(["New lead", "green"]);
    return out;
  };

  return (
    <Shell section="Leads" nav={nav} extra={extra} userName={designer.name} title="Leads" subtitle="Enquiries handled by the voice assistant" bellHref={`/designer?t=${t}&tab=review`} bellCount={counts.review}>
      <div className={`ds-grid ${leadParam ? "has-param" : ""}`}>
        <aside className="ds-list">
          {leads.length === 0 && <p className="ds-empty">Nothing here yet.</p>}
          {leads.map((l: any) => {
            const ex = l.extraction ?? {};
            return (
              <a key={l.id} href={`${base}&lead=${l.id}`} className={`ds-lead ${sel?.id === l.id ? "on" : ""}`}>
                <div className="ds-lead-top"><b>{l.name ?? "Unknown caller"}</b><span>{ago(l.last_call_at)}</span></div>
                <div className="ds-lead-sub">{[ex.area ?? ex.city, ex.property_type].filter(Boolean).join(" · ") || "Details in the lead"}</div>
                <div className="ds-chips">{chips(l).map(([text, c]) => <i key={text} className={`ds-chip ${c}`}>{text}</i>)}</div>
              </a>
            );
          })}
        </aside>

        {!sel ? <section className="ds-detail"><p className="ds-empty">Select a lead.</p></section> : (() => {
          const l = sel, ex = l.extraction ?? {}, crit = l.final_criteria ?? {};
          const link = bookingLinkFor(designer, l, ex.email);
          const phoneDigits = (l.phone ?? "").replace(/\D/g, "");
          const wa = (text: string) => (phoneDigits ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}` : null);
          const booked = l.booking_time && l.booking_status !== "canceled";
          const rows: [string, string][] = [
            ["Location", [ex.area, ex.city].filter(Boolean).join(", ") || "—"],
            ["Property", [ex.property_type, ex.carpet_area_sqft && `${ex.carpet_area_sqft} sq ft`].filter(Boolean).join(" · ") || "—"],
            ["Scope", ex.scope ?? "—"],
            ["Timeline", ex.timeline_text ?? "—"],
            ["Budget said", ex.volunteered_budget ?? "Not mentioned"],
            ["Decision-maker", ({ on_call: "On the call", represented: "Represented", unclear: "Not clear", no: "No" } as any)[ex.decision_maker] ?? "—"],
            ["Heard of us via", ex.referral_source ?? "—"],
          ];
          const confirmMsg = `Hi ${l.name ?? ""}, your consultation with Aangan Studio is booked for ${booked ? fmtDateTime(l.booking_time) : ""}.${l.meeting_url ? " Join here: " + l.meeting_url : ""}`;
          const linkMsg = `Hi ${l.name ?? ""}, thanks for your enquiry with Aangan Studio. Please choose a time for your free consultation here: ${link}`;
          const state = l.decision === "pending" ? "pending" : l.decision === "approved" ? "taken" : l.decision === "rejected" ? "passed" : "screened";

          return (
            <>
              <section className="ds-detail">
                <a className="ds-back" href={base}><Icon name="back" size={18} /> All leads</a>
                {l.phone && !phoneLooksValid(l.phone) && <p className="ds-warn red">⚠️ The phone number looks incomplete ({l.phone}). Please check it with the customer.</p>}
                {l.urgent && <p className="ds-warn red">🔥 Urgent: {l.urgent_reason}</p>}
                {ex.is_repeat_caller && <p className="ds-warn">Repeat caller: {ex.repeat_note ?? "called before"}</p>}
                {booked && l.decision === "pending" && <p className="ds-warn red">Vaani already booked {fmtDateTime(l.booking_time)}. Taking the lead keeps it; passing cancels it.</p>}

                <div className="ds-receipt">
                  <div className="ds-receipt-top">
                    <div>
                      <p className="ds-kicker">Enquiry</p>
                      <h2>{l.name ?? "Unknown caller"}</h2>
                      <div className="ds-chips" style={{ marginTop: 10 }}>{chips(l).map(([text, c]) => <i key={text} className={`ds-chip ${c}`}>{text}</i>)}</div>
                    </div>
                    <div className="ds-receipt-id"><p className="ds-kicker">Call</p>{fmtDateTime(l.started_at)}{l.out_of_hours ? <><br />after hours</> : null}</div>
                  </div>

                  <p className="ds-kicker" style={{ marginBottom: 10 }}>Summary</p>
                  <p className="ds-summary">{ex.handoff_summary}</p>

                  <hr className="ds-dashed" />
                  <p className="ds-kicker" style={{ marginBottom: 14 }}>Project</p>
                  <dl className="ds-rows">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>

                  <hr className="ds-dashed" />
                  <p className="ds-kicker" style={{ marginBottom: 14 }}>Why it was screened this way</p>
                  <ul className="ds-crit">{CRIT.map(([k, label]) => crit[k] && (
                    <li key={k} className={crit[k].result}><span>{MARK[crit[k].result]}</span><div><b>{label}</b><small>{crit[k].reason || (crit[k].result === "pass" ? "OK" : "")}</small></div></li>
                  ))}</ul>
                  {l.overrides?.length > 0 && <p className="ds-note" style={{ marginTop: 14 }}>The rules check changed the AI's answer: {l.overrides.map((o: any) => o.reason).join("; ")}</p>}

                  <p className="ds-foot">Confidence: {l.confidence}. <a href={`/transcripts/${l.call_id}?t=${sign(l.call_id)}`} target="_blank" style={{ textDecoration: "underline" }}>Read the full call transcript</a></p>
                </div>
              </section>

              <aside className="ds-side">
                <div className="ds-action">
                  <div className="ds-action-head">
                    <div className="ds-action-icon"><Icon name={state === "pending" ? "inbox" : state === "taken" ? "check" : state === "passed" ? "xcircle" : "ban"} size={28} /></div>
                    <div>
                      <h3>{state === "pending" ? "Needs your decision" : state === "taken" ? (booked ? "Meeting booked" : "You took this lead") : state === "passed" ? "Passed" : "Not a fit"}</h3>
                      <p>{state === "pending" ? "Take it or pass." : state === "taken" ? (l.booked_by === "vaani" ? "Booked by Vaani during the call." : l.booked_by === "customer" ? "Booked by the customer." : `Taken by ${l.decided_name ?? "Vaani"}.`) : state === "passed" ? `By ${l.decided_name}${l.decision_note ? `: “${l.decision_note}”` : ""}` : "Screened out automatically. Not sent to designers."}</p>
                    </div>
                  </div>
                  {state === "pending" && <LeadActions leadId={l.id} token={t!} />}
                  {state === "taken" && booked && <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>{fmtDateTime(l.booking_time)}<span style={{ display: "block", fontWeight: 500, fontSize: 13, color: "rgba(254,205,211,.85)" }}>with {l.designer_name ?? "the team"}</span></p>}
                </div>

                <div className="ds-optcard">
                  <h4>{state === "taken" && !booked ? "Next step" : "Reach the customer"}</h4>
                  {state === "taken" && !booked && <p className="ds-note">Ask {l.name ?? "the customer"} when they would like to meet, or send your booking link so they choose a time.</p>}
                  {l.phone && <a className="ds-opt" href={`tel:${l.phone}`}><span><Icon name="phone" size={20} />Call {l.phone}</span><Icon name="chevron" size={18} /></a>}
                  {wa(`Hi ${l.name ?? ""}, this is Aangan Studio about your design enquiry.`) && <a className="ds-opt" href={wa(`Hi ${l.name ?? ""}, this is Aangan Studio about your design enquiry.`)!} target="_blank"><span><Icon name="message" size={20} />WhatsApp</span><Icon name="chevron" size={18} /></a>}
                  {state === "taken" && !booked && link && wa(linkMsg) && <a className="ds-opt" href={wa(linkMsg)!} target="_blank"><span><Icon name="calendar" size={20} />Send booking link</span><Icon name="chevron" size={18} /></a>}
                  {state === "taken" && !booked && !link && <p className="ds-note">No booking link is set up for you yet.</p>}
                  {booked && l.meeting_url && <a className="ds-opt" href={l.meeting_url} target="_blank"><span><Icon name="video" size={20} />Open meeting link</span><Icon name="chevron" size={18} /></a>}
                  {booked && wa(confirmMsg) && <a className="ds-opt" href={wa(confirmMsg)!} target="_blank"><span><Icon name="message" size={20} />Send booking on WhatsApp</span><Icon name="chevron" size={18} /></a>}
                  <a className="ds-opt" href={`/transcripts/${l.call_id}?t=${sign(l.call_id)}`} target="_blank"><span><Icon name="file" size={20} />Full call transcript</span><Icon name="chevron" size={18} /></a>
                </div>
              </aside>
            </>
          );
        })()}
      </div>
    </Shell>
  );
}
