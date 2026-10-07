import { colors } from "../../theme";
import { BaseButton, type ButtonAppearance, type ButtonProps } from "./BaseButton";

const appearance: ButtonAppearance = {
  background: colors.surfaceElevated,
  backgroundPressed: colors.surfacePressed,
  border: colors.borderStrong,
  text: colors.textPrimary,
};

export function SecondaryButton(props: ButtonProps) {
  return <BaseButton {...props} appearance={appearance} />;
}
