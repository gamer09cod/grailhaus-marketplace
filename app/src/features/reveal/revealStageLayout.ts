import { revealCardFrame } from "../../theme";

/** Matches PackArtwork outer stage height. */
export const PACK_STAGE_HEIGHT = 312;

export type RevealStageLayout = {
  /** Distance below stage center where the sealed pack rests (px). */
  packRestFromCenter: number;
  /** Extra downward travel when the pack exits after tear (px). */
  packExitTravel: number;
  /** Card entrance start translateY — pack rest relative to center (px). */
  cardRiseStart: number;
  /** Starting scale at pack mouth (depth cue). */
  cardLaunchScale: number;
};

/**
 * Shared pack/card vertical geometry so tear exit and card rise stay aligned.
 * `windowHeight` is the full screen; usable stage is estimated after chrome.
 */
export function revealStageLayout(windowHeight: number): RevealStageLayout {
  const stageHeight = Math.max(360, Math.round(windowHeight * 0.52));
  const bottomInset = 20;
  const packCenterFromBottom = PACK_STAGE_HEIGHT / 2 + bottomInset;
  const stageCenterFromBottom = stageHeight / 2;
  const packRestFromCenter = Math.max(
    130,
    Math.min(220, Math.round(stageCenterFromBottom - packCenterFromBottom)),
  );
  return {
    packRestFromCenter,
    packExitTravel: Math.round(packRestFromCenter * 0.75 + 110),
    cardRiseStart: packRestFromCenter,
    cardLaunchScale: 0.78,
  };
}

/** Card frame used when estimating vertical centering against the pack sleeve. */
export const STAGE_CARD_HEIGHT = revealCardFrame.height;
