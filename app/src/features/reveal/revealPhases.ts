/**
 * Cinematic pack-open phases. Presentation only — durable progress stays on
 * `reveal_state` / Postgres. Card identity always comes from stored pack_contents.
 */
import type { RevealState } from "./revealMachine";

export type RevealPhaseId =
  | "preparation"
  | "idle_pack"
  | "open_instruction"
  | "swipe_to_slice"
  | "slice_validation"
  | "seal_breaking"
  | "pack_tear"
  | "internal_light"
  | "sparks_particles"
  | "impact_shake"
  | "burst_flash"
  | "pack_disappearance"
  | "starfield_transition"
  | "card_launch"
  | "flying_cards"
  | "card_shuffle"
  | "winning_card_selection"
  | "card_approach"
  | "card_back_presentation"
  | "card_flip"
  | "holographic_foil"
  | "rarity_reveal"
  | "rarity_glow_pulse"
  | "final_card_settlement"
  | "result_information"
  | "action_buttons"
  | "completed_state"
  | "replay_reset"
  | "skip_reveal"
  | "error_fallback";

export type PhaseBand =
  | "boot"
  | "sealed"
  | "tear"
  | "emergence"
  | "suspense"
  | "flip"
  | "result"
  | "done"
  | "fallback";

/** Active cinematic band for the durable machine state. */
export function phaseBand(state: RevealState, opts?: { reduced?: boolean; skipping?: boolean; error?: boolean }): PhaseBand {
  if (opts?.error) return "fallback";
  if (opts?.reduced || opts?.skipping) {
    if (state === "SEALED" || state === "DRAGGING") return "sealed";
    if (state === "CARD_REVEALED" || state === "PACK_COMPLETE") return "result";
    return "fallback";
  }
  switch (state) {
    case "SEALED":
      return "sealed";
    case "DRAGGING":
      return "sealed";
    case "TEARING":
      return "tear";
    case "OPEN":
      return "tear";
    case "CARD_ENTER":
      return "emergence";
    case "REVEALING_CARD":
      return "suspense";
    case "FINAL_REVEAL":
      return "flip";
    case "CARD_REVEALED":
      return "result";
    case "PACK_COMPLETE":
      return "done";
  }
}

/** Starfield / ambient intensity 0–1 for the current band. */
export function starfieldIntensity(band: PhaseBand): number {
  switch (band) {
    case "boot":
      return 0.35;
    case "sealed":
      return 0.45;
    case "tear":
      return 0.85;
    case "emergence":
      return 1;
    case "suspense":
      return 0.7;
    case "flip":
      return 0.55;
    case "result":
    case "done":
      return 0.4;
    case "fallback":
      return 0.25;
  }
}

/** Instruction line for the active machine state. */
export function phaseInstruction(
  state: RevealState,
  opts: { reduced: boolean; skipping: boolean },
): string {
  if (opts.skipping && state === "REVEALING_CARD") {
    return "Skipping to your card.";
  }
  if (opts.reduced) {
    switch (state) {
      case "SEALED":
        return "Reveal next card.";
      case "TEARING":
      case "OPEN":
      case "CARD_ENTER":
      case "REVEALING_CARD":
      case "FINAL_REVEAL":
        return "Opening your card.";
      case "CARD_REVEALED":
      case "PACK_COMPLETE":
        return "Revealed.";
      default:
        return "Reveal next card.";
    }
  }
  switch (state) {
    case "SEALED":
      return "Swipe to open";
    case "DRAGGING":
      return "Keep sliding across the seal";
    case "TEARING":
      return "Seal breaking";
    case "OPEN":
      return "Pack opening";
    case "CARD_ENTER":
      return "Cards launching";
    case "REVEALING_CARD":
      return "Hold on";
    case "FINAL_REVEAL":
      return "Revealing";
    case "CARD_REVEALED":
      return "Your pull";
    case "PACK_COMPLETE":
      return "Added to your collection";
  }
}

/** Phases exercised during a full (non-reduced) open — for docs / QA. */
export const FULL_REVEAL_PHASE_ORDER: RevealPhaseId[] = [
  "preparation",
  "idle_pack",
  "open_instruction",
  "swipe_to_slice",
  "slice_validation",
  "seal_breaking",
  "pack_tear",
  "internal_light",
  "sparks_particles",
  "impact_shake",
  "burst_flash",
  "pack_disappearance",
  "starfield_transition",
  "card_launch",
  "flying_cards",
  "card_shuffle",
  "winning_card_selection",
  "card_approach",
  "card_back_presentation",
  "card_flip",
  "holographic_foil",
  "rarity_reveal",
  "rarity_glow_pulse",
  "final_card_settlement",
  "result_information",
  "action_buttons",
  "completed_state",
];
