"""Generates docs/components-map.html (+ .svg) in the same swimlane layout as the original Case 3 map, updated to the build as shipped.
Render PNG:  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --hide-scrollbars --force-device-scale-factor=2 --screenshot=docs/components-map.png --window-size=W,H docs/components-map.html"""
import textwrap, html, pathlib

COLS = ["Trigger", "Input", "Context", "Processing", "AI", "Output"]
ACTOR_W, COL_W, BOX_W, PAD, FONT_LH = 176, 258, 228, 28, 16.5
NAVY = "#1f2a4a"

# (name, subtitle, row background, accent colour, {col: (text, tag)})
ROWS = [
 ("Caller", "(Customer)", "#e9eefb", "#4f46e5", {
   0: ("Opens the web call page and starts the call", "CHANGED"),
   1: ("Speaks: what they need, area, size, timeline, name, phone, email and preferred time", None),
   5: ("Gets answers and a booked consultation during the call", None)}),
 ("Voice Agent", "(Vaani Labs)", "#fbf7e6", "#3b82f6", {
   4: ("Answers from the studio docs, checks the 5 criteria, confirms phone and email, never quotes a price", None)}),
 ("Cal.com", "(booking)", "#eaf5ee", "#16a34a", {
   4: ("Books the caller's chosen slot on the designer's calendar, during the call", "CHANGED"),
   5: ("Meeting and video link created; the system is told", None)}),
 ("System", "(Vercel + Neon)", "#eef6ee", "#16a34a", {
   2: ("Studio docs and rules: services, 5 criteria, pricing rule (no figures)", None),
   3: ("Vaani turns speech into text; when the call ends it sends the transcript and recording", None),
   5: ("Hard checks in code (area, project type, size, deadline), routes the lead, logs the call, recording and cost in Neon", None)}),
 ("AI Model", "(Gemini Flash)", "#f8eef3", "#db2777", {
   4: ("Reads the transcript: lead details, criteria results, urgency and a short handoff note", None)}),
 ("Telegram", "(Bot connection)", "#edf1fb", "#2563eb", {
   5: ("Sends designers only what needs action: new leads (Take / Pass), urgent leads, booked meetings, complaints", "CHANGED")}),
 ("Designer dashboard", "(web page)", "#e8f5f8", "#0891b2", {
   5: ("Shows every lead with its details, recording and transcript; the designer takes or passes", "NEW")}),
 ("Studio Team", "(designers, front desk)", "#f1eefa", "#7c3aed", {
   5: ("Designer contacts the customer or joins the booked meeting; front desk calls back complaints", None)}),
 ("Nikhil", "(HubSpot)", "#f8ece8", "#dc2626", {
   5: ("Every lead sits in one sales pipeline by stage, with revenue and cost; a dashboard summarises it", None)}),
]
FLOWS = [
 ((0,0),(0,1),"h"), ((0,1),(1,4),"right_down"), ((3,2),(3,3),"h"), ((3,3),(1,4),"gutter_up"),
 ((1,4),(0,5),"gutter_up_r"), ((1,4),(2,4),"v"), ((2,4),(2,5),"h"), ((3,3),(4,4),"down_right"),
 ((4,4),(3,5),"gutter_up_r"), ((2,5),(3,5),"v"), ((3,5),(5,5),"bus"), ((3,5),(6,5),"bus"), ((3,5),(8,5),"bus"),
 ((5,5),(7,5),"gutter_down_l"), ((6,5),(7,5),"v"), ((7,5),(8,5),"v"),
]
NOTES = []
FOOT1 = "Built with: Claude Code · code on GitHub · hosted on Vercel · data in Neon"
FOOT2 = ""

def wrap(t, n=30): return textwrap.wrap(t, n, break_long_words=False)

# ---- layout
rows_h, boxes = [], {}
for ri, (_, _, _, _, cells) in enumerate(ROWS):
    mh = max([len(wrap(t)) * FONT_LH + 26 for (t, _) in cells.values()] + [60])
    rows_h.append(mh + 2 * PAD)
W = ACTOR_W + COL_W * len(COLS) + 46          # right gutter for the bus
TITLE_H, HEAD_H = 118, 58
y = TITLE_H + HEAD_H
row_y = []
for h in rows_h: row_y.append(y); y += h
GRID_BOTTOM = y
for ri, (_, _, _, acc, cells) in enumerate(ROWS):
    for ci, (t, tag) in cells.items():
        lines = wrap(t); bh = len(lines) * FONT_LH + 26
        x = ACTOR_W + ci * COL_W + (COL_W - BOX_W) / 2
        by = row_y[ri] + (rows_h[ri] - bh) / 2
        boxes[(ri, ci)] = dict(x=x, y=by, w=BOX_W, h=bh, lines=lines, tag=tag, acc=acc)
NOTES_H = 0
H = GRID_BOTTOM + 78

def B(k): return boxes[k]
def R(k): b = B(k); return b["x"] + b["w"]
def L(k): return B(k)["x"]
def T(k): return B(k)["y"]
def Bt(k): b = B(k); return b["y"] + b["h"]
def CX(k): b = B(k); return b["x"] + b["w"] / 2
def CY(k): b = B(k); return b["y"] + b["h"] / 2

paths = []
bus_x = ACTOR_W + COL_W * len(COLS) + 6
for a, b, kind in FLOWS:
    if kind == "h": d = f"M{R(a)},{CY(a)} L{L(b)-2},{CY(b)}"
    elif kind == "v": d = f"M{CX(a)},{Bt(a)} L{CX(b)},{T(b)-2}"
    elif kind == "right_down": d = f"M{R(a)},{CY(a)} L{CX(b)},{CY(a)} L{CX(b)},{T(b)-2}"
    elif kind == "down_right": d = f"M{CX(a)},{Bt(a)} L{CX(a)},{CY(b)} L{L(b)-2},{CY(b)}"
    elif kind == "gutter_up": gx = L(b) - 12; d = f"M{R(a)},{CY(a)} L{gx},{CY(a)} L{gx},{CY(b)} L{L(b)-2},{CY(b)}"
    elif kind == "gutter_up_r": gx = L(b) - 12; d = f"M{R(a)},{CY(a)} L{gx},{CY(a)} L{gx},{CY(b)} L{L(b)-2},{CY(b)}"
    elif kind == "gutter_down_l": gx = L(a) - 12; d = f"M{L(a)},{CY(a)} L{gx},{CY(a)} L{gx},{CY(b)} L{L(b)-2},{CY(b)}"
    elif kind == "bus": d = f"M{R(a)},{CY(a)} L{bus_x},{CY(a)} L{bus_x},{CY(b)} L{R(b)+3},{CY(b)}"
    paths.append(d)

esc = html.escape
o = []
o.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Inter, -apple-system, Helvetica, Arial, sans-serif">')
o.append('<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#2b3552"/></marker></defs>')
o.append(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
o.append(f'<text x="{W/2}" y="52" text-anchor="middle" font-size="31" font-weight="800" fill="{NAVY}">Case 3 · Unanswered Enquiries — Components Map <tspan fill="#9f1239">(as built)</tspan></text>')
o.append(f'<text x="{W/2}" y="82" text-anchor="middle" font-size="15" fill="#5b6479">Aangan Studio · voice assistant for new enquiries</text>')
lx = W/2 - 230
o.append(f'<rect x="{lx}" y="94" width="46" height="16" rx="8" fill="#16a34a"/><text x="{lx+23}" y="106" text-anchor="middle" font-size="10" font-weight="800" fill="#fff">NEW</text><text x="{lx+54}" y="106" font-size="12" fill="#5b6479">added during the build</text>')
o.append(f'<rect x="{lx+210}" y="94" width="66" height="16" rx="8" fill="#d97706"/><text x="{lx+243}" y="106" text-anchor="middle" font-size="10" font-weight="800" fill="#fff">CHANGED</text><text x="{lx+284}" y="106" font-size="12" fill="#5b6479">differs from the original map</text>')
# header bar
o.append(f'<path d="M14,{TITLE_H} h{W-28} a14,14 0 0 1 14,14 v{HEAD_H-14} h-{W} v-{HEAD_H-14} a14,14 0 0 1 14,-14 z" fill="{NAVY}"/>'.replace(f"h{W-28}", f"h{W-28}"))
o.append(f'<rect x="0" y="{TITLE_H}" width="{W}" height="{HEAD_H}" fill="{NAVY}" rx="14"/>')
o.append(f'<text x="{ACTOR_W/2}" y="{TITLE_H+36}" text-anchor="middle" font-size="17" font-weight="800" fill="#fff">Actor</text>')
for ci, c in enumerate(COLS):
    o.append(f'<text x="{ACTOR_W + ci*COL_W + COL_W/2}" y="{TITLE_H+36}" text-anchor="middle" font-size="17" font-weight="800" fill="#fff">{c}</text>')
# rows
for ri, (name, sub, bg, acc, _) in enumerate(ROWS):
    y0, h = row_y[ri], rows_h[ri]
    o.append(f'<rect x="{ACTOR_W}" y="{y0}" width="{W-ACTOR_W}" height="{h}" fill="{bg}"/>')
    o.append(f'<rect x="0" y="{y0}" width="{ACTOR_W}" height="{h}" fill="{NAVY}"/>')
    o.append(f'<line x1="0" x2="{W}" y1="{y0+h}" y2="{y0+h}" stroke="#ffffff" stroke-opacity=".55" stroke-width="1"/>')
    o.append(f'<text x="{ACTOR_W/2}" y="{y0+h/2-2}" text-anchor="middle" font-size="16" font-weight="800" fill="#fff">{esc(name)}</text>')
    o.append(f'<text x="{ACTOR_W/2}" y="{y0+h/2+18}" text-anchor="middle" font-size="12" fill="#c9d1e8">{esc(sub)}</text>')
for ci in range(1, len(COLS)):
    x = ACTOR_W + ci * COL_W
    o.append(f'<line x1="{x}" x2="{x}" y1="{TITLE_H+HEAD_H}" y2="{GRID_BOTTOM}" stroke="#ffffff" stroke-opacity=".7"/>')
# arrows
for d in paths: o.append(f'<path d="{d}" fill="none" stroke="#2b3552" stroke-width="1.7" stroke-dasharray="6 5" marker-end="url(#ar)"/>')
# boxes
for (ri, ci), b in boxes.items():
    o.append(f'<rect x="{b["x"]}" y="{b["y"]}" width="{b["w"]}" height="{b["h"]}" rx="10" fill="#fff" stroke="{b["acc"]}" stroke-width="2.2"/>')
    for li, ln in enumerate(b["lines"]):
        o.append(f'<text x="{b["x"]+b["w"]/2}" y="{b["y"]+22+li*FONT_LH}" text-anchor="middle" font-size="12.5" fill="#222a3d">{esc(ln)}</text>')
    if b["tag"]:
        col, w = ("#16a34a", 46) if b["tag"] == "NEW" else ("#d97706", 66)
        tx = b["x"] + b["w"] - w - 8
        o.append(f'<rect x="{tx}" y="{b["y"]-8}" width="{w}" height="16" rx="8" fill="{col}"/><text x="{tx+w/2}" y="{b["y"]+3.5}" text-anchor="middle" font-size="10" font-weight="800" fill="#fff">{b["tag"]}</text>')
# footer
fy = GRID_BOTTOM + 44
o.append(f'<text x="24" y="{fy}" font-size="14" fill="#3a4258"><tspan font-weight="800">{esc(FOOT1.split(":")[0])}:</tspan>{esc(FOOT1.split(":",1)[1])}</text>')
o.append('</svg>')
svg = "\n".join(o)

out = pathlib.Path(__file__).resolve().parent.parent / "docs"
(out / "components-map.svg").write_text(svg)
(out / "components-map.html").write_text(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Case 3 Components Map (as built)</title><style>body{{margin:0;background:#fff}}svg{{display:block}}</style></head><body>{svg}</body></html>')
print(W, H)
