import { supabase } from "./supabase";

export async function applyPriceDrift(): Promise<void> {
  const { error } = await supabase.rpc("apply_price_drift");
  if (error) {
    throw new Error(error.message);
  }
}
