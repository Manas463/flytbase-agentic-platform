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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          commodity: string | null
          company: string
          created_at: string
          domain: string | null
          hq_country: string | null
          icp_score: number | null
          id: string
          latam_sites: string | null
          ops_evidence: string | null
          ownership_flags: string | null
          run_id: string
          scale_evidence: string | null
          sources: Json | null
          why_fit_vs_anchor: string | null
        }
        Insert: {
          commodity?: string | null
          company: string
          created_at?: string
          domain?: string | null
          hq_country?: string | null
          icp_score?: number | null
          id?: string
          latam_sites?: string | null
          ops_evidence?: string | null
          ownership_flags?: string | null
          run_id: string
          scale_evidence?: string | null
          sources?: Json | null
          why_fit_vs_anchor?: string | null
        }
        Update: {
          commodity?: string | null
          company?: string
          created_at?: string
          domain?: string | null
          hq_country?: string | null
          icp_score?: number | null
          id?: string
          latam_sites?: string | null
          ops_evidence?: string | null
          ownership_flags?: string | null
          run_id?: string
          scale_evidence?: string | null
          sources?: Json | null
          why_fit_vs_anchor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string
          company_domain: string | null
          created_at: string
          email: string | null
          email_confidence: string | null
          email_deliverable: boolean | null
          email_source: string | null
          email_status: string | null
          email_verified_status: string | null
          evidence_source: string | null
          id: string
          linkedin_url: string | null
          name: string | null
          notes: string | null
          role_match: string | null
          run_id: string
          seniority: string | null
          title: string | null
        }
        Insert: {
          account_id: string
          company_domain?: string | null
          created_at?: string
          email?: string | null
          email_confidence?: string | null
          email_deliverable?: boolean | null
          email_source?: string | null
          email_status?: string | null
          email_verified_status?: string | null
          evidence_source?: string | null
          id?: string
          linkedin_url?: string | null
          name?: string | null
          notes?: string | null
          role_match?: string | null
          run_id: string
          seniority?: string | null
          title?: string | null
        }
        Update: {
          account_id?: string
          company_domain?: string | null
          created_at?: string
          email?: string | null
          email_confidence?: string | null
          email_deliverable?: boolean | null
          email_source?: string | null
          email_status?: string | null
          email_verified_status?: string | null
          evidence_source?: string | null
          id?: string
          linkedin_url?: string | null
          name?: string | null
          notes?: string | null
          role_match?: string | null
          run_id?: string
          seniority?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          body: string | null
          contact_id: string
          created_at: string
          critic_verdict: string | null
          id: string
          rewritten_after_critic: boolean | null
          run_id: string
          signal_used: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          contact_id: string
          created_at?: string
          critic_verdict?: string | null
          id?: string
          rewritten_after_critic?: boolean | null
          run_id: string
          signal_used?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          contact_id?: string
          created_at?: string
          critic_verdict?: string | null
          id?: string
          rewritten_after_critic?: boolean | null
          run_id?: string
          signal_used?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research: {
        Row: {
          account_id: string
          best_hook: string | null
          best_hook_source: string | null
          company: string | null
          contracted_crew_context: string | null
          created_at: string
          hazard_and_247_context: string | null
          id: string
          operational_footprint: string | null
          recent_news: Json | null
          run_id: string
          sources: Json | null
          tech_or_expansion_signals: Json | null
        }
        Insert: {
          account_id: string
          best_hook?: string | null
          best_hook_source?: string | null
          company?: string | null
          contracted_crew_context?: string | null
          created_at?: string
          hazard_and_247_context?: string | null
          id?: string
          operational_footprint?: string | null
          recent_news?: Json | null
          run_id: string
          sources?: Json | null
          tech_or_expansion_signals?: Json | null
        }
        Update: {
          account_id?: string
          best_hook?: string | null
          best_hook_source?: string | null
          company?: string | null
          contracted_crew_context?: string | null
          created_at?: string
          hazard_and_247_context?: string | null
          id?: string
          operational_footprint?: string | null
          recent_news?: Json | null
          run_id?: string
          sources?: Json | null
          tech_or_expansion_signals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "research_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          accounts_found: number | null
          contacts_not_found: number | null
          contacts_not_found_detail: Json | null
          emails_generated: number | null
          error: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
        }
        Insert: {
          accounts_found?: number | null
          contacts_not_found?: number | null
          contacts_not_found_detail?: Json | null
          emails_generated?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Update: {
          accounts_found?: number | null
          contacts_not_found?: number | null
          contacts_not_found_detail?: Json | null
          emails_generated?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      import_run_results: {
        Args: { p_payload: Json; p_run_id: string }
        Returns: undefined
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
