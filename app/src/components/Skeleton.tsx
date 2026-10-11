import { useEffect, useMemo, type ReactNode } from "react";
import { Animated, StyleSheet, View, type DimensionValue, type ViewStyle } from "react-native";

import {
  catalogGrid,
  colors,
  duration,
  easing,
  layout,
  radius,
  spacing,
  useReducedMotion,
  type MotionProfile,
} from "../theme";

type SkeletonBoneProps = {
  width?: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
  motion?: MotionProfile;
};

/** Soft placeholder block. Pulses on discovery; stays still for financial / reduced motion. */
export function SkeletonBone({
  width = "100%",
  height,
  borderRadius = radius.sm,
  style,
  motion = "discovery",
}: SkeletonBoneProps) {
  const reduced = useReducedMotion();
  const pulse = motion === "discovery" && !reduced;
  const opacity = useMemo(() => new Animated.Value(0.55), []);

  useEffect(() => {
    if (!pulse) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0.55);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: duration.slow,
          easing: easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: duration.slow,
          easing: easing.standard,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, pulse]);

  return (
    <Animated.View
      style={[styles.bone, { width, height, borderRadius, opacity }, style]}
    />
  );
}

type SkeletonFrameProps = {
  accessibilityLabel: string;
  children: ReactNode;
  style?: ViewStyle;
};

function SkeletonFrame({ accessibilityLabel, children, style }: SkeletonFrameProps) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={style}
    >
      {children}
    </View>
  );
}

export function PackCardSkeleton({
  width,
  artHeight,
  motion = "discovery",
}: {
  width?: number;
  artHeight?: number;
  motion?: MotionProfile;
}) {
  const tileWidth = width ?? 168;
  const tileArt = artHeight ?? Math.round(tileWidth * 1.25);
  return (
    <SkeletonFrame accessibilityLabel="Loading pack" style={{ ...styles.card, width: tileWidth }}>
      <SkeletonBone borderRadius={0} height={tileArt} motion={motion} />
      <View style={styles.cardInfo}>
        <SkeletonBone height={14} motion={motion} width="48%" />
        <SkeletonBone height={12} motion={motion} width="80%" />
        <SkeletonBone height={12} motion={motion} width="40%" />
      </View>
    </SkeletonFrame>
  );
}

export function PackListSkeleton({
  width,
  artHeight,
  count = 6,
}: {
  width: number;
  artHeight: number;
  count?: number;
}) {
  return (
    <SkeletonFrame accessibilityLabel="Loading packs" style={styles.grid}>
      {Array.from({ length: count }, (_, index) => (
        <PackCardSkeleton key={index} artHeight={artHeight} width={width} />
      ))}
    </SkeletonFrame>
  );
}

type GridCardSkeletonProps = {
  width: number;
  artHeight: number;
  motion?: MotionProfile;
};

function GridCardSkeleton({ width, artHeight, motion = "discovery" }: GridCardSkeletonProps) {
  return (
    <View style={[styles.card, { width }]}>
      <SkeletonBone borderRadius={0} height={artHeight} motion={motion} />
      <View style={styles.cardInfo}>
        <SkeletonBone height={14} motion={motion} width="80%" />
        <SkeletonBone height={16} motion={motion} width="45%" />
        <SkeletonBone height={12} motion={motion} width="55%" />
      </View>
    </View>
  );
}

export function MarketGridSkeleton({
  width,
  artHeight,
  count = 6,
}: {
  width: number;
  artHeight: number;
  count?: number;
}) {
  return (
    <SkeletonFrame accessibilityLabel="Loading listings" style={styles.grid}>
      {Array.from({ length: count }, (_, index) => (
        <GridCardSkeleton key={index} artHeight={artHeight} motion="discovery" width={width} />
      ))}
    </SkeletonFrame>
  );
}

export function HoldingGridSkeleton({
  width,
  artHeight,
  count = 4,
}: {
  width: number;
  artHeight: number;
  count?: number;
}) {
  return (
    <SkeletonFrame accessibilityLabel="Loading your items" style={styles.stack}>
      <View style={styles.summaryBones}>
        <SkeletonBone height={28} motion="financial" width="48%" />
        <SkeletonBone height={14} motion="financial" width="62%" />
      </View>
      <View style={styles.grid}>
        {Array.from({ length: count }, (_, index) => (
          <GridCardSkeleton key={index} artHeight={artHeight} motion="discovery" width={width} />
        ))}
      </View>
    </SkeletonFrame>
  );
}

export function HomeRailSkeleton({
  width,
  artHeight,
  count = 3,
}: {
  width: number;
  artHeight: number;
  count?: number;
}) {
  return (
    <SkeletonFrame accessibilityLabel="Loading featured packs" style={styles.rail}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.tile, { width }]}>
          <SkeletonBone borderRadius={0} height={artHeight} />
          <View style={styles.cardInfo}>
            <SkeletonBone height={14} width="48%" />
            <SkeletonBone height={12} width="80%" />
            <SkeletonBone height={12} width="40%" />
          </View>
        </View>
      ))}
    </SkeletonFrame>
  );
}

export function DropHeroSkeleton() {
  return (
    <SkeletonFrame accessibilityLabel="Loading drops" style={styles.stack}>
      <View style={styles.card}>
        <SkeletonBone borderRadius={0} height={260} />
        <View style={styles.cardInfo}>
          <SkeletonBone height={14} width="30%" />
          <SkeletonBone height={20} width="70%" />
          <SkeletonBone height={14} width="50%" />
        </View>
      </View>
      <View style={styles.dropRow}>
        <SkeletonBone borderRadius={radius.sm} height={148} width={120} />
        <View style={styles.dropRowInfo}>
          <SkeletonBone height={14} width="40%" />
          <SkeletonBone height={18} width="80%" />
          <SkeletonBone height={14} width="60%" />
        </View>
      </View>
    </SkeletonFrame>
  );
}

export function CartLineSkeleton({ count = 2 }: { count?: number }) {
  return (
    <SkeletonFrame accessibilityLabel="Loading your cart" style={styles.stack}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.cartLine}>
          <SkeletonBone height={72} motion="financial" width={72} />
          <View style={styles.cartCopy}>
            <SkeletonBone height={12} motion="financial" width="40%" />
            <SkeletonBone height={16} motion="financial" width="70%" />
            <SkeletonBone height={14} motion="financial" width="50%" />
            <SkeletonBone height={18} motion="financial" width="35%" />
          </View>
        </View>
      ))}
    </SkeletonFrame>
  );
}

export function ListRowSkeleton({
  count = 4,
  accessibilityLabel = "Loading",
}: {
  count?: number;
  accessibilityLabel?: string;
}) {
  return (
    <SkeletonFrame accessibilityLabel={accessibilityLabel} style={styles.stack}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.listRow}>
          <View style={styles.listRowCopy}>
            <SkeletonBone height={14} motion="financial" width="55%" />
            <SkeletonBone height={12} motion="financial" width="35%" />
          </View>
          <SkeletonBone height={16} motion="financial" width={72} />
        </View>
      ))}
    </SkeletonFrame>
  );
}

export function DetailSkeleton({
  artHeight = 220,
  accessibilityLabel = "Loading",
}: {
  artHeight?: number;
  accessibilityLabel?: string;
}) {
  return (
    <SkeletonFrame accessibilityLabel={accessibilityLabel} style={styles.stack}>
      <SkeletonBone borderRadius={radius.card} height={artHeight} />
      <SkeletonBone height={14} width="28%" />
      <SkeletonBone height={24} width="75%" />
      <SkeletonBone height={16} width="40%" />
      <SkeletonBone height={14} width="90%" />
      <SkeletonBone height={14} width="70%" />
    </SkeletonFrame>
  );
}

export function RevealLoadSkeleton() {
  return (
    <SkeletonFrame accessibilityLabel="Loading the sealed pack" style={styles.reveal}>
      <SkeletonBone borderRadius={radius.card} height={280} width={200} />
    </SkeletonFrame>
  );
}

export function AdminSkeleton() {
  return (
    <SkeletonFrame accessibilityLabel="Loading admin numbers" style={styles.stack}>
      <SkeletonBone height={20} motion="financial" width="40%" />
      <SkeletonBone height={32} motion="financial" width="55%" />
      <SkeletonBone height={20} motion="financial" width="40%" />
      <SkeletonBone height={32} motion="financial" width="55%" />
      <SkeletonBone height={20} motion="financial" width="40%" />
      <SkeletonBone height={32} motion="financial" width="55%" />
    </SkeletonFrame>
  );
}

const styles = StyleSheet.create({
  bone: {
    backgroundColor: colors.surfaceElevated,
  },
  card: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardInfo: {
    gap: spacing.xs,
    padding: spacing.sm,
  },
  stack: {
    gap: spacing.md,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: catalogGrid.gap,
  },
  summaryBones: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  rail: {
    flexDirection: "row",
    gap: catalogGrid.gap,
  },
  tile: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  dropRow: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    overflow: "hidden",
    padding: spacing.md,
  },
  dropRowInfo: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center",
  },
  cartLine: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: layout.cardPadding,
  },
  cartCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  listRow: {
    alignItems: "center",
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: layout.cardPadding,
  },
  listRowCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  reveal: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
  },
});
