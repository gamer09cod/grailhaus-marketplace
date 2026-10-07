import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader";
import { colors } from "../../theme";
import { PackBrowser } from "./PackBrowser";

export function PacksScreen() {
  return (
    <View style={styles.screen}>
      <AppHeader cart title="Packs" />
      <PackBrowser />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
});
