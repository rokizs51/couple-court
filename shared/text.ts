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
  // physical violence aimed at a person (not "hit the snooze button")
  /\b(hit|hits|hitting|punch(ed|es)?|slap(ped|s)?|kick(ed|s)?|chok(e|es|ed|ing)|strangl\w*|beat(s|ing)? (me|her|him|them) up|beaten up)\b.{0,12}\b(me|my (face|head|arm))\b/i,
  /\b(he|she|they|partner)\b.{0,15}\b(hits?|punch(es|ed)?|slaps?|chok(es|ed)|strangl\w*)\b.{0,6}\b(me|her|him|them)\b/i,
  // threats and stalking
  /\b(threat(en|ens|ened|ening)|kill (me|her|him|them|myself)|hurt (me|myself)|hurts me|stalk(s|ed|ing)?\b)/i,
  /\b(abus(e|ed|es|ive)) (me|by (him|her|them|my (partner|boyfriend|girlfriend|husband|wife)))\b/i,
  // fear of the PARTNER (not of cockroaches or driving)
  /\b(scared|afraid|terrified|frightened)\b.{0,12}\b(of|about)\b.{0,12}\b(him|her|them|my (partner|boyfriend|girlfriend|husband|wife)|how (he|she|they) react)/i,
  // Bahasa Indonesia
  /\b(meng?ancam|diancam|ancaman|dipukul|memukul(ku)?|ditampar|menampar|dicekik|mencekik|kekerasan|menguntit|dikuntit)\b/i,
  /\btakut\b.{0,12}\b(sama|pada|dengan)\b.{0,8}\b(dia|pacar|suami|istri|pasangan)/i,
];
export function safetyPrefilter(...texts: string[]): boolean {
  return texts.some((t) => SAFETY_PATTERNS.some((re) => re.test(t)));
}
