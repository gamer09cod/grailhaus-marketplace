export type RevealSoundCue = "friction" | "tear" | "rise" | "rotation" | "build" | "impact";

export function revealSoundVolume(cue: RevealSoundCue, rarity: string): number {
  if (cue === "friction") return 0.12;
  if (cue === "tear") return 0.45;
  if (cue === "rise" || cue === "rotation") return 0.2;
  if (cue === "build") return rarity === "LEGENDARY" ? 0.28 : 0.18;
  return rarity === "LEGENDARY" ? 0.55 : rarity === "EPIC" ? 0.45 : rarity === "RARE" ? 0.35 : 0.22;
}

/** One playback authority; stale asynchronous seeks never start an older cue. */
export class RevealAudioGate {
  private generation = 0;
  private active = false;
  private enabled = false;
  private seen = new Set<string>();
  configure(active: boolean, enabled: boolean): void {
    this.active = active;
    this.enabled = enabled;
    this.generation += 1;
  }
  request(eventKey: string): number | null {
    if (!this.active || !this.enabled || this.seen.has(eventKey)) return null;
    this.seen.add(eventKey);
    // Bound memory for long opening sessions without storing user/collectible data.
    if (this.seen.size > 64) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return ++this.generation;
  }
  accepts(token: number): boolean { return this.active && this.enabled && token === this.generation; }
  stop(): void { this.generation += 1; }
}
