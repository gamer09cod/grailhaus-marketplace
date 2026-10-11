/** Presentation only. Durable progress remains owned by reveal_progress in Postgres. */
export type RevealState = "SEALED" | "DRAGGING" | "TEARING" | "OPEN" | "CARD_ENTER" | "REVEALING_CARD" | "FINAL_REVEAL" | "CARD_REVEALED" | "PACK_COMPLETE";
export type RevealEvent =
  | { type: "BEGIN_TEAR" }
  | { type: "RESET_TEAR" }
  | { type: "COMMIT_TEAR" }
  | { type: "PACK_OPENED" }
  | { type: "BEGIN_CARD_ENTER" }
  | { type: "BEGIN_SUSPENSE" }
  | { type: "BEGIN_FINAL_REVEAL" }
  | { type: "COMPLETE_REVEAL" }
  | { type: "COMPLETE_PACK" }
  | { type: "NEXT_CARD" }
  | { type: "ENTER_PACK" }
  | { type: "RECOVER"; state: RevealState };

type StatePolicy = {
  inputs: readonly string[];
  animation: string;
  haptic: "none" | "touch" | "tear" | "rarity";
  sound: "none" | "friction" | "tear" | "rise" | "suspense" | "impact";
  next: RevealState | null;
};

// Cue labels describe the event-driven audio track; no state owns a looping player.
export const revealPolicies: Record<RevealState, StatePolicy> = {
  SEALED: { inputs: ["BEGIN_TEAR", "COMMIT_TEAR"], animation: "sealed", haptic: "none", sound: "none", next: "DRAGGING" },
  DRAGGING: { inputs: ["RESET_TEAR", "COMMIT_TEAR"], animation: "finger tracking", haptic: "touch", sound: "friction", next: "TEARING" },
  TEARING: { inputs: [], animation: "tear payoff", haptic: "tear", sound: "tear", next: "OPEN" },
  OPEN: { inputs: [], animation: "open pack", haptic: "none", sound: "none", next: "CARD_ENTER" },
  CARD_ENTER: { inputs: [], animation: "card stack emergence", haptic: "none", sound: "rise", next: "REVEALING_CARD" },
  REVEALING_CARD: { inputs: ["SPEED_UP"], animation: "suspense", haptic: "none", sound: "suspense", next: "FINAL_REVEAL" },
  FINAL_REVEAL: { inputs: [], animation: "protected final flip and face pause", haptic: "rarity", sound: "impact", next: "CARD_REVEALED" },
  CARD_REVEALED: { inputs: ["NEXT_CARD", "COMPLETE_PACK"], animation: "result", haptic: "none", sound: "none", next: "PACK_COMPLETE" },
  PACK_COMPLETE: { inputs: ["ENTER_PACK"], animation: "completed result", haptic: "none", sound: "none", next: null },
};

export function revealTransition(state: RevealState, event: RevealEvent): RevealState {
  switch (event.type) {
    // Only server read/reconciliation paths may use RECOVER.
    case "RECOVER": return event.state;
    case "ENTER_PACK": return state === "PACK_COMPLETE" ? "SEALED" : state;
    case "BEGIN_TEAR": return state === "SEALED" ? "DRAGGING" : state;
    case "RESET_TEAR": return state === "SEALED" || state === "DRAGGING" || state === "TEARING" ? "SEALED" : state;
    case "COMMIT_TEAR": return state === "SEALED" || state === "DRAGGING" ? "TEARING" : state;
    case "PACK_OPENED": return state === "TEARING" ? "OPEN" : state;
    case "BEGIN_CARD_ENTER": return state === "OPEN" ? "CARD_ENTER" : state;
    case "BEGIN_SUSPENSE": return state === "CARD_ENTER" ? "REVEALING_CARD" : state;
    case "BEGIN_FINAL_REVEAL": return state === "REVEALING_CARD" ? "FINAL_REVEAL" : state;
    case "COMPLETE_REVEAL": return state === "FINAL_REVEAL" ? "CARD_REVEALED" : state;
    case "COMPLETE_PACK": return state === "CARD_REVEALED" ? "PACK_COMPLETE" : state;
    case "NEXT_CARD": return state === "CARD_REVEALED" ? "CARD_ENTER" : state;
  }
}
