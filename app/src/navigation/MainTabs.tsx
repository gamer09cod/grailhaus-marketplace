import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StyleSheet } from "react-native";

import { Icon, type IconName } from "../components/Icon";
import { CollectionScreen } from "../features/collection/CollectionScreen";
import { MarketScreen } from "../features/market/MarketScreen";
import { ProfileScreen } from "../features/profile/ProfileScreen";
import { useSealedCount } from "../features/reveal/useSealedCount";
import { PacksScreen } from "../features/shelf/PacksScreen";
import { ShelfScreen } from "../features/shelf/ShelfScreen";
import { colors, iconSize, typography } from "../theme";
import type { MainTab, MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

const tabIcons: Record<MainTab, { idle: IconName; active: IconName }> = {
  Home: { idle: "home-outline", active: "home" },
  Packs: { idle: "cube-outline", active: "cube" },
  Market: { idle: "storefront-outline", active: "storefront" },
  Portfolio: { idle: "albums-outline", active: "albums" },
  Profile: { idle: "person-circle-outline", active: "person-circle" },
};

export function MainTabs() {
  const sealed = useSealedCount();

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent.solid,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { ...typography.caption, fontSize: 11, letterSpacing: 0.15 },
        tabBarStyle: {
          backgroundColor: colors.backgroundPrimary,
          borderTopColor: colors.borderSubtle,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: {
          minHeight: 48,
          paddingTop: 6,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.accent.fill,
          color: colors.textOnAccent,
          fontSize: 10,
          minWidth: 18,
          height: 18,
          lineHeight: 16,
        },
        tabBarIcon: ({ color, focused }) => (
          <Icon
            color={color}
            name={focused ? tabIcons[route.name].active : tabIcons[route.name].idle}
            size={iconSize.lg}
          />
        ),
      })}
    >
      <Tab.Screen
        component={ShelfScreen}
        name="Home"
        options={{ tabBarAccessibilityLabel: "Home" }}
      />
      <Tab.Screen
        component={PacksScreen}
        name="Packs"
        options={{ tabBarAccessibilityLabel: "Packs" }}
      />
      <Tab.Screen
        component={MarketScreen}
        name="Market"
        options={{ tabBarAccessibilityLabel: "Market" }}
      />
      <Tab.Screen
        component={CollectionScreen}
        name="Portfolio"
        options={{
          tabBarLabel: "Collection",
          tabBarBadge: sealed > 0 ? (sealed > 9 ? "9+" : sealed) : undefined,
          tabBarAccessibilityLabel: sealed > 0
            ? `Collection, ${sealed} ${sealed === 1 ? "pack" : "packs"} to open`
            : "Collection",
        }}
      />
      <Tab.Screen
        component={ProfileScreen}
        name="Profile"
        options={{ tabBarAccessibilityLabel: "Profile" }}
      />
    </Tab.Navigator>
  );
}
