import { colors } from "../../theme";
import { BaseButton, type ButtonAppearance, type ButtonProps } from "./BaseButton";

const soft: ButtonAppearance = {
  background: colors.status.error.muted,
  backgroundPressed: colors.status.error.border,
  border: colors.status.error.border,
  text: colors.status.error.solid,
};

// Dark text on the red fill is about 6.8:1.
const solid: ButtonAppearance = {
  background: colors.status.error.solid,
  backgroundPressed: colors.status.error.fillPressed,
  border: colors.status.error.solid,
  text: colors.backgroundPrimary,
};

export type DestructiveButtonProps = ButtonProps & {
  /** "soft" for routine removals. "solid" only for a final, irreversible confirmation. */
  emphasis?: "soft" | "solid";
};

export function DestructiveButton({ emphasis = "soft", ...props }: DestructiveButtonProps) {
  return <BaseButton {...props} appearance={emphasis === "solid" ? solid : soft} />;
}
