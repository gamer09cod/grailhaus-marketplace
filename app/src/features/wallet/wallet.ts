import { centsFromWire } from "../../utils/money";
import { supabase } from "../../api/supabase";

export async function loadBalanceCents(userId: string): Promise<bigint> {
  const { data, error } = await supabase
    .from("wallets")
    .select("balance_cents")
    .eq("user_id", userId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return centsFromWire(data.balance_cents);
}
