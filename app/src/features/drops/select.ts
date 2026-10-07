import type { TimedDrop } from "./board";

/** Live drops first, then the next upcoming one. Ended and sold-out drops stay off the hero. */
export function pickHeroDrop(drops: readonly TimedDrop[]): TimedDrop | null {
  const live = drops.find((drop) => drop.status === "LIVE");
  if (live) {
    return live;
  }
  return drops.find((drop) => drop.status === "UPCOMING") ?? null;
}

export function otherActiveDrops(drops: readonly TimedDrop[], heroId: string | null): TimedDrop[] {
  return drops.filter(
    (drop) => drop.dropId !== heroId && (drop.status === "LIVE" || drop.status === "UPCOMING"),
  );
}
