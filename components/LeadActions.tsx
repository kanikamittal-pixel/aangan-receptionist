"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LeadActions({ leadId, token }: { leadId: string; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");

  async function act(action: "approve" | "reject") {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/designer/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, leadId, action, reason }) });
      const j = await r.json();
      if (j.error === "already_decided") setMsg("Someone else already decided this lead.");
      else if (j.error) setMsg(j.error);
      else if (j.bookingError) setMsg("Approved, but booking failed: " + j.bookingError + ". Book manually.");
      router.refresh();
    } catch { setMsg("Network error, try again"); }
    setBusy(false);
  }

  if (rejecting) return (
    <div className="actions">
      <input autoFocus placeholder="One-line reason for rejecting" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn no" disabled={busy || !reason.trim()} onClick={() => act("reject")}>Confirm reject</button>
      <button className="btn" onClick={() => setRejecting(false)}>Cancel</button>
      {msg && <p className="err">{msg}</p>}
    </div>
  );
  return (
    <div className="actions">
      <button className="btn yes" disabled={busy} onClick={() => act("approve")}>{busy ? "Booking…" : "✅ Approve & book meeting"}</button>
      <button className="btn no" disabled={busy} onClick={() => setRejecting(true)}>❌ Reject</button>
      {msg && <p className="err">{msg}</p>}
    </div>
  );
}
