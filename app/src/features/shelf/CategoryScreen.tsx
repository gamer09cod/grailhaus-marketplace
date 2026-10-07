import { useRoute, type RouteProp } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader";
import type { AppStackParamList } from "../../navigation/types";
import { colors } from "../../theme";
import { PackBrowser } from "./PackBrowser";
import { categoryLabel } from "./packs";

export function CategoryScreen() {
  const route = useRoute<RouteProp<AppStackParamList, "Category">>();

  return (
    <View style={styles.screen}>
      <AppHeader back cart title={categoryLabel(route.params.category)} />
      <PackBrowser initialCategory={route.params.category} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
});
