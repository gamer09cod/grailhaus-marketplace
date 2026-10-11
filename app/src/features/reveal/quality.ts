/** Visual quality caps for the reveal rebuild. Presentation only. */

export type RevealQuality = "high" | "balanced" | "reduced";

export type QualityCaps = {
  quality: RevealQuality;
  /** Max decorative particles / sparks in Skia effects. */
  particles: number;
  /** Holographic foil samples / intensity 0–1. */
  foil: number;
  /** Pack idle float while sealed. */
  idleFloat: boolean;
  /** Dense starfield draw count. */
  stars: number;
  /** Soft burst flash / halo. */
  burst: boolean;
};

const caps: Record<RevealQuality, QualityCaps> = {
  high: { quality: "high", particles: 48, foil: 1, idleFloat: true, stars: 64, burst: true },
  balanced: { quality: "balanced", particles: 24, foil: 0.7, idleFloat: true, stars: 40, burst: true },
  reduced: { quality: "reduced", particles: 0, foil: 0, idleFloat: false, stars: 12, burst: false },
};

/**
 * Resolve quality. Reduced-motion always forces `reduced`.
 * Explicit preference is used otherwise; default is `balanced`.
 */
export function resolveRevealQuality(opts: {
  reducedMotion: boolean;
  preference?: RevealQuality | null;
}): RevealQuality {
  if (opts.reducedMotion) return "reduced";
  return opts.preference ?? "balanced";
}

export function qualityCaps(quality: RevealQuality): QualityCaps {
  return caps[quality];
}
