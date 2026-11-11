import type { JudgeId } from "../shared/judges";
export const STYLE: Record<JudgeId | "surprise", { emoji: string; color: string }> = {
  grandma: { emoji: "👵", color: "#f4a6c0" },
  savage: { emoji: "😈", color: "#ff5c5c" },
  shakespeare: { emoji: "🎭", color: "#c9a227" },
  bestie: { emoji: "💅", color: "#b983ff" },
  zen: { emoji: "🧘", color: "#6fd3b0" },
  surprise: { emoji: "🎲", color: "#8ab4ff" },
};
