import { useQuery } from "@tanstack/react-query";

import { loadSealedPacks } from "../../api/reveal";

/** Purchased trading-card packs that are not fully opened yet. */
export function useSealedCount(): number {
  const sealed = useQuery({
    queryKey: ["sealed-packs"],
    queryFn: loadSealedPacks,
    staleTime: 30_000,
  });
  return sealed.data?.length ?? 0;
}
