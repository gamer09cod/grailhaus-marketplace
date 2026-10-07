import { useCallback, useRef, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";

import { CartRejected, CartUnknown, submitCart } from "../../api/cart";
import type { AppStackParamList } from "../../navigation/types";
import { useOnline } from "../shelf/useOnline";
import type { MarketListing } from "./board";

export type AddListingAfter = "stay" | "review";

export function useAddListing() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const queryClient = useQueryClient();
  const online = useOnline();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const addKey = useRef<string | null>(null);
  const pendingId = useRef<string | null>(null);

  const addListing = useCallback((listing: MarketListing, remember: boolean, after: AddListingAfter) => {
    if (!online || listing.isOwn || pending) {
      return;
    }
    const idempotencyKey = remember || !addKey.current ? Crypto.randomUUID() : addKey.current;
    if (remember) {
      addKey.current = idempotencyKey;
    }
    pendingId.current = listing.listingId;
    setPending(true);
    setNotice("Adding to cart…");
    void submitCart({
      action: "addListing",
      listingId: listing.listingId,
      idempotencyKey,
    }).then((snapshot) => {
      addKey.current = null;
      setUnknown(false);
      queryClient.setQueryData(["cart"], snapshot);
      if (after === "review") {
        setNotice(null);
        navigation.navigate("Cart", { startReview: true });
        return;
      }
      setNotice("Added to cart.");
    }).catch((error: unknown) => {
      if (error instanceof CartUnknown) {
        setUnknown(true);
        setNotice("Adding to cart…\n\nThis may have completed.\nWe're checking before retrying.");
        return;
      }
      addKey.current = null;
      setUnknown(false);
      setNotice(error instanceof CartRejected ? error.message : "That listing was not added. Refresh the market and try again.");
    }).finally(() => {
      setPending(false);
    });
  }, [navigation, online, pending, queryClient]);

  const checkAgain = useCallback((listing: MarketListing, after: AddListingAfter) => {
    addListing(listing, false, after);
  }, [addListing]);

  return { online, pending, notice, unknown, addListing, checkAgain };
}
