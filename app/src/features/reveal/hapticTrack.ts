export type MotorCue = "light" | "medium" | "heavy" | "rigid" | "success";
export type TrackCue = "touch" | "transition" | "anticipation" | "tear" | "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

export function hapticPattern(cue: TrackCue): readonly MotorCue[] {
  switch (cue) {
    case "anticipation": case "RARE": return ["medium"];
    case "tear": case "EPIC": return ["heavy"];
    case "LEGENDARY": return ["heavy", "rigid", "success"];
    default: return ["light"];
  }
}

export function suspenseHapticStage(progress: number, rarity: string): number {
  "worklet";
  if (progress < 0.45) return 0;
  const highRarity = rarity === "RARE" || rarity === "EPIC" || rarity === "LEGENDARY";
  return progress >= 0.85 && highRarity ? 2 : 1;
}

/** Recheck authorization before every motor call, including delayed follow-ups. */
export async function runHapticTrack(
  cue: TrackCue,
  isActive: () => boolean,
  emit: (cue: MotorCue) => Promise<void>,
  wait: (ms: number) => Promise<void>,
): Promise<void> {
  try {
    const pattern = hapticPattern(cue);
    let first = true;
    for (const motorCue of pattern) {
      if (!first) await wait(70);
      if (!isActive()) return;
      await emit(motorCue);
      first = false;
    }
  } catch {
    // Unsupported or interrupted native feedback must never block reveal progress.
  }
}
