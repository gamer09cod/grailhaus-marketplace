
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "cart_lines": {
                  Row: {
                    "cart_id": string,"created_at": string,"id": string,"line_type": string,"listing_id": string | null,"pack_sku_id": string | null,"quantity": number,"snapshot_price_cents": number,"updated_at": string
                  }
                  Insert: {
                    "cart_id": string,"created_at"?: string,"id"?: string,"line_type": string,"listing_id"?: string | null,"pack_sku_id"?: string | null,"quantity": number,"snapshot_price_cents": number,"updated_at"?: string
                  }
                  Update: {
                    "cart_id"?: string,"created_at"?: string,"id"?: string,"line_type"?: string,"listing_id"?: string | null,"pack_sku_id"?: string | null,"quantity"?: number,"snapshot_price_cents"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cart_lines_cart_id_fkey"
      columns: ["cart_id"]
isOneToOne: false
      referencedRelation: "carts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_lines_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "marketplace_listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_lines_pack_sku_id_fkey"
      columns: ["pack_sku_id"]
isOneToOne: false
      referencedRelation: "pack_skus"
      referencedColumns: ["id"]
    }
                  ]
                },"cart_reservations": {
                  Row: {
                    "cart_line_id": string,"created_at": string,"expires_at": string,"id": string,"pack_sku_id": string,"quantity": number,"status": string,"user_id": string
                  }
                  Insert: {
                    "cart_line_id": string,"created_at"?: string,"expires_at": string,"id"?: string,"pack_sku_id": string,"quantity": number,"status"?: string,"user_id": string
                  }
                  Update: {
                    "cart_line_id"?: string,"created_at"?: string,"expires_at"?: string,"id"?: string,"pack_sku_id"?: string,"quantity"?: number,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cart_reservations_cart_line_id_fkey"
      columns: ["cart_line_id"]
isOneToOne: false
      referencedRelation: "cart_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_reservations_pack_sku_id_fkey"
      columns: ["pack_sku_id"]
isOneToOne: false
      referencedRelation: "pack_skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_reservations_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"carts": {
                  Row: {
                    "created_at": string,"id": string,"status": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "carts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"catalog_items": {
                  Row: {
                    "base_value_cents": number,"category": string,"created_at": string,"current_value_cents": number,"id": string,"image_url": string | null,"name": string,"rarity": string
                  }
                  Insert: {
                    "base_value_cents": number,"category": string,"created_at"?: string,"current_value_cents": number,"id"?: string,"image_url"?: string | null,"name": string,"rarity": string
                  }
                  Update: {
                    "base_value_cents"?: number,"category"?: string,"created_at"?: string,"current_value_cents"?: number,"id"?: string,"image_url"?: string | null,"name"?: string,"rarity"?: string
                  }
                  Relationships: [
                    
                  ]
                },"drops": {
                  Row: {
                    "created_at": string,"ends_at": string,"id": string,"initial_stock": number,"pack_sku_id": string,"starts_at": string
                  }
                  Insert: {
                    "created_at"?: string,"ends_at": string,"id"?: string,"initial_stock": number,"pack_sku_id": string,"starts_at": string
                  }
                  Update: {
                    "created_at"?: string,"ends_at"?: string,"id"?: string,"initial_stock"?: number,"pack_sku_id"?: string,"starts_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "drops_pack_sku_id_fkey"
      columns: ["pack_sku_id"]
isOneToOne: true
      referencedRelation: "pack_skus"
      referencedColumns: ["id"]
    }
                  ]
                },"idempotency_records": {
                  Row: {
                    "created_at": string,"idempotency_key": string,"operation": string,"response_json": Json | null,"status": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"idempotency_key": string,"operation": string,"response_json"?: Json | null,"status": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"idempotency_key"?: string,"operation"?: string,"response_json"?: Json | null,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "idempotency_records_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"ledger_entries": {
                  Row: {
                    "amount_cents": number,"created_at": string,"entry_type": string,"id": string,"idempotency_key": string | null,"metadata": NonNullable<Json>,"reference_id": string | null,"reference_type": string | null,"user_id": string | null
                  }
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"entry_type": string,"id"?: string,"idempotency_key"?: string | null,"metadata"?: NonNullable<Json>,"reference_id"?: string | null,"reference_type"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"entry_type"?: string,"id"?: string,"idempotency_key"?: string | null,"metadata"?: NonNullable<Json>,"reference_id"?: string | null,"reference_type"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"marketplace_listings": {
                  Row: {
                    "created_at": string,"id": string,"owned_item_id": string,"price_cents": number,"seller_id": string,"sold_at": string | null,"status": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"owned_item_id": string,"price_cents": number,"seller_id": string,"sold_at"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"owned_item_id"?: string,"price_cents"?: number,"seller_id"?: string,"sold_at"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_listings_owned_item_id_fkey"
      columns: ["owned_item_id"]
isOneToOne: false
      referencedRelation: "owned_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketplace_listings_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"owned_items": {
                  Row: {
                    "acquired_at": string,"acquisition_price_cents": number,"catalog_item_id": string,"id": string,"owner_id": string,"source_type": string,"state": string
                  }
                  Insert: {
                    "acquired_at"?: string,"acquisition_price_cents": number,"catalog_item_id": string,"id"?: string,"owner_id": string,"source_type": string,"state"?: string
                  }
                  Update: {
                    "acquired_at"?: string,"acquisition_price_cents"?: number,"catalog_item_id"?: string,"id"?: string,"owner_id"?: string,"source_type"?: string,"state"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "owned_items_catalog_item_id_fkey"
      columns: ["catalog_item_id"]
isOneToOne: false
      referencedRelation: "catalog_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "owned_items_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"pack_contents": {
                  Row: {
                    "catalog_item_id": string,"created_at": string,"id": string,"purchased_pack_id": string,"rarity": string,"reveal_order": number
                  }
                  Insert: {
                    "catalog_item_id": string,"created_at"?: string,"id"?: string,"purchased_pack_id": string,"rarity": string,"reveal_order": number
                  }
                  Update: {
                    "catalog_item_id"?: string,"created_at"?: string,"id"?: string,"purchased_pack_id"?: string,"rarity"?: string,"reveal_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pack_contents_catalog_item_id_fkey"
      columns: ["catalog_item_id"]
isOneToOne: false
      referencedRelation: "catalog_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pack_contents_purchased_pack_id_fkey"
      columns: ["purchased_pack_id"]
isOneToOne: false
      referencedRelation: "purchased_packs"
      referencedColumns: ["id"]
    }
                  ]
                },"pack_odds": {
                  Row: {
                    "id": string,"pack_sku_id": string,"probability_basis_points": number,"rarity": string
                  }
                  Insert: {
                    "id"?: string,"pack_sku_id": string,"probability_basis_points": number,"rarity": string
                  }
                  Update: {
                    "id"?: string,"pack_sku_id"?: string,"probability_basis_points"?: number,"rarity"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pack_odds_pack_sku_id_fkey"
      columns: ["pack_sku_id"]
isOneToOne: false
      referencedRelation: "pack_skus"
      referencedColumns: ["id"]
    }
                  ]
                },"pack_skus": {
                  Row: {
                    "active": boolean,"category": string,"created_at": string,"id": string,"is_drop": boolean,"max_per_user": number | null,"name": string,"price_cents": number,"stock_on_hand": number,"stock_reserved": number,"stock_total": number,"tier": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"category": string,"created_at"?: string,"id"?: string,"is_drop"?: boolean,"max_per_user"?: number | null,"name": string,"price_cents": number,"stock_on_hand": number,"stock_reserved"?: number,"stock_total": number,"tier": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"category"?: string,"created_at"?: string,"id"?: string,"is_drop"?: boolean,"max_per_user"?: number | null,"name"?: string,"price_cents"?: number,"stock_on_hand"?: number,"stock_reserved"?: number,"stock_total"?: number,"tier"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"id": string,"username": string
                  }
                  Insert: {
                    "created_at"?: string,"id": string,"username": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"username"?: string
                  }
                  Relationships: [
                    
                  ]
                },"purchased_packs": {
                  Row: {
                    "created_at": string,"id": string,"pack_sku_id": string,"purchase_id": string,"reveal_state": string,"sequence": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"pack_sku_id": string,"purchase_id": string,"reveal_state"?: string,"sequence": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"pack_sku_id"?: string,"purchase_id"?: string,"reveal_state"?: string,"sequence"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchased_packs_pack_sku_id_fkey"
      columns: ["pack_sku_id"]
isOneToOne: false
      referencedRelation: "pack_skus"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchased_packs_purchase_id_fkey"
      columns: ["purchase_id"]
isOneToOne: false
      referencedRelation: "purchases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchased_packs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"purchases": {
                  Row: {
                    "created_at": string,"id": string,"idempotency_key": string,"status": string,"total_cents": number,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"idempotency_key": string,"status"?: string,"total_cents": number,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"idempotency_key"?: string,"status"?: string,"total_cents"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchases_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"wallets": {
                  Row: {
                    "balance_cents": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "balance_cents"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "balance_cents"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wallets_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "drops_with_status": {
                  Row: {
                    "created_at": string | null,"ends_at": string | null,"id": string | null,"initial_stock": number | null,"pack_sku_id": string | null,"reservable_quantity": number | null,"starts_at": string | null,"status": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "drops_pack_sku_id_fkey"
      columns: ["pack_sku_id"]
isOneToOne: true
      referencedRelation: "pack_skus"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "derive_drop_status":
{ Args: { "ends_at": string,"starts_at": string,"stock_on_hand": number,"stock_reserved": number }; Returns: string
                           },
"marketplace_fee_cents":
{ Args: { "price_cents": number }; Returns: number
                           },
"release_expired_reservations":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"seller_proceeds_cents":
{ Args: { "price_cents": number }; Returns: number
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
