import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, duration, easing, layout, maxFontScale, radius, spacing, typography, useReducedMotion } from "../theme";
import { IconButton } from "./buttons";
import { Icon, iconSlot } from "./Icon";

const dismissDistance = 72;

export type AppBottomSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Sticky actions below the scroll body. */
  footer?: ReactNode;
  /**
   * Discovery slides the sheet. Financial fades only so money does not travel.
   */
  motion?: "discovery" | "financial";
};

export function AppBottomSheet({
  visible,
  title,
  onClose,
  children,
  footer,
  motion = "discovery",
}: AppBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const fadeOnly = reduced || motion === "financial";
  const [mounted, setMounted] = useState(visible);
  const progress = useMemo(() => new Animated.Value(0), []);
  const dragY = useMemo(() => new Animated.Value(0), []);

  if (visible && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: fadeOnly ? duration.fast : duration.base,
        easing: easing.enter,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!mounted) {
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: duration.fast,
      easing: easing.exit,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        dragY.setValue(0);
      }
    });
  }, [dragY, fadeOnly, mounted, progress, visible]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_event, gesture) => {
      dragY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > dismissDistance || gesture.vy > 0.9) {
        onClose();
      }
      Animated.timing(dragY, {
        toValue: 0,
        duration: duration.fast,
        easing: easing.standard,
        useNativeDriver: true,
      }).start();
    },
  }), [dragY, onClose]);

  if (!mounted) {
    return null;
  }

  const maxHeight = Math.round(height * 0.88);
  const translate = fadeOnly
    ? 0
    : Animated.add(
      progress.interpolate({ inputRange: [0, 1], outputRange: [120, 0] }),
      dragY,
    );
  const scrimOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Modal
      transparent
      visible={mounted}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.frame}
      >
        <Pressable
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        >
          <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]} />
        </Pressable>
        <Animated.View
          accessibilityLabel={title}
          accessibilityRole="summary"
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              maxHeight,
              paddingBottom: Math.max(insets.bottom, spacing.md),
              opacity: progress,
              transform: fadeOnly ? undefined : [{ translateY: translate }],
            },
          ]}
        >
          <View {...pan.panHandlers} style={styles.handleHit}>
            <View style={styles.handle} />
            <View style={styles.titleRow}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.title}>
                {title}
              </Text>
              <IconButton
                accessibilityLabel="Close"
                icon={iconSlot("close", 20)}
                size="sm"
                onPress={onClose}
              />
            </View>
          </View>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            style={styles.scroll}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetTrigger({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.trigger, pressed ? styles.triggerPressed : null]}
    >
      <Text maxFontSizeMultiplier={maxFontScale.body} numberOfLines={1} style={styles.triggerLabel}>{label}</Text>
      <Icon color={colors.textTertiary} name="chevron-up" size={16} />
    </Pressable>
  );
}

export function SheetOption({
  label,
  selected,
  onPress,
  detail,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  detail?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}${detail ? `. ${detail}` : ""}${selected ? ", selected" : ""}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.option, pressed ? styles.optionPressed : null]}
    >
      <View style={styles.optionText}>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.optionLabel}>{label}</Text>
        {detail ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.optionDetail}>{detail}</Text>
        ) : null}
      </View>
      <View style={[styles.radio, selected ? styles.radioOn : null]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    flex: 1,
    backgroundColor: colors.overlay.scrim,
  },
  sheet: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderTopLeftRadius: radius.bottomSheet,
    borderTopRightRadius: radius.bottomSheet,
    borderTopWidth: 1,
    overflow: "hidden",
  },
  handleHit: {
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: colors.borderStrong,
    borderRadius: radius.full,
    height: 4,
    width: 40,
  },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    flex: 1,
  },
  scroll: {
    flexGrow: 0,
  },
  body: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: layout.screenPadding,
  },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  trigger: {
    alignItems: "center",
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 36,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  triggerPressed: {
    backgroundColor: colors.surfacePressed,
  },
  triggerLabel: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  option: {
    alignItems: "center",
    borderColor: colors.borderSubtle,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  optionPressed: {
    backgroundColor: colors.surfacePressed,
  },
  optionText: {
    flex: 1,
    gap: spacing.xxs,
  },
  optionLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  optionDetail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  radio: {
    borderColor: colors.borderStrong,
    borderRadius: radius.full,
    borderWidth: 2,
    height: 20,
    width: 20,
  },
  radioOn: {
    backgroundColor: colors.accent.fill,
    borderColor: colors.accent.fill,
  },
});
