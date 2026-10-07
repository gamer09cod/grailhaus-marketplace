import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader";
import { ConnectivityBanner } from "../../components/ConnectivityBanner";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { DropHeroSkeleton } from "../../components/Skeleton";
import type { AppStackParamList } from "../../navigation/types";
import { colors, layout, spacing, typography, useContentBottomPadding } from "../../theme";
import type { TimedDrop } from "./board";
import { DropCard } from "./DropCard";
import { browsePacks, browseSimilar } from "./dropNav";
import { HeroDropCard } from "./HeroDropCard";
import { pickHeroDrop } from "./select";
import { useDropBoard } from "./useDropBoard";

export function DropsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const board = useDropBoard();
  const contentBottom = useContentBottomPadding();
  const payload = board.data;
  const hero = payload ? pickHeroDrop(payload.drops) : null;
  const rest = (payload?.drops ?? []).filter((drop) => drop.dropId !== hero?.dropId);

  function openDrop(drop: TimedDrop) {
    navigation.navigate("PackDetail", { packId: drop.packSkuId });
  }

  function runAction(drop: TimedDrop) {
    if (drop.status === "SOLD_OUT") {
      browseSimilar(navigation, drop.category);
      return;
    }
    if (drop.status === "ENDED") {
      browsePacks(navigation);
      return;
    }
    openDrop(drop);
  }

  return (
    <View style={styles.screen}>
      <AppHeader back cart title="Drops" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}
        refreshControl={
          <RefreshControl
            refreshing={board.isRefetching && !board.isLoading}
            tintColor={colors.accent.solid}
            onRefresh={() => void board.refetch()}
          />
        }
        style={styles.screen}
      >
        <ConnectivityBanner offlineDetail="This countdown may be out of date." />
        {board.isLoading ? <DropHeroSkeleton /> : null}
        {board.isError ? (
          <ErrorState
            body="Check the connection and try again."
            title="Drops didn't load."
            onRetry={() => void board.refetch()}
          />
        ) : null}
        {payload && payload.drops.length === 0 ? (
          <EmptyState icon="flash-outline" title="No timed drops are scheduled." />
        ) : null}
        {hero && payload ? (
          <HeroDropCard board={payload} drop={hero} onPress={() => openDrop(hero)} />
        ) : null}
        {payload && rest.length > 0 ? (
          <View style={styles.list}>
            {rest.map((drop) => (
              <DropCard
                key={drop.dropId}
                board={payload}
                drop={drop}
                onAction={() => runAction(drop)}
                onOpen={() => openDrop(drop)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
  content: {
    gap: layout.sectionGap,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  block: {
    gap: spacing.sm,
  },
  list: {
    gap: spacing.base,
  },
});
