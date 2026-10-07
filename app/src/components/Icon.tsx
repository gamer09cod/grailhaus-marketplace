import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export type IconProps = {
  name: IconName;
  color: string;
  size?: number;
};

/** Decorative. The control that holds an icon carries the accessible label. */
export function Icon({ name, color, size = 22 }: IconProps) {
  return (
    <Ionicons
      accessibilityElementsHidden
      color={color}
      importantForAccessibility="no-hide-descendants"
      name={name}
      size={size}
    />
  );
}

/** Render prop for the `icon` slot on buttons, which passes in the state color. */
export function iconSlot(name: IconName, size = 20) {
  return function IconSlot(color: string) {
    return <Icon color={color} name={name} size={size} />;
  };
}
