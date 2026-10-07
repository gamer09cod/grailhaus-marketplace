import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppHeader } from "../../components/AppHeader";
import { colors, layout, maxFontScale, radius, spacing, typography, useContentBottomPadding } from "../../theme";

const topics: { title: string; body: string }[] = [
  {
    title: "Wallet",
    body: "Mock deposits credit your wallet. Checkout records the debit on your ledger. The client does not invent a balance.",
  },
  {
    title: "Buying",
    body: "Packs and listings check out together. Review Purchase does not charge. Confirm Purchase does.",
  },
  {
    title: "Selling",
    body: "List from Portfolio. Buyers pay the listing price. The 8% fee is taken from the seller.",
  },
  {
    title: "Opening packs",
    body: "Sealed trading-card packs open on Reveal. Haptics can be turned off under Settings. Card names still stay on screen.",
  },
];

export function SupportScreen() {
  const contentBottom = useContentBottomPadding();
  return (
    <View style={styles.screen}>
      <AppHeader back title="Support" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentBottom }]}>
        <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.lead}>
          GrailHaus is a trial collectibles marketplace. There is no live support queue.
        </Text>
        {topics.map((topic) => (
          <View key={topic.title} style={styles.card}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontScale.body} style={styles.title}>
              {topic.title}
            </Text>
            <Text maxFontSizeMultiplier={maxFontScale.body} style={styles.body}>{topic.body}</Text>
          </View>
        ))}
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
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  lead: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderSubtle,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.xs,
    padding: layout.cardPadding,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
