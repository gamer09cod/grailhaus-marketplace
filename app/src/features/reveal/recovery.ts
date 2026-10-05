export type RecoveryCursor = number | "summary";

/** Index of the first pack that is not complete. A finished multi-pack session is the summary. */
export function recoveryCursor(states: readonly string[]): RecoveryCursor {
  const index = states.findIndex((state) => state !== "PACK_COMPLETE");
  if (index === -1) {
    return states.length > 1 ? "summary" : 0;
  }
  return index;
}

/** The tear is stored once the server has moved past sealed. Show that card instead of tearing again. */
export function recoveryShowsCard(state: string): boolean {
  return state === "OPEN" || state === "REVEALING_CARD" || state === "CARD_REVEALED" || state === "PACK_COMPLETE";
}

/**
 * A finger that has not committed OPEN is not progress. Backgrounding drops it.
 * A tear that already called the server keeps going.
 */
export function backgroundDuringTear(phase: string): "reset" | "keep" {
  if (phase === "SEALED" || phase === "DRAGGING") {
    return "reset";
  }
  return "keep";
}
