import { useCallback } from "react";
import type { ViewStyle } from "react-native";

import { pressMotionStyle, type MotionProfile } from "./motion";
import { useReducedMotion } from "./useReducedMotion";

/** Press style callback for discovery cards and chips. Financial screens pass `"financial"`. */
export function usePressMotion(profile: MotionProfile = "discovery") {
  const reduced = useReducedMotion();
  return useCallback(
    (pressed: boolean): ViewStyle | null => pressMotionStyle(pressed, profile, reduced),
    [profile, reduced],
  );
}
