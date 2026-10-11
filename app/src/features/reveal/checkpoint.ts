export type CheckpointPack = { purchasedPackId: string; revealState: string; cards: readonly { catalogItemId: string; revealOrder: number }[] };
export function contentsIdentity(pack: CheckpointPack): string {
  return JSON.stringify(pack.cards.map((card) => [card.catalogItemId, card.revealOrder]));
}
export function makeCheckpoint(pack: CheckpointPack, cardIndex: number, fast: boolean): string {
  return JSON.stringify({ version: 1, packId: pack.purchasedPackId, contents: contentsIdentity(pack), cardIndex, fast });
}
export function readCheckpoint(raw: string | null, pack: CheckpointPack): { cardIndex: number; fast: boolean } {
  const fallback = { cardIndex: 0, fast: false };
  if (!raw || pack.revealState === "SEALED" || pack.revealState === "PACK_COMPLETE") return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return fallback;
    const data = value as Record<string, unknown>;
    if (data.version !== 1 || data.packId !== pack.purchasedPackId || data.contents !== contentsIdentity(pack)
      || typeof data.cardIndex !== "number" || !Number.isInteger(data.cardIndex) || data.cardIndex < 0 || data.cardIndex >= pack.cards.length || typeof data.fast !== "boolean") return fallback;
    // Later-card checkpoints cannot supersede a server that has not revealed the pack.
    if (data.cardIndex > 0 && pack.revealState !== "CARD_REVEALED") return fallback;
    return { cardIndex: data.cardIndex, fast: data.fast };
  } catch { return fallback; }
}
