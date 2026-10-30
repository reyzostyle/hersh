# Chumoku, the mascot (2026-10-30): a soft round mochi with the logo's
# pinwheel flower worn as a bow. Run `python3 make.py` to rebuild every
# expression as SVG (and sheet.html to look at them together).
INK = "#1B1B1F"
BODY = "#F7F2EA"
SHADE = "#E8DFD0"
CHEEK = "#FF9EAA"

def flower(x, y, r=1.0, rot=-18):
    # Lopsided, so the five of them swirl like the logo's pinwheel.
    petal = "M0 0 C -15 -3 -19 -25 -8 -35 C 4 -33 9 -14 0 0 Z"
    petals = "".join(
        f'<path d="{petal}" transform="rotate({i*72}) translate(5,0)" fill="#FFFFFF" stroke="{INK}" stroke-width="2.6" stroke-linejoin="round"/>'
        for i in range(5))
    return (f'<g transform="translate({x},{y}) rotate({rot}) scale({r})">{petals}'
            f'<circle r="6.5" fill="#F5C451" stroke="{INK}" stroke-width="2.4"/></g>')

def body(squash=1.0):
    return f'''
  <ellipse cx="100" cy="206" rx="52" ry="7" fill="#000" opacity="0.22"/>
  <ellipse cx="78" cy="197" rx="15" ry="8" fill="{SHADE}" stroke="{INK}" stroke-width="3"/>
  <ellipse cx="122" cy="197" rx="15" ry="8" fill="{SHADE}" stroke="{INK}" stroke-width="3"/>
  <g transform="translate(100,200) scale(1,{squash}) translate(-100,-200)">
    <path d="M100 62 C152 62 180 102 178 146 C176 186 146 200 100 200 C54 200 24 186 22 146 C20 102 48 62 100 62 Z"
          fill="{BODY}" stroke="{INK}" stroke-width="3.5"/>
    <path d="M40 168 C56 190 144 190 160 168 C150 186 128 194 100 194 C72 194 50 186 40 168 Z" fill="{SHADE}" opacity="0.7"/>
    <ellipse cx="70" cy="92" rx="16" ry="9" fill="#FFFFFF" opacity="0.8" transform="rotate(-24 70 92)"/>
  </g>'''

def cheeks(o=0.55):
    return (f'<ellipse cx="62" cy="158" rx="10" ry="5.5" fill="{CHEEK}" opacity="{o}"/>'
            f'<ellipse cx="138" cy="158" rx="10" ry="5.5" fill="{CHEEK}" opacity="{o}"/>')

def eye(cx, cy, dx=0, dy=0, rx=10, ry=13):
    return (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{INK}"/>'
            f'<circle cx="{cx+3.5+dx}" cy="{cy-5+dy}" r="{rx*0.36:.1f}" fill="#FFF"/>'
            f'<circle cx="{cx-3+dx}" cy="{cy+5+dy}" r="{rx*0.16:.1f}" fill="#FFF" opacity="0.8"/>')

def arc_eye(cx, cy, up=True):
    d = f"M{cx-9} {cy+3} Q{cx} {cy-9} {cx+9} {cy+3}" if up else f"M{cx-9} {cy-2} Q{cx} {cy+7} {cx+9} {cy-2}"
    return f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round"/>'

FACES = {
    "happy": eye(78, 135) + eye(122, 135) + cheeks()
        + f'<path d="M93 156 Q100 163 107 156" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>',
    "excited": arc_eye(78, 136) + arc_eye(122, 136) + cheeks(0.75)
        + f'<path d="M90 152 Q100 152 110 152 Q109 168 100 168 Q91 168 90 152 Z" fill="{INK}"/>'
        + f'<path d="M94 162 Q100 158 106 162 Q103 167 100 167 Q97 167 94 162 Z" fill="#FF7A8A"/>'
        + "".join(f'<path d="M{x} {y-8} L{x+2} {y-2} L{x+8} {y} L{x+2} {y+2} L{x} {y+8} L{x-2} {y+2} L{x-8} {y} L{x-2} {y-2} Z" fill="#F5C451" stroke="{INK}" stroke-width="2"/>'
                  for x, y in [(30, 92), (176, 112), (20, 140)]),
    "thinking": eye(80, 133, -4, -3) + eye(124, 133, -4, -3) + cheeks(0.4)
        + f'<path d="M95 159 L106 157" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>'
        + "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#FFFFFF" stroke="{INK}" stroke-width="2.4"/>' for x, y, r in [(40, 104, 4), (28, 86, 6), (16, 62, 9)]),
    "wow": eye(78, 133, rx=12, ry=15) + eye(122, 133, rx=12, ry=15) + cheeks(0.6)
        + f'<ellipse cx="100" cy="160" rx="6" ry="7.5" fill="{INK}"/>',
    "wink": eye(78, 135) + arc_eye(122, 137) + cheeks(0.7)
        + f'<path d="M91 155 Q100 166 109 155" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round"/>',
    "sleepy": arc_eye(78, 138, up=False) + arc_eye(122, 138, up=False) + cheeks(0.45)
        + f'<ellipse cx="100" cy="158" rx="3.5" ry="2.5" fill="{INK}"/>'
        + f'<text x="36" y="96" font-family="Arial Rounded MT Bold, Arial" font-weight="700" font-size="22" fill="#FFFFFF" stroke="{INK}" stroke-width="1.2">z</text>'
        + f'<text x="22" y="72" font-family="Arial Rounded MT Bold, Arial" font-weight="700" font-size="16" fill="#FFFFFF" stroke="{INK}" stroke-width="1">z</text>',
}

SQUASH = {"excited": 0.96, "sleepy": 0.97}
FLOWER = {"thinking": (122, 66, 1.0, -30), "excited": (128, 60, 1.05, -8)}

for name, face in FACES.items():
    fx, fy, fr, frot = FLOWER.get(name, (128, 64, 1.0, -18))
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" width="400" height="440">
  <title>Chumoku, {name}</title>{body(SQUASH.get(name, 1.0))}
  {face}
  {flower(fx, fy, fr, frot)}
</svg>
'''
    open(f"chumoku-{name}.svg", "w").write(svg)

cards = "".join(f'<figure><img src="chumoku-{n}.svg"><figcaption>{n}</figcaption></figure>' for n in FACES)
open("sheet.html", "w").write(f'''<!doctype html><meta charset="utf-8"><title>Chumoku mascot</title>
<style>body{{margin:0;background:#0A0A0B;color:#9D9D9E;font:14px -apple-system,system-ui}}
main{{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;padding:40px}}
figure{{margin:0;text-align:center}}img{{width:100%;max-width:240px}}</style>
<main>{cards}</main>''')
print("ok", len(FACES))
