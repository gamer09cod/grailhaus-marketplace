import { colors } from "../../theme/colors";

export type SuspensePalette = { stops: readonly [string, string, string, string, string]; intensity: number };

const neutral = colors.rarity.COMMON.solid;
const blue = colors.rarity.RARE.solid;
const purple = colors.rarity.EPIC.solid;
const gold = colors.premium.gold;

/** The known server rarity selects presentation only. First 45% is identical. */
export function suspensePalette(rarity: string): SuspensePalette {
  switch (rarity) {
    case "LEGENDARY":
      return { stops: [neutral, neutral, blue, purple, gold], intensity: 0.2 };
    case "EPIC":
      return { stops: [neutral, neutral, blue, purple, purple], intensity: 0.15 };
    case "RARE":
      return { stops: [neutral, neutral, blue, blue, blue], intensity: 0.1 };
    case "UNCOMMON":
      return { stops: [neutral, neutral, neutral, neutral, colors.rarity.UNCOMMON.solid], intensity: 0.05 };
    default:
      return { stops: [neutral, neutral, neutral, neutral, neutral], intensity: 0.04 };
  }
}

export const suspenseStops = [0, 0.45, 0.65, 0.85, 1];
