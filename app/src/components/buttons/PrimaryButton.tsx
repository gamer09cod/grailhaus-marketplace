import { colors } from "../../theme";
import { BaseButton, type ButtonAppearance, type ButtonProps } from "./BaseButton";

const appearance: ButtonAppearance = {
  background: colors.accent.fill,
  backgroundPressed: colors.accent.fillPressed,
  border: colors.accent.fill,
  text: colors.textOnAccent,
};

export function PrimaryButton(props: ButtonProps) {
  return <BaseButton {...props} appearance={appearance} />;
}
