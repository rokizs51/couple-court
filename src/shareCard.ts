import type { Verdict } from "../shared/verdict";
import type { JudgeId } from "../shared/judges";
import { token } from "./judgeStyle";
import { AVATAR_SRC } from "./components/JudgeAvatar";

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 4) {
  const words = text.split(" "); let line = ""; let n = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines) return y; }
    else line = test;
  }
  ctx.fillText(line, x, y); return y + lh;
}

const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** Renders a screenshot-friendly card. Contains only the verdict, never the raw statements. Colors come from design tokens. */
export async function shareVerdictCard(o: { judgeId: JudgeId; judge: string; v: Verdict; nameA: string; nameB: string; mood: string }) {
  const W = 1080, H = 1350; const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const paper = token("--paper"), card = token("--card"), ink = token("--ink"), muted = token("--muted"), line = token("--line"), burg = token("--burgundy"), gold = token("--gold");
  const display = token("--font-display") || "serif", body = token("--font-body") || "sans-serif";
  try { await document.fonts.load("800 40px Fraunces"); await document.fonts.load("italic 600 40px Fraunces"); await document.fonts.load("700 30px 'DM Sans'"); } catch { /* fall back to system fonts */ }
  x.fillStyle = paper; x.fillRect(0, 0, W, H);
  x.strokeStyle = line; x.lineWidth = 2; x.strokeRect(40, 40, W - 80, H - 80);
  x.textAlign = "center"; x.fillStyle = ink;
  x.font = `800 64px ${display}`; x.fillText("Couple Court", W / 2, 130);
  try { x.drawImage(await loadImg(AVATAR_SRC[o.judgeId]), W / 2 - 60, 170, 120, 120); } catch { /* avatar optional */ }
  x.font = `800 52px ${display}`; x.fillStyle = ink; x.fillText(o.judge, W / 2, 360);
  x.fillStyle = muted; x.font = `400 32px ${body}`; x.fillText(o.mood, W / 2, 408);
  const a = o.v.fault_split!.a, b = o.v.fault_split!.b;
  const bw = 900, bx = 90, by = 450, bh = 56;
  x.save(); x.beginPath(); x.roundRect(bx, by, bw, bh, 14); x.clip();
  x.fillStyle = burg; x.fillRect(bx, by, bw * (a / 100), bh);
  x.fillStyle = ink; x.fillRect(bx + bw * (a / 100), by, bw * (b / 100), bh); x.restore();
  x.fillStyle = ink; x.font = `700 38px ${body}`;
  x.textAlign = "left"; x.fillText(`${o.nameA.slice(0, 14)} ${a}%`, bx, 570);
  x.textAlign = "right"; x.fillText(`${b}% ${o.nameB.slice(0, 14)}`, bx + bw, 570);
  x.textAlign = "center"; x.font = `italic 600 40px ${display}`; x.fillStyle = ink;
  let y = wrap(x, `\u201C${o.v.ruling}\u201D`, W / 2, 670, 880, 56, 6);
  const sy = y + 20, sh = 250;
  x.fillStyle = gold; x.beginPath(); x.roundRect(90, sy, 900, sh, 16); x.fill();
  x.fillStyle = ink; x.font = `700 34px ${body}`;
  let y2 = wrap(x, `${o.nameA}: ${o.v.sentence!.a}`, W / 2, sy + 62, 820, 46, 3);
  wrap(x, `${o.nameB}: ${o.v.sentence!.b}`, W / 2, y2 + 14, 820, 46, 3);
  x.fillStyle = muted; x.font = `400 28px ${body}`; x.fillText("For fun only \u00B7 Couple Court", W / 2, H - 70);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
  const file = new File([blob], "couple-court-verdict.png", { type: "image/png" });
  if ((navigator as any).canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "Couple Court" }); return; } catch { /* fall through */ } }
  const u = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = u; link.download = file.name; link.click(); URL.revokeObjectURL(u);
}
