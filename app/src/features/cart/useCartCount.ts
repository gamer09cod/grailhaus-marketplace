import { useQuery } from "@tanstack/react-query";

import { loadCart } from "../../api/cart";

/** Lines in the open cart, read from the cart screen's cache. Null until the cart has loaded once. */
export function useCartCount(): number | null {
  const cart = useQuery({
    queryKey: ["cart"],
    queryFn: loadCart,
    staleTime: 30_000,
  });
  return cart.data ? cart.data.lines.length : null;
}
