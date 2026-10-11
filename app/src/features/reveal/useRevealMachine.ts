import { useCallback, useRef, useState } from "react";
import { revealTransition, type RevealEvent, type RevealState } from "./revealMachine";

/** Ref changes synchronously, so two touch callbacks cannot claim the same transition. */
export function useRevealMachine() {
  const [phase, setPhase] = useState<RevealState>("SEALED");
  const phaseRef = useRef<RevealState>("SEALED");
  const send = useCallback((event: RevealEvent) => {
    const next = revealTransition(phaseRef.current, event);
    if (next !== phaseRef.current) {
      phaseRef.current = next;
      setPhase(next);
    }
  }, []);
  return { phase, phaseRef, send };
}
