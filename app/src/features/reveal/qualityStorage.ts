import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RevealQuality } from "./quality";

const storageKey = "grailhaus.revealQuality";

const allowed: readonly RevealQuality[] = ["high", "balanced", "reduced"];

export async function loadRevealQualityPreference(): Promise<RevealQuality | null> {
  const value = await AsyncStorage.getItem(storageKey);
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as RevealQuality;
  }
  return null;
}

export async function saveRevealQualityPreference(quality: RevealQuality): Promise<void> {
  await AsyncStorage.setItem(storageKey, quality);
}
