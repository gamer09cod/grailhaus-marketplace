import { supabase } from "../../api/supabase";

export async function loadUsername(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const username = data?.username?.trim() ?? "";
  return username.length > 0 ? username : null;
}
