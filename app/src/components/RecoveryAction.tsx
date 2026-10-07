import { PrimaryButton, SecondaryButton, TertiaryButton } from "./buttons";
import type { MotionProfile } from "../theme";

export type RecoveryActionProps = {
  label: string;
  onPress: () => void;
  motion?: MotionProfile;
  /** Default tertiary for Try again; secondary for Check again; primary for high-stakes recover. */
  variant?: "primary" | "secondary" | "tertiary";
  fullWidth?: boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
};

/** Shared retry / check-again control used by ErrorState and InlineStatusCard. */
export function RecoveryAction({
  label,
  onPress,
  motion,
  variant = "tertiary",
  fullWidth = false,
  disabled = false,
  size = "md",
}: RecoveryActionProps) {
  if (variant === "primary") {
    return (
      <PrimaryButton
        disabled={disabled}
        fullWidth={fullWidth}
        label={label}
        motion={motion}
        size={size}
        onPress={onPress}
      />
    );
  }
  if (variant === "secondary") {
    return (
      <SecondaryButton
        disabled={disabled}
        fullWidth={fullWidth}
        label={label}
        motion={motion}
        size={size}
        onPress={onPress}
      />
    );
  }
  return (
    <TertiaryButton
      disabled={disabled}
      fullWidth={fullWidth}
      label={label}
      motion={motion}
      size={size}
      onPress={onPress}
    />
  );
}
