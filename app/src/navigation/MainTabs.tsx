import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { Icon, type IconName } from "../components/Icon";
import { CollectionScreen } from "../features/collection/CollectionScreen";
import { MarketScreen } from "../features/market/MarketScreen";
import { ProfileScreen } from "../features/profile/ProfileScreen";
import { useSealedCount } from "../features/reveal/useSealedCount";
import { PacksScreen } from "../features/shelf/PacksScreen";
import { ShelfScreen } from "../features/shelf/ShelfScreen";
import { colors, typography } from "../theme";
import type { MainTab, MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

const tabIcons: Record<MainTab, { idle: IconName; active: IconName }> = {
  Home: { idle: "home-outline", active: "home" },
  Packs: { idle: "cube-outline", active: "cube" },
  Market: { idle: "storefront-outline", active: "storefront" },
  Portfolio: { idle: "pie-chart-outline", active: "pie-chart" },
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
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { ...typography.caption, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.backgroundSecondary,
          borderTopColor: colors.borderSubtle,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.accent.fill,
          color: colors.textOnAccent,
          fontSize: 11,
        },
        tabBarIcon: ({ color, focused, size }) => (
          <Icon color={color} name={focused ? tabIcons[route.name].active : tabIcons[route.name].idle} size={size} />
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
          tabBarBadge: sealed > 0 ? (sealed > 9 ? "9+" : sealed) : undefined,
          tabBarAccessibilityLabel: sealed > 0
            ? `Portfolio, ${sealed} ${sealed === 1 ? "pack" : "packs"} to open`
            : "Portfolio",
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
