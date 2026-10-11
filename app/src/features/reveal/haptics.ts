import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import { runHapticTrack, type TrackCue, type MotorCue } from "./hapticTrack";

const storageKey = "grailhaus.haptics";

export type HapticCue = TrackCue;

export async function loadHapticsEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(storageKey);
  return value !== "off";
}

export async function saveHapticsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(storageKey, enabled ? "on" : "off");
}

export function playRarityHaptic(rarity: string, enabled: boolean, isActive: () => boolean = () => true): void {
  if (
    rarity === "UNCOMMON"
    || rarity === "RARE"
    || rarity === "EPIC"
    || rarity === "LEGENDARY"
  ) {
    playHaptic(rarity, enabled, isActive);
    return;
  }
  playHaptic("COMMON", enabled, isActive);
}

export function playHaptic(cue: HapticCue, enabled: boolean, isActive: () => boolean = () => true): void {
  if (!enabled || !isActive()) {
    return;
  }
  void runHaptic(cue, isActive);
}

async function runHaptic(cue: HapticCue, isActive: () => boolean): Promise<void> {
  await runHapticTrack(cue, isActive, emitMotorCue, (ms) => new Promise((resolve) => setTimeout(resolve, ms)));
}

async function emitMotorCue(cue: MotorCue): Promise<void> {
  if (cue === "success") {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return;
  }
  const styles = {
    light: Haptics.ImpactFeedbackStyle.Light,
    medium: Haptics.ImpactFeedbackStyle.Medium,
    heavy: Haptics.ImpactFeedbackStyle.Heavy,
    rigid: Haptics.ImpactFeedbackStyle.Rigid,
  };
  await Haptics.impactAsync(styles[cue]);
}
