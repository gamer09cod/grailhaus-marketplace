import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeCheckpoint, readCheckpoint, type CheckpointPack } from "./checkpoint";

// Globally unique purchased-pack ID scopes a cosmetic hint, never ownership or contents.
const key = (id: string) => `grailhaus.revealCheckpoint.v1:${id}`;
export class CheckpointUnavailable extends Error {
  constructor() { super("Couldn't save opening progress on this device. Try again to continue."); }
}
export async function loadCheckpoint(pack: CheckpointPack) {
  const raw = await AsyncStorage.getItem(key(pack.purchasedPackId)).catch(() => null);
  return readCheckpoint(raw, pack);
}
export async function saveCheckpoint(pack: CheckpointPack, index: number, fast: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(key(pack.purchasedPackId), makeCheckpoint(pack, index, fast));
  } catch { throw new CheckpointUnavailable(); }
}
export async function clearCheckpoint(id: string): Promise<void> {
  await AsyncStorage.removeItem(key(id)).catch(() => undefined);
}
