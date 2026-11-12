import type { JudgePick } from "../../shared/judges";
import grandma from "../assets/judges/grandma.svg";
import savage from "../assets/judges/savage.svg";
import shakespeare from "../assets/judges/shakespeare.svg";
import bestie from "../assets/judges/bestie.svg";
import zen from "../assets/judges/zen.svg";
import surprise from "../assets/judges/surprise.svg";

const SRC: Record<JudgePick, string> = { grandma, savage, shakespeare, bestie, zen, surprise };

/** Renders the designed judge SVG (64x64, pre-clipped to a circle). Decorative: the name is always shown beside it. */
export function JudgeAvatar({ judge, size = 64 }: { judge: JudgePick; size?: number }) {
  return <img src={SRC[judge]} width={size} height={size} alt="" aria-hidden="true" style={{ display: "block", flex: "none" }} />;
}
