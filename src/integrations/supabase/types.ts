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
      ai_generations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          instruction: string | null
          job_id: string | null
          kind: string
          model: string | null
          organization_id: string
          result: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          instruction?: string | null
          job_id?: string | null
          kind: string
          model?: string | null
          organization_id: string
          result?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          instruction?: string | null
          job_id?: string | null
          kind?: string
          model?: string | null
          organization_id?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_generations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generations_job_same_org_fkey"
            columns: ["job_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "ai_generations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tool_audit: {
        Row: {
          created_at: string
          duration_ms: number
          id: string
          ok: boolean
          organization_id: string | null
          reason: string | null
          request_id: string
          tool: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          id?: string
          ok: boolean
          organization_id?: string | null
          reason?: string | null
          request_id: string
          tool: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number
          id?: string
          ok?: boolean
          organization_id?: string | null
          reason?: string | null
          request_id?: string
          tool?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_tool_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tool_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          created_at: string
          error_category: string | null
          estimated_cost_usd: number | null
          fallback_used: boolean
          id: string
          input_tokens: number | null
          latency_ms: number
          model: string
          ok: boolean
          organization_id: string | null
          output_tokens: number | null
          provider: string
          request_id: string
          task: string
          tool_calls: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_category?: string | null
          estimated_cost_usd?: number | null
          fallback_used?: boolean
          id?: string
          input_tokens?: number | null
          latency_ms?: number
          model: string
          ok: boolean
          organization_id?: string | null
          output_tokens?: number | null
          provider: string
          request_id: string
          task: string
          tool_calls?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_category?: string | null
          estimated_cost_usd?: number | null
          fallback_used?: boolean
          id?: string
          input_tokens?: number | null
          latency_ms?: number
          model?: string
          ok?: boolean
          organization_id?: string | null
          output_tokens?: number | null
          provider?: string
          request_id?: string
          task?: string
          tool_calls?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          campaign: string | null
          created_at: string
          device: string | null
          event_type: string
          id: string
          metadata: Json
          organization_id: string
          path: string | null
          referrer: string | null
          session_id: string | null
          source: string | null
        }
        Insert: {
          campaign?: string | null
          created_at?: string
          device?: string | null
          event_type: string
          id?: string
          metadata?: Json
          organization_id: string
          path?: string | null
          referrer?: string | null
          session_id?: string | null
          source?: string | null
        }
        Update: {
          campaign?: string | null
          created_at?: string
          device?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          path?: string | null
          referrer?: string | null
          session_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string
          customer_id: string | null
          email: string | null
          ends_at: string
          id: string
          lead_id: string | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          service_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          email?: string | null
          ends_at: string
          id?: string
          lead_id?: string | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          service_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          email?: string | null
          ends_at?: string
          id?: string
          lead_id?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          service_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_same_org_fkey"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_lead_same_org_fkey"
            columns: ["lead_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_same_org_fkey"
            columns: ["service_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          action_type: string
          appointment_id: string | null
          automation_id: string | null
          body: string | null
          created_at: string
          id: string
          lead_id: string | null
          organization_id: string
          recipient: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          step_id: string | null
          subject: string | null
          trigger_event: string
        }
        Insert: {
          action_type: string
          appointment_id?: string | null
          automation_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          organization_id: string
          recipient?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          step_id?: string | null
          subject?: string | null
          trigger_event: string
        }
        Update: {
          action_type?: string
          appointment_id?: string | null
          automation_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          organization_id?: string
          recipient?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          step_id?: string | null
          subject?: string | null
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_appointment_same_org_fkey"
            columns: ["appointment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_automation_same_org_fkey"
            columns: ["automation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "automation_runs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_lead_same_org_fkey"
            columns: ["lead_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "automation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "automation_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_step_same_org_fkey"
            columns: ["step_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "automation_steps"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      automation_steps: {
        Row: {
          action_type: string
          automation_id: string
          body: string | null
          channel: string | null
          created_at: string
          delay_minutes: number
          id: string
          organization_id: string
          sort_order: number
          subject: string | null
        }
        Insert: {
          action_type?: string
          automation_id: string
          body?: string | null
          channel?: string | null
          created_at?: string
          delay_minutes?: number
          id?: string
          organization_id: string
          sort_order?: number
          subject?: string | null
        }
        Update: {
          action_type?: string
          automation_id?: string
          body?: string | null
          channel?: string | null
          created_at?: string
          delay_minutes?: number
          id?: string
          organization_id?: string
          sort_order?: number
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_steps_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_steps_automation_same_org_fkey"
            columns: ["automation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "automation_steps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_steps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          accent_color: string | null
          address: string | null
          awards: string | null
          certifications: string | null
          city: string | null
          created_at: string
          description: string | null
          email: string | null
          font_preference: string | null
          hero_image_url: string | null
          hours: Json
          id: string
          logo_url: string | null
          notification_email: string | null
          notify_on_lead: boolean
          organization_id: string
          owner_email: string | null
          owner_name: string | null
          phone: string | null
          primary_color: string | null
          review_link: string | null
          secondary_color: string | null
          service_area: string | null
          state: string | null
          support_email: string | null
          tagline: string | null
          testimonials: Json
          updated_at: string
          website: string | null
          website_goals: string[]
          years_in_business: number | null
          zip: string | null
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          awards?: string | null
          certifications?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          font_preference?: string | null
          hero_image_url?: string | null
          hours?: Json
          id?: string
          logo_url?: string | null
          notification_email?: string | null
          notify_on_lead?: boolean
          organization_id: string
          owner_email?: string | null
          owner_name?: string | null
          phone?: string | null
          primary_color?: string | null
          review_link?: string | null
          secondary_color?: string | null
          service_area?: string | null
          state?: string | null
          support_email?: string | null
          tagline?: string | null
          testimonials?: Json
          updated_at?: string
          website?: string | null
          website_goals?: string[]
          years_in_business?: number | null
          zip?: string | null
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          awards?: string | null
          certifications?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          font_preference?: string | null
          hero_image_url?: string | null
          hours?: Json
          id?: string
          logo_url?: string | null
          notification_email?: string | null
          notify_on_lead?: boolean
          organization_id?: string
          owner_email?: string | null
          owner_name?: string | null
          phone?: string | null
          primary_color?: string | null
          review_link?: string | null
          secondary_color?: string | null
          service_area?: string | null
          state?: string | null
          support_email?: string | null
          tagline?: string | null
          testimonials?: Json
          updated_at?: string
          website?: string | null
          website_goals?: string[]
          years_in_business?: number | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          code: string
          created_at: string
          id: string
          medium: string | null
          name: string
          organization_id: string
          scans: number
          source: string
          target_path: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          medium?: string | null
          name: string
          organization_id: string
          scans?: number
          source?: string
          target_path?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          medium?: string | null
          name?: string
          organization_id?: string
          scans?: number
          source?: string
          target_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          last_appointment_at: string | null
          name: string
          next_appointment_at: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          tags: string[]
          total_value: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_appointment_at?: string | null
          name: string
          next_appointment_at?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          tags?: string[]
          total_value?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_appointment_at?: string | null
          name?: string
          next_appointment_at?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          tags?: string[]
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_backups: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          label: string | null
          organization_id: string
          restored_at: string | null
          row_counts: Json
          size_bytes: number
          snapshot: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          label?: string | null
          organization_id: string
          restored_at?: string | null
          row_counts?: Json
          size_bytes?: number
          snapshot: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          label?: string | null
          organization_id?: string
          restored_at?: string | null
          row_counts?: Json
          size_bytes?: number
          snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_backups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_backups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      error_events: {
        Row: {
          context: Json
          created_at: string
          duration_ms: number | null
          environment: string
          fingerprint: string
          forwarded: boolean
          id: string
          level: string
          message: string
          organization_id: string | null
          release: string | null
          route: string | null
          source: string
          stack: string | null
          status_code: number | null
        }
        Insert: {
          context?: Json
          created_at?: string
          duration_ms?: number | null
          environment?: string
          fingerprint: string
          forwarded?: boolean
          id?: string
          level?: string
          message: string
          organization_id?: string | null
          release?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          status_code?: number | null
        }
        Update: {
          context?: Json
          created_at?: string
          duration_ms?: number | null
          environment?: string
          fingerprint?: string
          forwarded?: boolean
          id?: string
          level?: string
          message?: string
          organization_id?: string | null
          release?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "error_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_step: string | null
          error_message: string | null
          id: string
          lease_expires_at: string | null
          organization_id: string
          progress: number
          started_at: string | null
          status: string
          steps: Json
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: string | null
          error_message?: string | null
          id?: string
          lease_expires_at?: string | null
          organization_id: string
          progress?: number
          started_at?: string | null
          status?: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step?: string | null
          error_message?: string | null
          id?: string
          lease_expires_at?: string | null
          organization_id?: string
          progress?: number
          started_at?: string | null
          status?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          id: string
          organization_id: string
          period_end: string | null
          period_start: string | null
          provider_invoice_id: string | null
          status: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          provider_invoice_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          provider_invoice_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_queue_state: {
        Row: {
          consecutive_rate_limits: number
          id: string
          last_error: string | null
          last_run_at: string | null
          pause_kind: string | null
          pause_reason: string | null
          paused: boolean
          paused_at: string | null
          updated_at: string
        }
        Insert: {
          consecutive_rate_limits?: number
          id: string
          last_error?: string | null
          last_run_at?: string | null
          pause_kind?: string | null
          pause_reason?: string | null
          paused?: boolean
          paused_at?: string | null
          updated_at?: string
        }
        Update: {
          consecutive_rate_limits?: number
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          pause_kind?: string | null
          pause_reason?: string | null
          paused?: boolean
          paused_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lead_activities: {
        Row: {
          actor_id: string | null
          appointment_id: string | null
          body: string | null
          created_at: string
          id: string
          kind: string
          lead_id: string | null
          metadata: Json
          organization_id: string
        }
        Insert: {
          actor_id?: string | null
          appointment_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          lead_id?: string | null
          metadata?: Json
          organization_id: string
        }
        Update: {
          actor_id?: string | null
          appointment_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string | null
          metadata?: Json
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_appointment_same_org_fkey"
            columns: ["appointment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_same_org_fkey"
            columns: ["lead_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "lead_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_alert_log: {
        Row: {
          created_at: string
          id: string
          kind: string
          lead_id: string | null
          organization_id: string
          reason: string | null
          recipient: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string | null
          organization_id: string
          reason?: string | null
          recipient: string
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string | null
          organization_id?: string
          reason?: string | null
          recipient?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_alert_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_alert_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          campaign: string | null
          city: string | null
          created_at: string
          customer_id: string | null
          email: string | null
          estimated_value: number
          id: string
          last_contacted_at: string | null
          message: string | null
          name: string
          next_follow_up_at: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          service_id: string | null
          service_interest: string | null
          source: string
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          campaign?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          estimated_value?: number
          id?: string
          last_contacted_at?: string | null
          message?: string | null
          name: string
          next_follow_up_at?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          service_id?: string | null
          service_interest?: string | null
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          campaign?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          estimated_value?: number
          id?: string
          last_contacted_at?: string | null
          message?: string | null
          name?: string
          next_follow_up_at?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          service_id?: string | null
          service_interest?: string | null
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_customer_same_org_fkey"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_service_same_org_fkey"
            columns: ["service_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      lifecycle_email_log: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          kind: string
          organization_id: string
          recipient: string | null
          status: string
          window_key: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          organization_id: string
          recipient?: string | null
          status?: string
          window_key: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          organization_id?: string
          recipient?: string | null
          status?: string
          window_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_email_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_email_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_conversions: {
        Row: {
          amount_cents: number | null
          created_at: string
          email: string | null
          event_name: string
          id: string
          industry_slug: string | null
          landing_path: string | null
          metadata: Json
          referrer: string | null
          session_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          email?: string | null
          event_name: string
          id?: string
          industry_slug?: string | null
          landing_path?: string | null
          metadata?: Json
          referrer?: string | null
          session_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          email?: string | null
          event_name?: string
          id?: string
          industry_slug?: string | null
          landing_path?: string | null
          metadata?: Json
          referrer?: string | null
          session_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_id?: string | null
        }
        Relationships: []
      }
      media: {
        Row: {
          alt_text: string | null
          category: string | null
          created_at: string
          file_name: string | null
          id: string
          organization_id: string
          size_bytes: number | null
          url: string
        }
        Insert: {
          alt_text?: string | null
          category?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          organization_id: string
          size_bytes?: number | null
          url: string
        }
        Update: {
          alt_text?: string | null
          category?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          organization_id?: string
          size_bytes?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          kind: string
          link: string | null
          organization_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          link?: string | null
          organization_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          link?: string | null
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_config: {
        Row: {
          created_at: string
          full_access_days: number
          id: string
          monthly_price: number
          setup_price: number
          trial_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          full_access_days?: number
          id: string
          monthly_price: number
          setup_price: number
          trial_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          full_access_days?: number
          id?: string
          monthly_price?: number
          setup_price?: number
          trial_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      onboarding_drafts: {
        Row: {
          created_at: string
          data: Json
          step: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          step?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          step?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          conversion_goal: Database["public"]["Enums"]["conversion_goal"] | null
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          is_demo: boolean
          is_suspended: boolean
          name: string
          onboarding_completed: boolean
          onboarding_step: number
          plan_id: string | null
          portal_code: string | null
          setup_checkout_session_id: string | null
          setup_paid_at: string | null
          setup_payment_status: string
          slug: string
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          conversion_goal?:
            | Database["public"]["Enums"]["conversion_goal"]
            | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          is_suspended?: boolean
          name: string
          onboarding_completed?: boolean
          onboarding_step?: number
          plan_id?: string | null
          portal_code?: string | null
          setup_checkout_session_id?: string | null
          setup_paid_at?: string | null
          setup_payment_status?: string
          slug: string
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          conversion_goal?:
            | Database["public"]["Enums"]["conversion_goal"]
            | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          is_suspended?: boolean
          name?: string
          onboarding_completed?: boolean
          onboarding_step?: number
          plan_id?: string | null
          portal_code?: string | null
          setup_checkout_session_id?: string | null
          setup_paid_at?: string | null
          setup_payment_status?: string
          slug?: string
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          organization_id: string | null
          payload: Json
          payment_id: string | null
          processed: boolean
          provider: string
          provider_event_id: string
          resource_id: string | null
          verification_status: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          organization_id?: string | null
          payload?: Json
          payment_id?: string | null
          processed?: boolean
          provider?: string
          provider_event_id: string
          resource_id?: string | null
          verification_status?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string | null
          payload?: Json
          payment_id?: string | null
          processed?: boolean
          provider?: string
          provider_event_id?: string
          resource_id?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_products: {
        Row: {
          amount: number
          billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          created_at: string
          currency: string
          description: string | null
          entitlement_key: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["payment_product_kind"]
          name: string
          plan_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          amount: number
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          created_at?: string
          currency?: string
          description?: string | null
          entitlement_key?: string | null
          id: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["payment_product_kind"]
          name: string
          plan_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          created_at?: string
          currency?: string
          description?: string | null
          entitlement_key?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["payment_product_kind"]
          name?: string
          plan_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_products_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          currency: string
          customer_email: string | null
          description: string | null
          entitlement_applied: boolean
          environment: string
          failure_reason: string | null
          id: string
          metadata: Json
          organization_id: string
          payment_provider: string
          period_end: string | null
          period_start: string | null
          plan_id: string | null
          product_id: string | null
          provider_subscription_id: string | null
          refund_status: string | null
          refunded_amount: number
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          description?: string | null
          entitlement_applied?: boolean
          environment?: string
          failure_reason?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          payment_provider?: string
          period_end?: string | null
          period_start?: string | null
          plan_id?: string | null
          product_id?: string | null
          provider_subscription_id?: string | null
          refund_status?: string | null
          refunded_amount?: number
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          description?: string | null
          entitlement_applied?: boolean
          environment?: string
          failure_reason?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          payment_provider?: string
          period_end?: string | null
          period_start?: string | null
          plan_id?: string | null
          product_id?: string | null
          provider_subscription_id?: string | null
          refund_status?: string | null
          refunded_amount?: number
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "payment_products"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_entitlements: {
        Row: {
          created_at: string
          feature_key: string
          id: string
          limit_value: number | null
          plan_id: string
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: string
          limit_value?: number | null
          plan_id: string
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: string
          limit_value?: number | null
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          annual_price: number
          created_at: string
          features: string[]
          id: string
          is_active: boolean
          is_featured: boolean
          monthly_price: number
          name: string
          setup_price: number
          sort_order: number
          stripe_annual_price_id: string | null
          stripe_monthly_price_id: string | null
          stripe_setup_price_id: string | null
          tagline: string | null
          updated_at: string
        }
        Insert: {
          annual_price?: number
          created_at?: string
          features?: string[]
          id: string
          is_active?: boolean
          is_featured?: boolean
          monthly_price?: number
          name: string
          setup_price?: number
          sort_order?: number
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          stripe_setup_price_id?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          annual_price?: number
          created_at?: string
          features?: string[]
          id?: string
          is_active?: boolean
          is_featured?: boolean
          monthly_price?: number
          name?: string
          setup_price?: number
          sort_order?: number
          stripe_annual_price_id?: string | null
          stripe_monthly_price_id?: string | null
          stripe_setup_price_id?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_accounts: {
        Row: {
          created_at: string
          first_landing_path: string | null
          first_referrer: string | null
          first_utm_campaign: string | null
          first_utm_source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          first_landing_path?: string | null
          first_referrer?: string | null
          first_utm_campaign?: string | null
          first_utm_source?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          first_landing_path?: string | null
          first_referrer?: string | null
          first_utm_campaign?: string | null
          first_utm_source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          ga_measurement_id: string | null
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ga_measurement_id?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ga_measurement_id?: string | null
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_trials: {
        Row: {
          converted_at: string | null
          created_at: string
          id: string
          kind: string
          organization_id: string
          started_at: string
          started_by: string | null
          trial_ends_at: string
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          organization_id: string
          started_at?: string
          started_by?: string | null
          trial_ends_at: string
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          id?: string
          kind?: string
          organization_id?: string
          started_at?: string
          started_by?: string | null
          trial_ends_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_trials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_trials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quote_addons: {
        Row: {
          created_at: string
          description: string | null
          form_id: string
          id: string
          label: string
          organization_id: string
          price: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          form_id: string
          id?: string
          label: string
          organization_id: string
          price?: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          form_id?: string
          id?: string
          label?: string
          organization_id?: string
          price?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_addons_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "quote_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_addons_form_same_org_fkey"
            columns: ["form_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quote_forms"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quote_addons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_addons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_forms: {
        Row: {
          base_price: number
          created_at: string
          id: string
          is_active: boolean
          max_price: number
          min_price: number
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          base_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_price?: number
          min_price?: number
          name?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_price?: number
          min_price?: number
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_options: {
        Row: {
          created_at: string
          id: string
          label: string
          modifier_type: string
          organization_id: string
          price_modifier: number
          question_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          modifier_type?: string
          organization_id: string
          price_modifier?: number
          question_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          modifier_type?: string
          organization_id?: string
          price_modifier?: number
          question_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_options_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_options_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quote_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_options_question_same_org_fkey"
            columns: ["question_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quote_questions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      quote_questions: {
        Row: {
          created_at: string
          form_id: string
          helper_text: string | null
          id: string
          label: string
          organization_id: string
          question_type: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          form_id: string
          helper_text?: string | null
          id?: string
          label: string
          organization_id: string
          question_type?: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          form_id?: string
          helper_text?: string | null
          id?: string
          label?: string
          organization_id?: string
          question_type?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_questions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "quote_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_questions_form_same_org_fkey"
            columns: ["form_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quote_forms"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quote_questions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_questions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          answers: Json
          created_at: string
          estimate_max: number
          estimate_min: number
          form_id: string | null
          id: string
          lead_id: string | null
          organization_id: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          estimate_max?: number
          estimate_min?: number
          form_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          estimate_max?: number
          estimate_min?: number
          form_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_requests_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "quote_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_form_same_org_fkey"
            columns: ["form_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quote_forms"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quote_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_lead_same_org_fkey"
            columns: ["lead_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quote_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          appointment_id: string | null
          author_name: string
          comment: string | null
          created_at: string
          customer_id: string | null
          id: string
          is_published: boolean
          organization_id: string
          private_feedback: string | null
          rating: number
        }
        Insert: {
          appointment_id?: string | null
          author_name: string
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_published?: boolean
          organization_id: string
          private_feedback?: string | null
          rating?: number
        }
        Update: {
          appointment_id?: string | null
          author_name?: string
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_published?: boolean
          organization_id?: string
          private_feedback?: string | null
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_appointment_same_org_fkey"
            columns: ["appointment_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_customer_same_org_fkey"
            columns: ["customer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          bookable: boolean
          category: string | null
          created_at: string
          description: string | null
          duration_minutes: number
          featured: boolean
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          organization_id: string
          price: number | null
          sort_order: number
          starting_price: number | null
          updated_at: string
        }
        Insert: {
          bookable?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          featured?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          organization_id: string
          price?: number | null
          sort_order?: number
          starting_price?: number | null
          updated_at?: string
        }
        Update: {
          bookable?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          featured?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          organization_id?: string
          price?: number | null
          sort_order?: number
          starting_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_profiles: {
        Row: {
          created_at: string
          facebook: string | null
          google_business: string | null
          id: string
          instagram: string | null
          linkedin: string | null
          organization_id: string
          tiktok: string | null
          updated_at: string
          youtube: string | null
        }
        Insert: {
          created_at?: string
          facebook?: string | null
          google_business?: string | null
          id?: string
          instagram?: string | null
          linkedin?: string | null
          organization_id: string
          tiktok?: string | null
          updated_at?: string
          youtube?: string | null
        }
        Update: {
          created_at?: string
          facebook?: string | null
          google_business?: string | null
          id?: string
          instagram?: string | null
          linkedin?: string | null
          organization_id?: string
          tiktok?: string | null
          updated_at?: string
          youtube?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          organization_id: string
          payment_provider: string
          plan_id: string | null
          price_id: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          trial_start: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          organization_id: string
          payment_provider?: string
          plan_id?: string | null
          price_id?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          organization_id?: string
          payment_provider?: string
          plan_id?: string | null
          price_id?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_sessions: {
        Row: {
          admin_email: string | null
          admin_id: string
          ended_at: string | null
          id: string
          organization_id: string
          reason: string | null
          started_at: string
        }
        Insert: {
          admin_email?: string | null
          admin_id: string
          ended_at?: string | null
          id?: string
          organization_id: string
          reason?: string | null
          started_at?: string
        }
        Update: {
          admin_email?: string | null
          admin_id?: string
          ended_at?: string | null
          id?: string
          organization_id?: string
          reason?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["platform_role"]
          user_id?: string
        }
        Relationships: []
      }
      website_components: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_visible: boolean
          kind: string
          label: string | null
          link_label: string | null
          link_url: string | null
          media_url: string | null
          organization_id: string
          section_id: string
          settings: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          kind?: string
          label?: string | null
          link_label?: string | null
          link_url?: string | null
          media_url?: string | null
          organization_id: string
          section_id: string
          settings?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          kind?: string
          label?: string | null
          link_label?: string | null
          link_url?: string | null
          media_url?: string | null
          organization_id?: string
          section_id?: string
          settings?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_components_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_components_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_components_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "website_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_components_section_same_org_fkey"
            columns: ["section_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "website_sections"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      website_pages: {
        Row: {
          created_at: string
          id: string
          is_visible: boolean
          kind: string
          noindex: boolean
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          organization_id: string
          seo_canonical: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_visible?: boolean
          kind?: string
          noindex?: boolean
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          organization_id: string
          seo_canonical?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_visible?: boolean
          kind?: string
          noindex?: boolean
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          organization_id?: string
          seo_canonical?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      website_preview_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          label: string | null
          last_viewed_at: string | null
          organization_id: string
          revoked: boolean
          token: string
          updated_at: string
          views: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          label?: string | null
          last_viewed_at?: string | null
          organization_id: string
          revoked?: boolean
          token: string
          updated_at?: string
          views?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          label?: string | null
          last_viewed_at?: string | null
          organization_id?: string
          revoked?: boolean
          token?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "website_preview_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_preview_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      website_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          created_by: string | null
          details: string | null
          id: string
          kind: string
          organization_id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          kind?: string
          organization_id: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          kind?: string
          organization_id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      website_sections: {
        Row: {
          body: string | null
          created_at: string
          heading: string | null
          id: string
          is_visible: boolean
          kind: string
          organization_id: string
          page_id: string
          settings: Json
          sort_order: number
          subheading: string | null
          updated_at: string
          variant: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          heading?: string | null
          id?: string
          is_visible?: boolean
          kind: string
          organization_id: string
          page_id: string
          settings?: Json
          sort_order?: number
          subheading?: string | null
          updated_at?: string
          variant?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          heading?: string | null
          id?: string
          is_visible?: boolean
          kind?: string
          organization_id?: string
          page_id?: string
          settings?: Json
          sort_order?: number
          subheading?: string | null
          updated_at?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_sections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_sections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_sections_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "website_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_sections_page_same_org_fkey"
            columns: ["page_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "website_pages"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      website_settings: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          custom_domain: string | null
          dns_ok: boolean
          domain_checked_at: string | null
          domain_error: string | null
          domain_force_https: boolean
          domain_primary_host: string
          domain_records: Json
          domain_seo_report: Json
          domain_status: Database["public"]["Enums"]["domain_status"]
          domain_target: string | null
          domain_transfer: Json
          domain_verified: boolean
          email_forwarding: Json
          generated_at: string | null
          generation: Json
          id: string
          last_published_at: string | null
          organization_id: string
          pages: Json
          publish_state: Database["public"]["Enums"]["publish_state"]
          published: boolean
          review_state: string
          revora_host_checked_at: string | null
          revora_host_ok: boolean
          seo: Json
          ssl_active: boolean
          ssl_checked_at: string | null
          ssl_detail: string | null
          ssl_issued_at: string | null
          ssl_last_ok_at: string | null
          ssl_ok: boolean
          template: string
          traffic_alerts_enabled: boolean
          traffic_checked_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          custom_domain?: string | null
          dns_ok?: boolean
          domain_checked_at?: string | null
          domain_error?: string | null
          domain_force_https?: boolean
          domain_primary_host?: string
          domain_records?: Json
          domain_seo_report?: Json
          domain_status?: Database["public"]["Enums"]["domain_status"]
          domain_target?: string | null
          domain_transfer?: Json
          domain_verified?: boolean
          email_forwarding?: Json
          generated_at?: string | null
          generation?: Json
          id?: string
          last_published_at?: string | null
          organization_id: string
          pages?: Json
          publish_state?: Database["public"]["Enums"]["publish_state"]
          published?: boolean
          review_state?: string
          revora_host_checked_at?: string | null
          revora_host_ok?: boolean
          seo?: Json
          ssl_active?: boolean
          ssl_checked_at?: string | null
          ssl_detail?: string | null
          ssl_issued_at?: string | null
          ssl_last_ok_at?: string | null
          ssl_ok?: boolean
          template?: string
          traffic_alerts_enabled?: boolean
          traffic_checked_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          custom_domain?: string | null
          dns_ok?: boolean
          domain_checked_at?: string | null
          domain_error?: string | null
          domain_force_https?: boolean
          domain_primary_host?: string
          domain_records?: Json
          domain_seo_report?: Json
          domain_status?: Database["public"]["Enums"]["domain_status"]
          domain_target?: string | null
          domain_transfer?: Json
          domain_verified?: boolean
          email_forwarding?: Json
          generated_at?: string | null
          generation?: Json
          id?: string
          last_published_at?: string | null
          organization_id?: string
          pages?: Json
          publish_state?: Database["public"]["Enums"]["publish_state"]
          published?: boolean
          review_state?: string
          revora_host_checked_at?: string | null
          revora_host_ok?: boolean
          seo?: Json
          ssl_active?: boolean
          ssl_checked_at?: string | null
          ssl_detail?: string | null
          ssl_issued_at?: string | null
          ssl_last_ok_at?: string | null
          ssl_ok?: boolean
          template?: string
          traffic_alerts_enabled?: boolean
          traffic_checked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      website_versions: {
        Row: {
          created_at: string
          created_by: string | null
          generation: Json
          id: string
          label: string | null
          organization_id: string
          pages: Json
          published_at: string | null
          seo: Json
          template: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          generation?: Json
          id?: string
          label?: string | null
          organization_id: string
          pages?: Json
          published_at?: string | null
          seo?: Json
          template?: string | null
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          generation?: Json
          id?: string
          label?: string | null
          organization_id?: string
          pages?: Json
          published_at?: string | null
          seo?: Json
          template?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "website_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      website_visual_reports: {
        Row: {
          id: string
          measured_at: string
          measurements: Json
          organization_id: string
          page_slug: string | null
          page_url: string
          report: Json
        }
        Insert: {
          id?: string
          measured_at?: string
          measurements: Json
          organization_id: string
          page_slug?: string | null
          page_url: string
          report: Json
        }
        Update: {
          id?: string
          measured_at?: string
          measurements?: Json
          organization_id?: string
          page_slug?: string | null
          page_url?: string
          report?: Json
        }
        Relationships: [
          {
            foreignKeyName: "website_visual_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_visual_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_business_profiles: {
        Row: {
          accent_color: string | null
          address: string | null
          city: string | null
          description: string | null
          email: string | null
          font_preference: string | null
          hero_image_url: string | null
          hours: Json | null
          id: string | null
          logo_url: string | null
          organization_id: string | null
          phone: string | null
          primary_color: string | null
          review_link: string | null
          secondary_color: string | null
          service_area: string | null
          state: string | null
          tagline: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          city?: string | null
          description?: string | null
          email?: string | null
          font_preference?: string | null
          hero_image_url?: string | null
          hours?: Json | null
          id?: string | null
          logo_url?: string | null
          organization_id?: string | null
          phone?: string | null
          primary_color?: string | null
          review_link?: string | null
          secondary_color?: string | null
          service_area?: string | null
          state?: string | null
          tagline?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          city?: string | null
          description?: string | null
          email?: string | null
          font_preference?: string | null
          hero_image_url?: string | null
          hours?: Json | null
          id?: string | null
          logo_url?: string | null
          organization_id?: string | null
          phone?: string | null
          primary_color?: string | null
          review_link?: string | null
          secondary_color?: string | null
          service_area?: string | null
          state?: string | null
          tagline?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_organizations: {
        Row: {
          id: string | null
          industry: string | null
          is_demo: boolean | null
          name: string | null
          slug: string | null
        }
        Insert: {
          id?: string | null
          industry?: string | null
          is_demo?: boolean | null
          name?: string | null
          slug?: string | null
        }
        Update: {
          id?: string | null
          industry?: string | null
          is_demo?: boolean | null
          name?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      public_reviews: {
        Row: {
          author_name: string | null
          comment: string | null
          created_at: string | null
          id: string | null
          organization_id: string | null
          rating: number | null
        }
        Insert: {
          author_name?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string | null
          organization_id?: string | null
          rating?: number | null
        }
        Update: {
          author_name?: string | null
          comment?: string | null
          created_at?: string | null
          id?: string | null
          organization_id?: string | null
          rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_website_settings: {
        Row: {
          created_at: string | null
          custom_domain: string | null
          generation: Json | null
          id: string | null
          last_published_at: string | null
          organization_id: string | null
          pages: Json | null
          publish_state: Database["public"]["Enums"]["publish_state"] | null
          published: boolean | null
          seo: Json | null
          template: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_domain?: string | null
          generation?: Json | null
          id?: string | null
          last_published_at?: string | null
          organization_id?: string | null
          pages?: Json | null
          publish_state?: Database["public"]["Enums"]["publish_state"] | null
          published?: boolean | null
          seo?: Json | null
          template?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_domain?: string | null
          generation?: Json | null
          id?: string | null
          last_published_at?: string | null
          organization_id?: string | null
          pages?: Json | null
          publish_state?: Database["public"]["Enums"]["publish_state"] | null
          published?: boolean | null
          seo?: Json | null
          template?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_safe_link_url: { Args: { value: string }; Returns: boolean }
      org_team_members: {
        Args: { _organization_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          id: string
          role: string
          user_id: string
        }[]
      }
      provision_workspace: {
        Args: {
          _industry?: string
          _name: string
          _profile?: Json
          _trial_days?: number
        }
        Returns: string
      }
      restore_website_state: {
        Args: { _organization_id: string; _snapshot: Json }
        Returns: Json
      }
      submit_public_conversion: {
        Args: {
          _activity?: Json
          _booking?: Json
          _lead: Json
          _notification?: Json
          _organization_id: string
          _quote?: Json
        }
        Returns: Json
      }
      sync_platform_accounts: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "owner" | "admin" | "manager" | "staff" | "viewer"
      appointment_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      billing_interval: "monthly" | "annual"
      conversion_goal:
        | "calls"
        | "quotes"
        | "bookings"
        | "consultations"
        | "purchases"
      domain_status:
        | "not_connected"
        | "dns_pending"
        | "verifying"
        | "connected"
        | "ssl_active"
        | "error"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "quoted"
        | "booked"
        | "completed"
        | "lost"
      payment_product_kind:
        | "one_time"
        | "subscription"
        | "setup_fee"
        | "deposit"
        | "addon"
        | "service"
      payment_status:
        | "created"
        | "pending"
        | "approved"
        | "completed"
        | "failed"
        | "cancelled"
        | "refunded"
        | "partially_refunded"
        | "disputed"
      platform_role: "super_admin"
      publish_state: "draft" | "preview" | "published" | "unpublished"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "suspended"
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
      app_role: ["owner", "admin", "manager", "staff", "viewer"],
      appointment_status: [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      billing_interval: ["monthly", "annual"],
      conversion_goal: [
        "calls",
        "quotes",
        "bookings",
        "consultations",
        "purchases",
      ],
      domain_status: [
        "not_connected",
        "dns_pending",
        "verifying",
        "connected",
        "ssl_active",
        "error",
      ],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "quoted",
        "booked",
        "completed",
        "lost",
      ],
      payment_product_kind: [
        "one_time",
        "subscription",
        "setup_fee",
        "deposit",
        "addon",
        "service",
      ],
      payment_status: [
        "created",
        "pending",
        "approved",
        "completed",
        "failed",
        "cancelled",
        "refunded",
        "partially_refunded",
        "disputed",
      ],
      platform_role: ["super_admin"],
      publish_state: ["draft", "preview", "published", "unpublished"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "suspended",
      ],
    },
  },
} as const
