"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const REASONS = ["Outside my area", "Not the kind of project we do", "Timeline too tight", "I'm fully booked"];

/** Take / Pass buttons, styled for the dark action card. Taking does not book anything: the designer asks the customer's preferred time. */
export default function LeadActions({ leadId, token }: { leadId: string; token: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [sending, setSending] = useState(false);
  const [passing, setPassing] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const busy = sending || refreshing;

  async function act(action: "approve" | "reject") {
    if (busy) return;
    setSending(true); setMsg("");
    try {
      const r = await fetch("/api/designer/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, leadId, action, reason }) });
      const j = await r.json();
      if (j.error === "already_decided") setMsg("Someone else already decided this lead.");
      else if (j.error) setMsg(j.error);
      startRefresh(() => router.refresh());
    } catch { setMsg("Network error, please try again."); }
    setSending(false);
  }

  return (
    <div className="ds-actions">
      {passing ? (
        <>
          <p className="ds-reason-label">Why are you passing? Pick one or write your own.</p>
          <div className="ds-reasons">{REASONS.map((r) => <button key={r} type="button" className={`ds-chipbtn ${reason === r ? "on" : ""}`} onClick={() => setReason(r)}>{r}</button>)}</div>
          <input placeholder="Or write a reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="ds-btn ds-btn-light" disabled={busy || !reason.trim()} onClick={() => act("reject")}>{busy ? "Saving…" : "Pass on this lead"}</button>
          <button className="ds-btn ds-btn-ghost" disabled={busy} onClick={() => setPassing(false)}>Back</button>
        </>
      ) : (
        <>
          <button className="ds-btn ds-btn-light" disabled={busy} onClick={() => act("approve")}>{busy ? "Saving…" : "Take this lead"}</button>
          <button className="ds-btn ds-btn-ghost" disabled={busy} onClick={() => setPassing(true)}>Pass</button>
        </>
      )}
      {msg && <p className="ds-err">{msg}</p>}
    </div>
  );
}
