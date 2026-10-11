import type { NavigatorScreenParams } from "@react-navigation/native";

import type { OrderSummaryParams } from "../features/cart/orderSummary";

export type PackCategory = "TRADING_CARD" | "SNEAKER" | "WATCH";

export type MainTabParamList = {
  Home: undefined;
  Packs: undefined;
  Market: { category?: PackCategory } | undefined;
  Portfolio: undefined;
  Profile: undefined;
};

export type MainTab = keyof MainTabParamList;

export type AppStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Drops: undefined;
  Category: { category: PackCategory };
  PackDetail: { packId: string };
  MarketDetail: { listingId: string };
  Cart: undefined;
  OrderSummary: OrderSummaryParams;
  Wallet: undefined;
  Listing: { ownedItemId: string };
  Qa: undefined;
  Admin: undefined;
  Reveal: { purchasedPackIds: string[] };
  Activity: undefined;
  Purchases: undefined;
  Support: undefined;
};
