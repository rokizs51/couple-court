export interface Verdict {
  safety_flag: boolean;
  opening_line?: string;
  fault_split?: { a: number; b: number }; // percent, sums to 100
  notes?: { a: string; b: string };
  ruling?: string;
  sentence?: { a: string; b: string };
  closing_line?: string;
  new_evidence?: boolean;
}

const str = (v: unknown, max = 600) => typeof v === "string" && v.length > 0 && v.length <= max;

/** Returns a cleaned Verdict or null if the model output is invalid. */
export function validateVerdict(input: unknown): Verdict | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, any>;
  if (v.safety_flag === true) return { safety_flag: true }; // never keep any other fields
  if (v.safety_flag !== false) return null;
  const fs = v.fault_split;
  if (!fs || typeof fs.a !== "number" || typeof fs.b !== "number") return null;
  if (fs.a < 0 || fs.b < 0 || Math.round(fs.a + fs.b) !== 100) return null;
  if (!str(v.opening_line) || !str(v.ruling, 900) || !str(v.closing_line)) return null;
  if (!v.notes || !str(v.notes.a) || !str(v.notes.b)) return null;
  if (!v.sentence || !str(v.sentence.a) || !str(v.sentence.b)) return null;
  return {
    safety_flag: false,
    opening_line: v.opening_line, fault_split: { a: Math.round(fs.a), b: Math.round(fs.b) },
    notes: { a: v.notes.a, b: v.notes.b }, ruling: v.ruling,
    sentence: { a: v.sentence.a, b: v.sentence.b }, closing_line: v.closing_line,
    new_evidence: v.new_evidence === true,
  };
}
