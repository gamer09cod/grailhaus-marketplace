export const radius = {
  none: 0,
  /** Thumbnails and small badges. */
  sm: 8,
  chip: 10,
  button: 12,
  card: 16,
  modal: 20,
  bottomSheet: 24,
  /** Avatars and status dots only. Not for buttons or chips. */
  full: 999,
} as const;

export type RadiusKey = keyof typeof radius;
