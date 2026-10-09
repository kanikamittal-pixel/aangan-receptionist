import { hubspotAppHost, loadPipelineView } from "@/lib/pipeline-metrics";
import { safeEqual } from "@/lib/util";
import type { StageKey } from "@/lib/hubspot";

export const dynamic = "force-dynamic";
const RANGES: Record<string, [string, number]> = { "7": ["7 days", 7], "30": ["30 days", 30], "90": ["90 days", 90], all: ["All time", 0] };
const inr = (n: number | null) => (n == null ? "—" : "₹" + Math.round(n).toLocaleString("en-IN"));
const ORDER: StageKey[] = ["needs_review", "qualified", "consultation_booked", "won", "lost", "not_a_fit", "complaint"];

export default async function Page({ searchParams }: { searchParams: Promise<{ t?: string; range?: string }> }) {
  const { t, range = "30" } = await searchParams;
  if (!t || !process.env.NIKHIL_TOKEN || !safeEqual(process.env.NIKHIL_TOKEN, t)) return <main><p>Not authorised.</p></main>;
  const [label, days] = RANGES[range] ?? RANGES["30"];
  let view;
  try { view = await loadPipelineView(days ? Date.now() - days * 86_400_000 : 0); }
  catch (e: any) { return <main><h1>Pipeline</h1><p className="err">HubSpot isn't connected yet: {e.message}</p></main>; }
  const { metrics: m, deals, portalId, rawCalls, stageLabels, stageKeyById } = view;
  const max = Math.max(1, ...Object.values(m.byStage));
  const tile = (title: string, value: string, sub?: string) => <div className="tile"><span>{title}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;

  return (
    <main>
      <header>
        <h1>Aangan · Phone enquiries pipeline</h1>
        <nav>{Object.entries(RANGES).map(([k, [l]]) => <a key={k} href={`/nikhil?t=${t}&range=${k}`} className={k === range ? "on" : ""}>{l}</a>)}</nav>
      </header>
      <p className="muted">Live from HubSpot · {label}</p>
      <section className="tiles">
        {tile("Calls received", String(rawCalls), `${m.leads} leads in HubSpot`)}
        {tile("Answered within 5 min", m.pctAnswered5 == null ? "—" : m.pctAnswered5 + "%")}
        {tile("Out-of-hours calls", String(m.outOfHours))}
        {tile("Consultations booked", String(m.consultations))}
        {tile("Won revenue", inr(m.wonRevenue))}
        {tile("Total cost", inr(m.totalCost))}
        {tile("Cost per qualified lead", inr(m.costPerQualified), `${m.qualified} qualified`)}
        {tile("Revenue vs cost", m.revenueVsCost == null ? "—" : m.revenueVsCost + "×")}
      </section>
      <h2>Leads by stage</h2>
      <section className="bars">
        {ORDER.map((k) => <div key={k} className="bar"><span>{stageLabels[k]}</span><i style={{ width: `${(m.byStage[k] / max) * 100}%` }} /><b>{m.byStage[k]}</b></div>)}
      </section>
      <h2>Latest deals</h2>
      <table>
        <thead><tr><th>Deal</th><th>Stage</th><th>Designer</th><th>Call</th><th>Cost</th><th>Amount</th></tr></thead>
        <tbody>{deals.map((d) => (
          <tr key={d.id}>
            <td>{portalId ? <a href={`https://${hubspotAppHost()}/contacts/${portalId}/record/0-3/${d.id}`} target="_blank">{d.props.dealname}</a> : d.props.dealname}</td>
            <td>{stageLabels[stageKeyById[d.props.dealstage ?? ""]] ?? "—"}</td>
            <td>{d.props.assigned_designer ?? "—"}</td>
            <td>{d.props.call_time ? new Date(d.props.call_time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—"}</td>
            <td>{d.props.call_cost_inr ? "₹" + d.props.call_cost_inr : "—"}</td>
            <td>{d.props.amount ? inr(Number(d.props.amount)) : "—"}</td>
          </tr>))}</tbody>
      </table>
      <p className="muted">Move a deal to <b>Won</b> and set its <b>Amount</b> in HubSpot; revenue updates here automatically.</p>
    </main>
  );
}
