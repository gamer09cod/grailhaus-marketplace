import { colors } from "../../theme/colors";

export function revealFx(rarity: string) {
  switch (rarity) {
    case "UNCOMMON":
      return { color: colors.rarity.UNCOMMON.solid, glow: 0.18, particles: 0, radial: false, darkening: 0, anticipationMs: 0, pauseMs: 150 };
    case "RARE":
      return { color: colors.rarity.RARE.solid, glow: 0.36, particles: 6, radial: false, darkening: 0, anticipationMs: 0, pauseMs: 160 };
    case "EPIC":
      return { color: colors.rarity.EPIC.solid, glow: 0.52, particles: 4, radial: true, darkening: 0.12, anticipationMs: 40, pauseMs: 250 };
    case "LEGENDARY":
      return { color: colors.premium.gold, glow: 0.72, particles: 10, radial: true, darkening: 0.4, anticipationMs: 120, pauseMs: 180 };
    default:
      return { color: colors.rarity.COMMON.solid, glow: 0.11, particles: 0, radial: false, darkening: 0, anticipationMs: 0, pauseMs: 150 };
  }
}

export function revealFxEnvelope(elapsedMs: number) {
  "worklet";
  // Impact begins when the front is face-on, then decays without flashing.
  return Math.max(0, Math.min(1, (elapsedMs - 350) / 50)) * Math.max(0, 1 - Math.max(0, elapsedMs - 400) / 350);
}
