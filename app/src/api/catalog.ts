import { supabase } from "./supabase";

export type CatalogSummary = {
  itemCount: number;
  packCount: number;
};

export async function loadCatalogSummary(): Promise<CatalogSummary> {
  const [items, packs] = await Promise.all([
    supabase.from("catalog_items").select("id", { count: "exact", head: true }),
    supabase.from("pack_skus").select("id", { count: "exact", head: true }),
  ]);

  if (items.error) {
    throw new Error(items.error.message);
  }
  if (packs.error) {
    throw new Error(packs.error.message);
  }

  return {
    itemCount: items.count ?? 0,
    packCount: packs.count ?? 0,
  };
}
