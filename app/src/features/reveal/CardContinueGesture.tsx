import { useMemo, type ReactNode } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";

export function CardContinueGesture({ enabled, onContinue, children }: { enabled: boolean; onContinue: () => void; children: ReactNode }) {
  const swipe = useMemo(() => Gesture.Pan().enabled(enabled).maxPointers(1).activeOffsetX([-24, 24]).failOffsetY([-30, 30]).onEnd((event) => {
    if (Math.abs(event.translationX) >= 60) scheduleOnRN(onContinue);
  }), [enabled, onContinue]);
  return <GestureDetector gesture={swipe}>{children}</GestureDetector>;
}
