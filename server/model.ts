import type { CallModel } from "../shared/prompt";

/** Real model. Key is read from server env only. Errors never include response bodies. */
export function anthropicModel(apiKey: string, model: string): CallModel {
  return async (system, user) => {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 2500, thinking: { type: "disabled" }, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) throw new Error("model_http_" + r.status);
    const j: any = await r.json();
    // Newer models may return a thinking block first: take the text block, not content[0].
    return (j?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("") ?? "";
  };
}

function h(s: string) { let x = 2166136261; for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; }
const grab = (u: string, tag: string) => (u.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "").slice(0, 60);

/** Deterministic canned judge for tests and local dev. Costs nothing. */
export const mockModel: CallModel = async (system, user) => {
  const id = system.includes("Bahasa Indonesia");
  const a = grab(user, "statement_a"), b = grab(user, "statement_b");
  const fa = 20 + (h(user) % 61);
  return JSON.stringify({
    safety_flag: false,
    opening_line: id ? "Sidang dimulai! Duduk, kalian berdua." : "Order in the court! Sit down, both of you.",
    fault_split: { a: fa, b: 100 - fa },
    notes: {
      a: id ? `Soal "${a}": argumen yang... berani.` : `On "${a}": a bold argument.`,
      b: id ? `Soal "${b}": lumayan, tapi nggak cukup.` : `On "${b}": decent, but not enough.`,
    },
    ruling: id ? "Pengadilan memutuskan kalian berdua sama-sama keras kepala." : "The court finds you both equally stubborn.",
    sentence: {
      a: id ? "Traktir es krim." : "Buy the ice cream.",
      b: id ? "Cuci piring seminggu." : "Dishes for a week.",
    },
    closing_line: id ? "Sidang ditutup." : "Court adjourned.",
    new_evidence: h(user) % 2 === 0,
  });
};
