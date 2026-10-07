import type { PackCategory } from "../navigation/types";

// Status, category, and rarity colors are cues, never the only signal.
// Pair every one of them with an icon or a text label.

const palette = {
  ink950: "#08090C",
  ink900: "#111318",
  ink850: "#171A21",
  ink800: "#1E222B",
  ink750: "#252A34",
  ink700: "#2E3440",
  white: "#FFFFFF",
  fog100: "#F2F4F8",
  fog400: "#A3A9B6",
  fog500: "#7A8190",
  fog700: "#4B5160",
  cobalt300: "#6B88FF",
  cobalt400: "#4C6FFF",
  cobalt500: "#3A58EE",
  cobalt600: "#2F4AD6",
  violet400: "#A78BFA",
  sky400: "#4FC3E8",
  champagne300: "#E2C48D",
  green400: "#3DD68C",
  amber400: "#F5B544",
  red400: "#F26D6D",
  blue300: "#7FA8FF",
} as const;

export type Tone = {
  /** Text, icons, and thin borders on dark surfaces. */
  solid: string;
  /** Tinted background behind a badge or an inline status card. */
  muted: string;
  /** Border for a muted container. */
  border: string;
};

function tone(solid: string, rgb: string): Tone {
  return {
    solid,
    muted: `rgba(${rgb}, 0.12)`,
    border: `rgba(${rgb}, 0.32)`,
  };
}

export const colors = {
  backgroundPrimary: palette.ink950,
  backgroundSecondary: palette.ink900,
  surfacePrimary: palette.ink850,
  surfaceSecondary: palette.ink800,
  surfaceElevated: palette.ink750,
  surfacePressed: palette.ink700,
  surfaceDisabled: "#1A1D24",

  borderSubtle: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.14)",
  borderFocus: palette.cobalt300,

  textPrimary: palette.fog100,
  textSecondary: palette.fog400,
  /** Meta text. 4.5:1 on backgrounds and cards, about 3.7:1 on elevated surfaces, so keep it off those. */
  textTertiary: palette.fog500,
  textDisabled: palette.fog700,
  textOnAccent: palette.white,

  accent: {
    /** Brand cobalt. Too dark for text on cards, so use it for tints and borders. */
    brand: palette.cobalt400,
    /** Links, icons, and selected text. At least 4.5:1 on every surface. */
    solid: palette.cobalt300,
    /** Filled buttons. White text on this is 5.5:1. */
    fill: palette.cobalt500,
    fillPressed: palette.cobalt600,
    muted: "rgba(76, 111, 255, 0.14)",
    border: "rgba(76, 111, 255, 0.40)",
  },

  category: {
    TRADING_CARD: tone(palette.violet400, "167, 139, 250"),
    SNEAKER: tone(palette.sky400, "79, 195, 232"),
    WATCH: tone(palette.champagne300, "226, 196, 141"),
  } satisfies Record<PackCategory, Tone>,

  rarity: {
    COMMON: tone("#9AA1AE", "154, 161, 174"),
    UNCOMMON: tone("#B7C4D6", "183, 196, 214"),
    RARE: tone("#8FA8FF", "143, 168, 255"),
    EPIC: tone("#C49BFF", "196, 155, 255"),
    LEGENDARY: tone("#F0C674", "240, 198, 116"),
  },

  status: {
    success: tone(palette.green400, "61, 214, 140"),
    warning: tone(palette.amber400, "245, 181, 68"),
    error: tone(palette.red400, "242, 109, 109"),
    info: tone(palette.blue300, "127, 168, 255"),
  },

  overlay: {
    /** Behind bottom sheets and modals. */
    scrim: "rgba(4, 5, 7, 0.72)",
    /** Bottom fade on hero imagery so overlay text stays readable. */
    heroFade: "rgba(8, 9, 12, 0.85)",
  },
} as const;

export type Colors = typeof colors;
export type RarityKey = keyof typeof colors.rarity;
export type StatusKey = keyof typeof colors.status;
