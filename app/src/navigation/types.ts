export type PackCategory = "TRADING_CARD" | "SNEAKER" | "WATCH";

export type AppStackParamList = {
  Shelf: undefined;
  Drops: undefined;
  Category: { category: PackCategory };
  PackDetail: { packId: string };
  Cart: undefined;
  Wallet: undefined;
  Collection: undefined;
  Listing: { ownedItemId: string };
  Market: undefined;
  Qa: undefined;
};
