import type { JudgePick } from "../shared/judges";

/** Judge accent color, read from the design tokens (src/styles/tokens.css). */
export function judgeColor(id: JudgePick): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--judge-${id}`).trim();
}

export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
