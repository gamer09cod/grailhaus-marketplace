import { memo } from "react";
import { Image, StyleSheet, View } from "react-native";
import { radius, revealCardFrame } from "../../theme";

const cardBackArt = require("../../../assets/catalog/card-back.jpg");

/** Shared GrailHaus card back — no item identity or rarity cues. */
export const CardBack = memo(function CardBack() {
  return (
    <View accessible={false} style={styles.card}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        source={cardBackArt}
        style={styles.art}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: revealCardFrame.width,
    height: revealCardFrame.height,
    borderRadius: radius.modal,
    overflow: "hidden",
    backgroundColor: "#07080C",
  },
  art: {
    ...StyleSheet.absoluteFill,
  },
});
