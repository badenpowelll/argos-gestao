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
      absence_justifications: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          date: string
          description: string
          id: string
          type: Database["public"]["Enums"]["absence_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          description?: string
          id?: string
          type: Database["public"]["Enums"]["absence_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          type?: Database["public"]["Enums"]["absence_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_justifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      adjustments: {
        Row: {
          approved_by: string | null
          company_id: string | null
          created_at: string
          date: string
          id: string
          proposed_time: string
          punch_step: string
          reason: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["adjustment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_by?: string | null
          company_id?: string | null
          created_at?: string
          date: string
          id?: string
          proposed_time?: string
          punch_step?: string
          reason: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["adjustment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_by?: string | null
          company_id?: string | null
          created_at?: string
          date?: string
          id?: string
          proposed_time?: string
          punch_step?: string
          reason?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["adjustment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          snapshot_after: Json | null
          snapshot_before: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          snapshot_after?: Json | null
          snapshot_before?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          snapshot_after?: Json | null
          snapshot_before?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          max_users: number
          name: string
          plan: Database["public"]["Enums"]["plan_type"]
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          max_users?: number
          name: string
          plan?: Database["public"]["Enums"]["plan_type"]
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          max_users?: number
          name?: string
          plan?: Database["public"]["Enums"]["plan_type"]
          updated_at?: string
        }
        Relationships: []
      }
      geofences: {
        Row: {
          company_id: string
          created_at: string
          id: string
          latitude: number
          longitude: number
          name: string
          radius: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          name?: string
          radius?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          radius?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hour_bank: {
        Row: {
          balance_minutes: number
          company_id: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_minutes?: number
          company_id?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_minutes?: number
          company_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hour_bank_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string
          email: string | null
          face_template: Json | null
          id: string
          name: string
          phone: string | null
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          face_template?: Json | null
          id?: string
          name?: string
          phone?: string | null
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string | null
          face_template?: Json | null
          id?: string
          name?: string
          phone?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_requests: {
        Row: {
          address_cep: string | null
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          avatar_url: string | null
          company_id: string | null
          created_at: string
          email: string
          id: string
          name: string
          password_temp: string | null
          phone: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          password_temp?: string | null
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          password_temp?: string | null
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_suporte: {
        Row: {
          anexo_url: string | null
          created_at: string
          email_ou_matricula: string
          id: string
          mensagem: string
          modulo_origem: string
          nome: string
          protocolo_argos: string | null
          resposta: string | null
          sincronizado: boolean
          status: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          anexo_url?: string | null
          created_at?: string
          email_ou_matricula?: string
          id?: string
          mensagem: string
          modulo_origem?: string
          nome?: string
          protocolo_argos?: string | null
          resposta?: string | null
          sincronizado?: boolean
          status?: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          anexo_url?: string | null
          created_at?: string
          email_ou_matricula?: string
          id?: string
          mensagem?: string
          modulo_origem?: string
          nome?: string
          protocolo_argos?: string | null
          resposta?: string | null
          sincronizado?: boolean
          status?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          plan: Database["public"]["Enums"]["plan_type"]
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["plan_type"]
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["plan_type"]
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          accuracy: number | null
          company_id: string | null
          created_at: string
          device_id: string | null
          face_image_url: string | null
          face_score: number | null
          id: string
          ip_address: string | null
          latitude: number | null
          longitude: number | null
          mood_score: number | null
          notes: string | null
          status: Database["public"]["Enums"]["punch_status"]
          sync_status: Database["public"]["Enums"]["sync_status"]
          timestamp: string
          type: Database["public"]["Enums"]["punch_type"]
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          company_id?: string | null
          created_at?: string
          device_id?: string | null
          face_image_url?: string | null
          face_score?: number | null
          id?: string
          ip_address?: string | null
          latitude?: number | null
          longitude?: number | null
          mood_score?: number | null
          notes?: string | null
          status?: Database["public"]["Enums"]["punch_status"]
          sync_status?: Database["public"]["Enums"]["sync_status"]
          timestamp?: string
          type: Database["public"]["Enums"]["punch_type"]
          user_id: string
        }
        Update: {
          accuracy?: number | null
          company_id?: string | null
          created_at?: string
          device_id?: string | null
          face_image_url?: string | null
          face_score?: number | null
          id?: string
          ip_address?: string | null
          latitude?: number | null
          longitude?: number | null
          mood_score?: number | null
          notes?: string | null
          status?: Database["public"]["Enums"]["punch_status"]
          sync_status?: Database["public"]["Enums"]["sync_status"]
          timestamp?: string
          type?: Database["public"]["Enums"]["punch_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_schedules: {
        Row: {
          company_id: string
          created_at: string
          daily_hours: number
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          daily_hours?: number
          id?: string
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          daily_hours?: number
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_public_companies: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      get_public_teams: {
        Args: never
        Returns: {
          company_id: string
          id: string
          name: string
        }[]
      }
      get_user_company_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      absence_type:
        | "folga"
        | "feriado_nacional"
        | "feriado_estadual"
        | "feriado_municipal"
      adjustment_status: "pending" | "approved" | "rejected"
      app_role: "owner" | "admin" | "manager" | "employee"
      plan_type: "starter" | "pro" | "enterprise"
      punch_status: "verified" | "outside_perimeter" | "flagged" | "pending"
      punch_type: "in" | "out"
      sync_status: "synced" | "pending" | "failed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      absence_type: [
        "folga",
        "feriado_nacional",
        "feriado_estadual",
        "feriado_municipal",
      ],
      adjustment_status: ["pending", "approved", "rejected"],
      app_role: ["owner", "admin", "manager", "employee"],
      plan_type: ["starter", "pro", "enterprise"],
      punch_status: ["verified", "outside_perimeter", "flagged", "pending"],
      punch_type: ["in", "out"],
      sync_status: ["synced", "pending", "failed"],
    },
  },
} as const
