import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "./src/features/auth/AuthProvider";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { colors, manropeFonts } from "./src/theme";

const queryClient = new QueryClient();

export default function App() {
  const [fontsLoaded] = useFonts(manropeFonts);

  if (!fontsLoaded) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accent.solid} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="light" />
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  boot: {
    alignItems: "center",
    backgroundColor: colors.backgroundPrimary,
    flex: 1,
    justifyContent: "center",
  },
  root: {
    flex: 1,
    backgroundColor: colors.backgroundPrimary,
  },
});
