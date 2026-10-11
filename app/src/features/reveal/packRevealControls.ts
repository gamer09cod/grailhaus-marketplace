import type { RevealState } from "./revealMachine";

/** Whether reset may return the sleeve to a sealed interaction. */
export function canResetReveal(phase: RevealState): boolean {
  return phase === "SEALED" || phase === "DRAGGING" || phase === "TEARING";
}

/** Replay is presentation-only and never rewinds durable server progress. */
export function canReplayReveal(phase: RevealState): boolean {
  return phase === "CARD_REVEALED" || phase === "PACK_COMPLETE";
}

/** Skip jumps presentation toward the result for the current card. */
export function canSkipReveal(phase: RevealState): boolean {
  return (
    phase === "TEARING"
    || phase === "OPEN"
    || phase === "CARD_ENTER"
    || phase === "REVEALING_CARD"
    || phase === "FINAL_REVEAL"
  );
}

export type PresentationCancel = {
  cancelSuspense: () => void;
  cancelFlip: () => void;
  cancelEntrance: () => void;
  finishTear: () => void;
  bumpGeneration: () => void;
};

/** Cancel in-flight presentation tokens without touching server milestones. */
export function cancelPresentation(targets: PresentationCancel): void {
  targets.bumpGeneration();
  targets.cancelSuspense();
  targets.cancelFlip();
  targets.cancelEntrance();
  targets.finishTear();
}
