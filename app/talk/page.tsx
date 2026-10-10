"use client";
import { useRef, useState } from "react";

type State = "idle" | "connecting" | "live" | "ended" | "error";

export default function Talk() {
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");
  const room = useRef<any>(null);
  const token = useRef<string>("");

  async function start() {
    setState("connecting"); setMsg("");
    try {
      const r = await fetch("/api/talk/session", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not start the call");
      token.current = j.session_token;
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const rm = new Room();
      room.current = rm;
      rm.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) { const el = track.attach(); el.style.display = "none"; document.body.appendChild(el); }
      });
      rm.on(RoomEvent.Disconnected, () => { setState("ended"); document.querySelectorAll("audio").forEach((a) => a.remove()); });
      await rm.connect(j.lk_url, j.lk_token);
      await rm.localParticipant.setMicrophoneEnabled(true);
      setState("live");
    } catch (e: any) {
      setState("error");
      setMsg(/permission|denied|NotAllowed/i.test(String(e?.message ?? e)) ? "Please allow microphone access in your browser, then try again." : String(e?.message ?? e));
      try { room.current?.disconnect(); } catch {}
    }
  }

  async function end() {
    try { room.current?.disconnect(); } catch {}
    if (token.current) await fetch("/api/talk/end", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_token: token.current }) }).catch(() => {});
    setState("ended");
  }

  return (
    <main style={{ textAlign: "center", paddingTop: 60 }}>
      <h1>Talk to Aangan Studio</h1>
      <p className="muted">Our voice assistant can answer your questions and book a free design consultation. Speak in English, Hindi or Marathi. Calls are recorded.</p>
      {(state === "idle" || state === "ended" || state === "error") && (
        <button className="btn yes" style={{ fontSize: 18, padding: "14px 28px" }} onClick={start}>{state === "idle" ? "🎙 Start call" : "🎙 Start a new call"}</button>
      )}
      {state === "connecting" && <p>Connecting…</p>}
      {state === "live" && (<><p>🟢 Connected. Go ahead and speak.</p><button className="btn no" onClick={end}>End call</button></>)}
      {state === "ended" && <p className="muted">Call ended. Thank you!</p>}
      {state === "error" && <p className="err">{msg}</p>}
    </main>
  );
}
