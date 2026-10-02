export type PackCategory = "TRADING_CARD" | "SNEAKER" | "WATCH";

export type AppStackParamList = {
  Shelf: undefined;
  Category: { category: PackCategory };
  PackDetail: { packId: string };
  Wallet: undefined;
};
