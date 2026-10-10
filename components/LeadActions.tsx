"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LeadActions({ leadId, token }: { leadId: string; token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");

  async function act(action: "approve" | "reject") {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/designer/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, leadId, action, reason }) });
      const j = await r.json();
      if (j.error === "already_decided") setMsg("Someone else already decided this lead.");
      else if (j.error) setMsg(j.error);
      router.refresh();
    } catch { setMsg("Network error, please try again."); }
    setBusy(false);
  }

  return (
    <div className="d-actions">
      {declining ? (
        <>
          <input autoFocus placeholder="Reason for declining (one line)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="d-btn d-no" disabled={busy || !reason.trim()} onClick={() => act("reject")}>Decline lead</button>
          <button className="d-btn" onClick={() => setDeclining(false)}>Back</button>
        </>
      ) : (
        <>
          <button className="d-btn d-yes" disabled={busy} onClick={() => act("approve")}>{busy ? "Saving…" : "Accept lead"}</button>
          <button className="d-btn" disabled={busy} onClick={() => setDeclining(true)}>Decline</button>
        </>
      )}
      {msg && <p className="d-err">{msg}</p>}
    </div>
  );
}
