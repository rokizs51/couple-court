# Couple Court Design

Source of truth for look and feel. Read this before touching any UI.
Screens: `01-home.png`, `02-judge-vote.png`, `03-statement.png`, `04-verdict.png`, `05-safety.png`.

## Look and feel
Warm courtroom paper. Playful but never cartoonish. No emoji, no gradients.
- Page background `--paper`; cards `--card` with 1px `--line` border.
- Headings: Fraunces 800. Body: DM Sans. Verdicts and judge quotes: Fraunces italic 600.
- Primary button: burgundy, white text, 52px tall, 14px radius.
- Secondary button: transparent, 2px ink border. Neutral dark button: ink fill.
- Fault split bar: Sam = burgundy, Alex = ink, 48-56px tall, rounded 12-14px.
- "The sentence" card: gold fill, ink text. Mood meter: 4 segments, gold when filled.
- Selected judge card: 3px ink border. "Surprise Us": dashed border, no fill.
- Safety screen: white background, no gavel, no judge, no fault split, no game styling.
- Mobile 390px is the primary layout. Web (1280px) reuses the same components in
  wider grids that stack at narrow widths.

## Implementation rules
- Colors, type and radius come from token variables in `src/styles/tokens.css` only.
- Judges render through the `JudgeAvatar` component (SVGs, 64x64, pre-clipped). Do not redraw them.
- Touch targets are at least 44px.
- Fonts are self-hosted via @fontsource: Fraunces 600, 800, italic 600; DM Sans 400, 500, 700.
- Vote flow: pick a judge, then "Lock in my vote". Timer bar with "0:18 left".
- Do not invent new colors or components. If a screen or state is not designed, ask first.

## Open items
- `tokens.css`, `judges/*.svg` and `web-home.png` were not delivered yet.
- Home/join screens: name field and language toggle are not in the design; keep existing features.
