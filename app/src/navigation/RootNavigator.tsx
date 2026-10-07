import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AdminScreen } from "../features/admin/AdminScreen";
import { useAuth } from "../features/auth/AuthProvider";
import { AuthScreen } from "../features/auth/AuthScreen";
import { CartScreen } from "../features/cart/CartScreen";
import { ListingScreen } from "../features/collection/ListingScreen";
import { DropsScreen } from "../features/drops/DropsScreen";
import { MarketDetailScreen } from "../features/market/MarketDetailScreen";
import { PurchasesScreen } from "../features/profile/PurchasesScreen";
import { SupportScreen } from "../features/profile/SupportScreen";
import { QaScreen } from "../features/qa/QaScreen";
import { RevealScreen } from "../features/reveal/RevealScreen";
import { CategoryScreen } from "../features/shelf/CategoryScreen";
import { PackDetailScreen } from "../features/shelf/PackDetailScreen";
import { ActivityScreen } from "../features/wallet/ActivityScreen";
import { WalletScreen } from "../features/wallet/WalletScreen";
import { colors, navigationTheme } from "../theme";
import { MainTabs } from "./MainTabs";
import type { AppStackParamList } from "./types";

type AuthStackParamList = {
  SignIn: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

export function RootNavigator() {
  const { session, ready } = useAuth();

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent.solid} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      {session ? (
        <AppStack.Navigator initialRouteName="Tabs" screenOptions={{ headerShown: false }}>
          <AppStack.Screen name="Tabs" component={MainTabs} />
          <AppStack.Screen name="Drops" component={DropsScreen} />
          <AppStack.Screen name="Category" component={CategoryScreen} />
          <AppStack.Screen name="PackDetail" component={PackDetailScreen} />
          <AppStack.Screen name="MarketDetail" component={MarketDetailScreen} />
          <AppStack.Screen name="Cart" component={CartScreen} />
          <AppStack.Screen name="Wallet" component={WalletScreen} />
          <AppStack.Screen name="Activity" component={ActivityScreen} />
          <AppStack.Screen name="Purchases" component={PurchasesScreen} />
          <AppStack.Screen name="Support" component={SupportScreen} />
          <AppStack.Screen name="Listing" component={ListingScreen} />
          <AppStack.Screen name="Qa" component={QaScreen} />
          <AppStack.Screen name="Admin" component={AdminScreen} />
          <AppStack.Screen name="Reveal" component={RevealScreen} />
        </AppStack.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="SignIn" component={AuthScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
});
