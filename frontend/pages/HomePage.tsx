/** The first page anyone sees: what this is and where to go. No data, no secrets (dashboard links are personal, so they are not listed here). */
export default function Home() {
  return (
    <div className="ds-root ds-talkpage">
      <main className="ds-talk">
        <div className="ds-brand" style={{ justifyContent: "center", marginBottom: 28 }}><span className="ds-logo">A</span><span>Aangan Studio</span></div>
        <div className="ds-talkcard">
          <p className="ds-kicker" style={{ textAlign: "center" }}>AI voice receptionist</p>
          <h1>Welcome</h1>
          <p className="ds-talk-sub">A voice assistant answers every enquiry for an interior design studio in Pune. It checks the caller against the studio's rules, books a free consultation on the designer's calendar, and passes the lead to the designer on Telegram and a dashboard.</p>

          <a className="ds-btn ds-btn-dark" href="/talk" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>🎙  Talk to the voice assistant</a>

          <div className="ds-try">
            <p className="ds-kicker">How it fits together</p>
            <ul>
              <li><b>Voice call:</b> this site, in English. Calls are recorded.</li>
              <li><b>Designer dashboard:</b> opened with the designer's personal link.</li>
              <li><b>Telegram and HubSpot:</b> alerts for designers, and the sales view for the founder.</li>
            </ul>
            <p className="ds-try-note">Test calls create a real lead and may book a real slot.</p>
          </div>
          <p className="ds-talk-sub" style={{ textAlign: "center", marginTop: 18, fontSize: 13 }}><a href="https://github.com/kanikamittal-pixel/aangan-receptionist" target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>Source code on GitHub</a></p>
        </div>
      </main>
    </div>
  );
}
