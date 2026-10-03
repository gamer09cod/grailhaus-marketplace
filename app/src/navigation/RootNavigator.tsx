import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuth } from "../features/auth/AuthProvider";
import { AuthScreen } from "../features/auth/AuthScreen";
import { CartScreen } from "../features/cart/CartScreen";
import { CollectionScreen } from "../features/collection/CollectionScreen";
import { ListingScreen } from "../features/collection/ListingScreen";
import { DropsScreen } from "../features/drops/DropsScreen";
import { CategoryScreen } from "../features/shelf/CategoryScreen";
import { PackDetailScreen } from "../features/shelf/PackDetailScreen";
import { ShelfScreen } from "../features/shelf/ShelfScreen";
import { WalletScreen } from "../features/wallet/WalletScreen";
import type { AppStackParamList } from "./types";

type AuthStackParamList = {
  SignIn: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#12110f",
    card: "#12110f",
    text: "#f4efe6",
    border: "#2a2723",
    primary: "#e4c07a",
  },
};

export function RootNavigator() {
  const { session, ready } = useAuth();

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#e4c07a" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme}>
      {session ? (
        <AppStack.Navigator initialRouteName="Shelf" screenOptions={{ headerShown: false }}>
          <AppStack.Screen name="Shelf" component={ShelfScreen} />
          <AppStack.Screen name="Drops" component={DropsScreen} />
          <AppStack.Screen name="Category" component={CategoryScreen} />
          <AppStack.Screen name="PackDetail" component={PackDetailScreen} />
          <AppStack.Screen name="Cart" component={CartScreen} />
          <AppStack.Screen name="Wallet" component={WalletScreen} />
          <AppStack.Screen name="Collection" component={CollectionScreen} />
          <AppStack.Screen name="Listing" component={ListingScreen} />
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
    backgroundColor: "#12110f",
    alignItems: "center",
    justifyContent: "center",
  },
});
