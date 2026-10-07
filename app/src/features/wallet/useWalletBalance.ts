import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { watchTables } from "../../api/live";
import { useAuth } from "../auth/AuthProvider";
import { loadBalanceCents } from "./wallet";

/** The signed-in balance, shared with the wallet screen's cache and kept live by the wallet row. */
export function useWalletBalance() {
  const { session } = useAuth();
  const userId = session?.user.id ?? "";
  const queryClient = useQueryClient();
  const balance = useQuery({
    queryKey: ["wallet", userId],
    queryFn: () => loadBalanceCents(userId),
    enabled: userId.length > 0,
  });

  useEffect(() => {
    if (!userId) {
      return;
    }
    return watchTables(
      "header-wallet",
      [{ table: "wallets", event: "UPDATE", filter: `user_id=eq.${userId}` }],
      () => {
        void queryClient.invalidateQueries({ queryKey: ["wallet", userId] });
      },
    );
  }, [queryClient, userId]);

  return balance;
}
