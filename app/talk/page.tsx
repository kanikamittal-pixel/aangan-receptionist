"use client";
import { useRef, useState } from "react";

type State = "idle" | "connecting" | "live" | "ended" | "error";

export default function Talk() {
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const note = (t: string) => setLog((l) => [...l.slice(-14), `${new Date().toLocaleTimeString()}  ${t}`]);
  const room = useRef<any>(null);
  const token = useRef<string>("");
  const lastUserSpeech = useRef<number>(0);
  const agentWasSpeaking = useRef<boolean>(false);
  const t0 = useRef<number>(0);

  async function start() {
    setState("connecting"); setMsg(""); setLog([]); t0.current = Date.now(); lastUserSpeech.current = 0; agentWasSpeaking.current = false;
    const since = () => `${((Date.now() - t0.current) / 1000).toFixed(1)}s`;
    try {
      // 1. Microphone FIRST (permission prompt + device start-up), so the caller is ready before the agent greets.
      const { Room, RoomEvent, Track, DisconnectReason, createLocalAudioTrack, ConnectionState } = await import("livekit-client");
      note("asking for microphone…");
      const micTrack = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      note(`microphone ready after ${since()}`);

      // 2. Create the Vaani session and exchange it for room credentials.
      const r = await fetch("/api/talk/session" + (location.search.includes("old") ? "?old=1" : ""), { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not start the call");
      token.current = j.session_token ?? "";
      note(`session created after ${since()}`);

      // 3. Join the room and publish the already-running microphone straight away.
      const rm = new Room();
      room.current = rm;
      rm.on(RoomEvent.TrackSubscribed, (track, _pub, part) => {
        note(`audio from ${part.identity}`);
        if (track.kind === Track.Kind.Audio) { const el = track.attach(); el.style.display = "none"; document.body.appendChild(el); }
      });
      rm.on(RoomEvent.Disconnected, (reason) => { note(`DISCONNECTED: ${reason !== undefined ? DisconnectReason[reason] ?? reason : "unknown"}`); setState("ended"); micTrack.stop(); document.querySelectorAll("audio").forEach((a) => a.remove()); });
      rm.on(RoomEvent.ParticipantConnected, (p) => note(`joined: ${p.identity} (${p.kind})`));
      rm.on(RoomEvent.ParticipantDisconnected, (p) => note(`LEFT: ${p.identity}`));
      rm.on(RoomEvent.ConnectionStateChanged, (st: any) => note(`connection: ${st}`));
      rm.on(RoomEvent.Reconnecting, () => note("reconnecting…"));
      rm.on(RoomEvent.Reconnected, () => note("reconnected"));
      rm.on(RoomEvent.ActiveSpeakersChanged, (sp) => {
        const now = Date.now();
        const user = sp.some((x) => x.identity.startsWith("web-user"));
        const agent = sp.some((x) => x.identity.startsWith("agent"));
        if (user) lastUserSpeech.current = now;
        if (agent && !agentWasSpeaking.current && lastUserSpeech.current && now - lastUserSpeech.current < 30000)
          note(`⏱ agent started answering ${((now - lastUserSpeech.current) / 1000).toFixed(1)}s after you last spoke`);
        agentWasSpeaking.current = agent;
      });
      await rm.connect(j.lk_url, j.lk_token);
      note(`joined room after ${since()}`);
      const t1 = Date.now();
      await rm.localParticipant.publishTrack(micTrack);
      note(`microphone published in ${((Date.now() - t1) / 1000).toFixed(1)}s (total ${since()})`);
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
      {log.length > 0 && <pre className="muted" style={{ textAlign: "left", fontSize: 12, maxWidth: 560, margin: "24px auto", whiteSpace: "pre-wrap" }}>{log.join("\n")}</pre>}
    </main>
  );
}
