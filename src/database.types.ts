export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      fuel_grades: {
        Row: {
          aliases: string[] | null
          canonical_name: string
          id: number
        }
        Insert: {
          aliases?: string[] | null
          canonical_name: string
          id?: number
        }
        Update: {
          aliases?: string[] | null
          canonical_name?: string
          id?: number
        }
        Relationships: []
      }
      prescription_items: {
        Row: {
          dosage: string | null
          drug_name: string
          id: number
          prescription_id: number | null
          quantity: number | null
        }
        Insert: {
          dosage?: string | null
          drug_name: string
          id?: number
          prescription_id?: number | null
          quantity?: number | null
        }
        Update: {
          dosage?: string | null
          drug_name?: string
          id?: number
          prescription_id?: number | null
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_items_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          created_at: string | null
          id: number
          patient_name: string | null
          prescriber: string | null
          prescription_date: string | null
          receipt_id: number | null
          store_id: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          patient_name?: string | null
          prescriber?: string | null
          prescription_date?: string | null
          receipt_id?: number | null
          store_id?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          patient_name?: string | null
          prescriber?: string | null
          prescription_date?: string | null
          receipt_id?: number | null
          store_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          currency: string | null
          date_recorded: string | null
          id: number
          is_synthetic: boolean | null
          price: number
          product_id: number | null
          store_id: number | null
          unit_price: number | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          currency?: string | null
          date_recorded?: string | null
          id?: number
          is_synthetic?: boolean | null
          price: number
          product_id?: number | null
          store_id?: number | null
          unit_price?: number | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          currency?: string | null
          date_recorded?: string | null
          id?: number
          is_synthetic?: boolean | null
          price?: number
          product_id?: number | null
          store_id?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          aliases: string[] | null
          canonical_name: string
          category: string | null
          id: number
          typical_unit_price: number | null
          unit_type: string | null
        }
        Insert: {
          aliases?: string[] | null
          canonical_name: string
          category?: string | null
          id?: number
          typical_unit_price?: number | null
          unit_type?: string | null
        }
        Update: {
          aliases?: string[] | null
          canonical_name?: string
          category?: string | null
          id?: number
          typical_unit_price?: number | null
          unit_type?: string | null
        }
        Relationships: []
      }
      receipts: {
        Row: {
          created_at: string | null
          fraud_flag: boolean | null
          id: number
          image_type: string | null
          image_url: string | null
          receipt_category: string | null
          receipt_date: string | null
          receipt_hash: string | null
          source: string | null
          store_id: number | null
          total: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          fraud_flag?: boolean | null
          id?: number
          image_type?: string | null
          image_url?: string | null
          receipt_category?: string | null
          receipt_date?: string | null
          receipt_hash?: string | null
          source?: string | null
          store_id?: number | null
          total?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          fraud_flag?: boolean | null
          id?: number
          image_type?: string | null
          image_url?: string | null
          receipt_category?: string | null
          receipt_date?: string | null
          receipt_hash?: string | null
          source?: string | null
          store_id?: number | null
          total?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          added_at: string | null
          id: number
          is_recurring: boolean | null
          product_id: number | null
          quantity: number | null
          quantity_requested: number | null
          raw_name: string | null
          user_id: string | null
        }
        Insert: {
          added_at?: string | null
          id?: number
          is_recurring?: boolean | null
          product_id?: number | null
          quantity?: number | null
          quantity_requested?: number | null
          raw_name?: string | null
          user_id?: string | null
        }
        Update: {
          added_at?: string | null
          id?: number
          is_recurring?: boolean | null
          product_id?: number | null
          quantity?: number | null
          quantity_requested?: number | null
          raw_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          branch: string | null
          id: number
          is_synthetic: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          parish: string | null
          place_id: string | null
          store_type: string | null
        }
        Insert: {
          branch?: string | null
          id?: number
          is_synthetic?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          parish?: string | null
          place_id?: string | null
          store_type?: string | null
        }
        Update: {
          branch?: string | null
          id?: number
          is_synthetic?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          parish?: string | null
          place_id?: string | null
          store_type?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          diet_preference: string | null
          display_name: string | null
          family_size: number | null
          id: string
          is_admin: boolean | null
          last_upload_at: string | null
          parish: string | null
          points: number | null
          streak_days: number | null
          telegram_chat_id: string | null
          tier: string | null
          weekly_budget: number | null
        }
        Insert: {
          created_at?: string | null
          diet_preference?: string | null
          display_name?: string | null
          family_size?: number | null
          id: string
          is_admin?: boolean | null
          last_upload_at?: string | null
          parish?: string | null
          points?: number | null
          streak_days?: number | null
          telegram_chat_id?: string | null
          tier?: string | null
          weekly_budget?: number | null
        }
        Update: {
          created_at?: string | null
          diet_preference?: string | null
          display_name?: string | null
          family_size?: number | null
          id?: string
          is_admin?: boolean | null
          last_upload_at?: string | null
          parish?: string | null
          points?: number | null
          streak_days?: number | null
          telegram_chat_id?: string | null
          tier?: string | null
          weekly_budget?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
