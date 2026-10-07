import type { ViewStyle } from "react-native";

// On near-black surfaces hierarchy comes mostly from the surface color steps.
// Shadows are a subtle secondary cue.

export const shadows = {
  none: {},
  low: { boxShadow: "0 1px 2px rgba(0, 0, 0, 0.40)" },
  medium: { boxShadow: "0 4px 12px rgba(0, 0, 0, 0.45)" },
  high: { boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)" },
} as const satisfies Record<string, ViewStyle>;

/** Soft colored halo for live drops and rare reveals. Not for buttons or financial screens. */
export function glow(color: string, blurPx = 18): ViewStyle {
  return { boxShadow: `0 0 ${blurPx}px ${color}` };
}

export type ShadowKey = keyof typeof shadows;
