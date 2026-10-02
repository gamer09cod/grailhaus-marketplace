import { Pressable, StyleSheet, Text } from "react-native";

import { formatCents } from "../../utils/money";
import { categoryLabel, stockLabel, tierPresence, type ShelfPack, type TierPresence } from "./packs";

type PackCardProps = {
  pack: ShelfPack;
  onPress: () => void;
};

export function PackCard({ pack, onPress }: PackCardProps) {
  const presence = tierPresence(pack.priceCents);

  return (
    <Pressable onPress={onPress} style={[styles.card, presenceStyle[presence]]}>
      <Text style={styles.category}>{categoryLabel(pack.category)}</Text>
      <Text style={[styles.name, nameStyle[presence]]}>{pack.name}</Text>
      <Text style={styles.tier}>{pack.tier}</Text>
      <Text style={[styles.price, priceStyle[presence]]}>{formatCents(pack.priceCents)}</Text>
      <Text style={styles.stock}>{stockLabel(pack.reservable)}</Text>
    </Pressable>
  );
}

const presenceStyle: Record<TierPresence, object> = {
  quiet: {
    backgroundColor: "#1a1814",
    borderColor: "#2e2a26",
    padding: 14,
  },
  standard: {
    backgroundColor: "#1c1916",
    borderColor: "#4a4036",
    padding: 16,
  },
  elevated: {
    backgroundColor: "#221c16",
    borderColor: "#8a7044",
    padding: 18,
  },
  grail: {
    backgroundColor: "#2a2218",
    borderColor: "#e4c07a",
    borderWidth: 1.5,
    padding: 22,
  },
};

const nameStyle: Record<TierPresence, object> = {
  quiet: { fontSize: 16 },
  standard: { fontSize: 18 },
  elevated: { fontSize: 22 },
  grail: { fontSize: 28 },
};

const priceStyle: Record<TierPresence, object> = {
  quiet: { fontSize: 16, color: "#f4efe6" },
  standard: { fontSize: 20, color: "#f4efe6" },
  elevated: { fontSize: 28, color: "#f4efe6" },
  grail: { fontSize: 36, color: "#e4c07a" },
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 12,
  },
  category: {
    color: "#a3988c",
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  name: {
    color: "#f4efe6",
    fontWeight: "600",
    marginTop: 8,
  },
  tier: {
    color: "#c9bfb2",
    marginTop: 4,
  },
  price: {
    fontWeight: "600",
    marginTop: 12,
  },
  stock: {
    color: "#c9bfb2",
    marginTop: 4,
  },
});
