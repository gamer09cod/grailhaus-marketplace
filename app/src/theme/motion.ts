import { Easing, type ViewStyle } from "react-native";

export const duration = {
  instant: 0,
  fast: 120,
  base: 200,
  slow: 320,
  emphasis: 480,
} as const;

/**
 * Reveal gesture timings stay owned by `features/reveal/*`.
 * These values document the motion language; do not drive money UI from them.
 */
export const revealMotion = {
  fadeMs: 180,
  sleeveTravelPx: 280,
  springShutMs: 220,
  fastTearMs: 260,
} as const;

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  enter: Easing.out(Easing.cubic),
  exit: Easing.in(Easing.cubic),
} as const;

export const press = {
  scale: 0.98,
  pressedOpacity: 0.88,
} as const;

// Discovery screens may animate state changes. Money screens keep motion minimal so
// numbers never appear to move on their own. Reduced motion removes travel and scale.
export const motionProfile = {
  discovery: { transition: duration.base, pressScale: press.scale, allowTravel: true },
  financial: { transition: duration.fast, pressScale: 1, allowTravel: false },
  reduced: { transition: duration.fast, pressScale: 1, allowTravel: false },
} as const;

export type MotionProfile = keyof typeof motionProfile;

/** Resolve the active profile when the system asks for reduced motion. */
export function activeMotionProfile(profile: MotionProfile, reduced: boolean): MotionProfile {
  return reduced ? "reduced" : profile;
}

/**
 * Press feedback for cards and chips. Discovery scales slightly.
 * Financial and reduced motion keep layout still (surface/opacity only).
 */
export function pressMotionStyle(
  pressed: boolean,
  profile: MotionProfile,
  reduced: boolean,
): ViewStyle | null {
  if (!pressed) {
    return null;
  }
  const active = motionProfile[activeMotionProfile(profile, reduced)];
  if (active.pressScale === 1) {
    return { opacity: press.pressedOpacity };
  }
  return { transform: [{ scale: active.pressScale }] };
}

/** Enter duration for status banners and sheet fades. Never delays checkout. */
export function enterDuration(profile: MotionProfile, reduced: boolean): number {
  return motionProfile[activeMotionProfile(profile, reduced)].transition;
}
