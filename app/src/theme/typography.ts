import type { TextStyle } from "react-native";

import { fontFamily } from "./fonts";

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
} as const satisfies Record<string, TextStyle["fontWeight"]>;

type Variant = Pick<
  TextStyle,
  "fontSize" | "lineHeight" | "fontWeight" | "letterSpacing" | "textTransform" | "fontVariant" | "fontFamily"
>;

function face(
  family: string,
  size: number,
  lineHeight: number,
  weight: TextStyle["fontWeight"],
  extras: Partial<Variant> = {},
): Variant {
  return { fontFamily: family, fontSize: size, lineHeight, fontWeight: weight, ...extras };
}

const scale = {
  displayXL: face(fontFamily.extrabold, 40, 48, fontWeight.extrabold),
  display: face(fontFamily.bold, 28, 36, fontWeight.bold),
  titleLarge: face(fontFamily.bold, 22, 28, fontWeight.bold),
  title: face(fontFamily.semibold, 20, 28, fontWeight.semibold),
  heading: face(fontFamily.semibold, 17, 24, fontWeight.semibold),
  body: face(fontFamily.regular, 15, 22, fontWeight.regular),
  bodyMedium: face(fontFamily.medium, 15, 22, fontWeight.medium),
  bodySmall: face(fontFamily.regular, 13, 18, fontWeight.regular),
  caption: face(fontFamily.medium, 12, 16, fontWeight.medium),
} as const satisfies Record<string, Variant>;

// Money and countdowns use tabular figures so a ticking value does not shift width.
const tabular: TextStyle["fontVariant"] = ["tabular-nums"];

export const typography = {
  ...scale,
  label: face(fontFamily.semibold, 11, 14, fontWeight.semibold, {
    letterSpacing: 0.6,
    textTransform: "uppercase",
  }),
  button: face(fontFamily.semibold, 15, 20, fontWeight.semibold),
  buttonSmall: face(fontFamily.semibold, 13, 18, fontWeight.semibold),
  moneyLarge: { ...scale.displayXL, fontVariant: tabular },
  money: face(fontFamily.bold, 20, 26, fontWeight.bold, { fontVariant: tabular }),
  moneySmall: face(fontFamily.semibold, 15, 20, fontWeight.semibold, { fontVariant: tabular }),
  countdown: face(fontFamily.semibold, 15, 22, fontWeight.semibold, { fontVariant: tabular }),
  productTitle: face(fontFamily.semibold, 15, 20, fontWeight.semibold),
  sectionTitle: face(fontFamily.bold, 21, 28, fontWeight.bold),
} as const satisfies Record<string, Variant>;

export type TypographyVariant = keyof typeof typography;

/** Large text still has to fit a 360dp phone. Display sizes stop growing past this multiplier. */
export const maxFontScale = {
  display: 1.3,
  body: 2,
} as const;
