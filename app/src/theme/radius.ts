export const radius = {
  none: 0,
  /** Thumbnails and small badges. */
  sm: 8,
  chip: 10,
  button: 14,
  card: 20,
  modal: 22,
  bottomSheet: 24,
  /** Avatars and status dots only. Not for buttons or chips. */
  full: 999,
} as const;

export type RadiusKey = keyof typeof radius;
