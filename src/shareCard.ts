import type { Verdict } from "../shared/verdict";

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 4) {
  const words = text.split(" "); let line = ""; let n = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines) return y; }
    else line = test;
  }
  ctx.fillText(line, x, y); return y + lh;
}

/** Renders a screenshot-friendly card. Contains only the verdict, never the raw statements. */
export async function shareVerdictCard(o: { judge: string; emoji: string; color: string; v: Verdict; nameA: string; nameB: string; mood: string }) {
  const W = 1080, H = 1350; const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = "#1b1226"; x.fillRect(0, 0, W, H);
  x.fillStyle = o.color; x.fillRect(0, 0, W, 16);
  x.textAlign = "center"; x.fillStyle = "#fff";
  x.font = "bold 64px sans-serif"; x.fillText("⚖️ Couple Court", W / 2, 120);
  x.font = "120px sans-serif"; x.fillText(o.emoji, W / 2, 270);
  x.font = "bold 52px sans-serif"; x.fillStyle = o.color; x.fillText(o.judge, W / 2, 340);
  x.fillStyle = "#cbbfe0"; x.font = "34px sans-serif"; x.fillText(o.mood, W / 2, 390);
  const a = o.v.fault_split!.a, b = o.v.fault_split!.b;
  x.fillStyle = "#3a2c52"; x.fillRect(90, 450, 900, 54);
  x.fillStyle = o.color; x.fillRect(90, 450, 900 * (a / 100), 54);
  x.fillStyle = "#fff"; x.font = "bold 40px sans-serif";
  x.textAlign = "left"; x.fillText(`${o.nameA.slice(0, 14)} ${a}%`, 90, 560);
  x.textAlign = "right"; x.fillText(`${b}% ${o.nameB.slice(0, 14)}`, 990, 560);
  x.textAlign = "center"; x.font = "italic 40px serif"; x.fillStyle = "#fff";
  let y = wrap(x, `“${o.v.ruling}”`, W / 2, 660, 880, 56, 6);
  x.font = "34px sans-serif"; x.fillStyle = "#ffd77a";
  y = wrap(x, `🔨 ${o.nameA}: ${o.v.sentence!.a}`, W / 2, y + 40, 880, 46, 3);
  y = wrap(x, `🔨 ${o.nameB}: ${o.v.sentence!.b}`, W / 2, y + 10, 880, 46, 3);
  x.fillStyle = "#8a7aa6"; x.font = "28px sans-serif"; x.fillText("For fun only · Couple Court", W / 2, H - 50);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
  const file = new File([blob], "couple-court-verdict.png", { type: "image/png" });
  if ((navigator as any).canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "Couple Court" }); return; } catch { /* fall through */ } }
  const u = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = u; link.download = file.name; link.click(); URL.revokeObjectURL(u);
}
