export const MAX_STATEMENT = 500;

export function cleanStatement(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "") // control + bidi chars
    .replace(/<\/?\s*(statement|system|assistant|user|case)[^>]*>/gi, "") // strip our delimiter tags
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_STATEMENT);
}

// Unambiguous alphabet: no I, O, 0, 1, L
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789".replace("L", "");
export function generateRoomCode(rng: () => number = Math.random, len = 4): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return s;
}
export const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

/** Layer 1 safety: cheap keyword pre-filter. The model flag is layer 2. */
const SAFETY_PATTERNS: RegExp[] = [
  /\b(scared|afraid|terrified|fear)\b.{0,30}\b(him|her|them|partner|react|home|him\/her)\b/i,
  /\b(hit|hits|hitting|punch(ed)?|slap(ped)?|choke[sd]?|beat(s|ing)?|abus(e|es|ed|ive))\b/i,
  /\b(threat(en|ens|ened|s)?|kill|hurt me|hurts me|stalk(s|ed|ing)?)\b/i,
  /\b(won'?t let me|not allowed to|controls? (my|who|what)|checks? my phone|take[sn]? my (phone|money|keys))\b/i,
  /\b(takut|diancam|ancam|dipukul|memukul|kekerasan|menguntit)\b/i,
];
export function safetyPrefilter(...texts: string[]): boolean {
  return texts.some((t) => SAFETY_PATTERNS.some((re) => re.test(t)));
}
