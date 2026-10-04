import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

const storageKey = "grailhaus.haptics";

export type HapticCue = "touch" | "tear" | "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

export async function loadHapticsEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(storageKey);
  return value !== "off";
}

export async function saveHapticsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(storageKey, enabled ? "on" : "off");
}

export function playRarityHaptic(rarity: string, enabled: boolean): void {
  if (
    rarity === "UNCOMMON"
    || rarity === "RARE"
    || rarity === "EPIC"
    || rarity === "LEGENDARY"
  ) {
    playHaptic(rarity, enabled);
    return;
  }
  playHaptic("COMMON", enabled);
}

export function playHaptic(cue: HapticCue, enabled: boolean): void {
  if (!enabled) {
    return;
  }
  void runHaptic(cue);
}

async function runHaptic(cue: HapticCue): Promise<void> {
  try {
    if (cue === "touch") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    if (cue === "tear") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      return;
    }
    if (cue === "COMMON" || cue === "UNCOMMON") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    if (cue === "RARE") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }
    if (cue === "EPIC") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await pause(70);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    await pause(70);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // A desktop browser has no haptic motor. The card still appears.
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
