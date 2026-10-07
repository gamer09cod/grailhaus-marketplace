import type { TextStyle } from "react-native";

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const satisfies Record<string, TextStyle["fontWeight"]>;

type Variant = Pick<TextStyle, "fontSize" | "lineHeight" | "fontWeight" | "letterSpacing" | "textTransform" | "fontVariant">;

const scale = {
  displayXL: { fontSize: 32, lineHeight: 40, fontWeight: fontWeight.bold },
  display: { fontSize: 28, lineHeight: 36, fontWeight: fontWeight.bold },
  titleLarge: { fontSize: 24, lineHeight: 32, fontWeight: fontWeight.semibold },
  title: { fontSize: 20, lineHeight: 28, fontWeight: fontWeight.semibold },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: fontWeight.semibold },
  body: { fontSize: 16, lineHeight: 24, fontWeight: fontWeight.regular },
  bodyMedium: { fontSize: 16, lineHeight: 24, fontWeight: fontWeight.medium },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.regular },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.medium },
} as const satisfies Record<string, Variant>;

// Money and countdowns use tabular figures so a ticking value does not shift width.
const tabular: TextStyle["fontVariant"] = ["tabular-nums"];

export const typography = {
  ...scale,
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  button: { fontSize: 16, lineHeight: 20, fontWeight: fontWeight.semibold },
  buttonSmall: { fontSize: 14, lineHeight: 18, fontWeight: fontWeight.semibold },
  moneyLarge: { ...scale.displayXL, fontVariant: tabular },
  money: { ...scale.heading, fontVariant: tabular },
  moneySmall: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.semibold, fontVariant: tabular },
  countdown: { fontSize: 16, lineHeight: 24, fontWeight: fontWeight.semibold, fontVariant: tabular },
} as const satisfies Record<string, Variant>;

export type TypographyVariant = keyof typeof typography;

/** Large text still has to fit a 360dp phone. Display sizes stop growing past this multiplier. */
export const maxFontScale = {
  display: 1.3,
  body: 2,
} as const;
