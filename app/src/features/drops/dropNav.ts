import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { AppStackParamList, PackCategory } from "../../navigation/types";

export function browsePacks(navigation: NativeStackNavigationProp<AppStackParamList>) {
  navigation.navigate("Tabs", { screen: "Packs" });
}

export function browseSimilar(
  navigation: NativeStackNavigationProp<AppStackParamList>,
  category: PackCategory,
) {
  navigation.navigate("Category", { category });
}
