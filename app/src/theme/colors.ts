import type { PackCategory } from "../navigation/types";

// Status, category, and rarity colors are cues, never the only signal.
// Pair every one of them with an icon or a text label.

const palette = {
  ink950: "#090A0D",
  ink900: "#0E1015",
  ink850: "#15171D",
  ink800: "#1B1E26",
  ink750: "#22252E",
  ink700: "#2A2E38",
  white: "#FFFFFF",
  fog50: "#F5F5F7",
  fog400: "#A6A8B3",
  fog500: "#777B89",
  fog700: "#565966",
  lavender400: "#8B80FF",
  lavender300: "#B7AEFF",
  lavender500: "#7468F0",
  lavender600: "#5F54D6",
  champagne: "#B89A62",
  softGold: "#D9BD85",
  teal400: "#64D8C4",
  rose400: "#F06B76",
  rose500: "#D85A64",
  amber400: "#F5B544",
  sky400: "#4FC3E8",
  violet400: "#A78BFA",
  blue300: "#9BB0FF",
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

  borderSubtle: "#292C35",
  borderStrong: "#343744",
  borderFocus: palette.lavender300,

  textPrimary: palette.fog50,
  textSecondary: palette.fog400,
  /** Meta text. Prefer backgrounds and primary surfaces; keep off elevated fills when possible. */
  textTertiary: palette.fog500,
  textDisabled: palette.fog700,
  textOnAccent: palette.white,

  accent: {
    /** Brand lavender for interactive accents. */
    brand: palette.lavender400,
    /** Links, icons, and selected text. */
    solid: palette.lavender300,
    /** Filled buttons. */
    fill: palette.lavender500,
    fillPressed: palette.lavender600,
    muted: "rgba(139, 128, 255, 0.14)",
    border: "rgba(139, 128, 255, 0.40)",
  },

  /**
   * Champagne gold. Legendary rarity, Grail tier, and rare highlight moments only.
   * Do not use for primary buttons, nav, or routine labels.
   */
  premium: {
    gold: palette.softGold,
    champagne: palette.champagne,
    goldMuted: "rgba(184, 154, 98, 0.14)",
    goldBorder: "rgba(184, 154, 98, 0.40)",
  },

  category: {
    TRADING_CARD: tone(palette.violet400, "167, 139, 250"),
    SNEAKER: tone(palette.sky400, "79, 195, 232"),
    WATCH: tone(palette.champagne, "184, 154, 98"),
  } satisfies Record<PackCategory, Tone>,

  rarity: {
    COMMON: tone("#9AA1AE", "154, 161, 174"),
    UNCOMMON: tone("#B7C4D6", "183, 196, 214"),
    RARE: tone("#9BB0FF", "155, 176, 255"),
    EPIC: tone("#C49BFF", "196, 155, 255"),
    LEGENDARY: tone(palette.softGold, "217, 189, 133"),
  },

  status: {
    success: tone(palette.teal400, "100, 216, 196"),
    warning: tone(palette.amber400, "245, 181, 68"),
    error: {
      ...tone(palette.rose400, "240, 107, 118"),
      /** Pressed solid destructive fill. */
      fillPressed: palette.rose500,
    },
    info: tone(palette.blue300, "155, 176, 255"),
  },

  overlay: {
    /** Behind bottom sheets and modals. */
    scrim: "rgba(4, 5, 7, 0.72)",
    /** Bottom fade on hero imagery so overlay text stays readable. */
    heroFade: "rgba(9, 10, 13, 0.85)",
    /** Absolute black for reveal impact darkening only. */
    impact: "#000000",
  },
} as const;

export type Colors = typeof colors;
export type RarityKey = keyof typeof colors.rarity;
export type StatusKey = keyof typeof colors.status;
