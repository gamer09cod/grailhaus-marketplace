import { colors } from "../../theme";
import { BaseButton, type ButtonAppearance, type ButtonProps } from "./BaseButton";

const appearance: ButtonAppearance = {
  background: "transparent",
  backgroundPressed: colors.accent.muted,
  border: "transparent",
  text: colors.accent.solid,
};

const disabledAppearance: ButtonAppearance = {
  background: "transparent",
  backgroundPressed: "transparent",
  border: "transparent",
  text: colors.textDisabled,
};

export function TertiaryButton(props: ButtonProps) {
  return <BaseButton {...props} appearance={appearance} compact disabledAppearance={disabledAppearance} />;
}
