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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      auth_email_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          ip: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          ip?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          ip?: string | null
        }
        Relationships: []
      }
      boutique_send_backs: {
        Row: {
          created_at: string
          id: string
          items: Json
          notes: string | null
          order_id: string
          reason: string
          return_request_id: string | null
          status: string
          updated_at: string
          vendor_id: string
          vendor_order_id: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          notes?: string | null
          order_id: string
          reason: string
          return_request_id?: string | null
          status?: string
          updated_at?: string
          vendor_id: string
          vendor_order_id?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          notes?: string | null
          order_id?: string
          reason?: string
          return_request_id?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
          vendor_order_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boutique_send_backs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boutique_send_backs_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boutique_send_backs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boutique_send_backs_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boutique_send_backs_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          hsn_code_id: string | null
          id: string
          image_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hsn_code_id?: string | null
          id?: string
          image_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hsn_code_id?: string | null
          id?: string
          image_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_hsn_code_id_fkey"
            columns: ["hsn_code_id"]
            isOneToOne: false
            referencedRelation: "hsn_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          category_ids: string[] | null
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          min_order_amount: number | null
          name: string
          product_ids: string[] | null
          starts_at: string | null
          updated_at: string
          used_count: number
          vendor_id: string | null
        }
        Insert: {
          category_ids?: string[] | null
          code: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount?: number | null
          name: string
          product_ids?: string[] | null
          starts_at?: string | null
          updated_at?: string
          used_count?: number
          vendor_id?: string | null
        }
        Update: {
          category_ids?: string[] | null
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_order_amount?: number | null
          name?: string
          product_ids?: string[] | null
          starts_at?: string | null
          updated_at?: string
          used_count?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discounts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string | null
          payment_id: string | null
          razorpay_dispute_id: string
          reason_code: string | null
          respond_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id?: string | null
          payment_id?: string | null
          razorpay_dispute_id: string
          reason_code?: string | null
          respond_by?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string | null
          payment_id?: string | null
          razorpay_dispute_id?: string
          reason_code?: string | null
          respond_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_invoice_series: {
        Row: {
          fiscal_year: string
          last_serial: number
        }
        Insert: {
          fiscal_year: string
          last_serial?: number
        }
        Update: {
          fiscal_year?: string
          last_serial?: number
        }
        Relationships: []
      }
      fee_invoices: {
        Row: {
          cgst_amount: number
          commission_amount: number
          founding_waiver: boolean
          gst_rate: number
          id: string
          igst_amount: number
          invoice_number: string
          issued_at: string
          order_count: number
          payout_date: string
          period_end: string | null
          period_start: string | null
          product_value: number
          recipient_address: Json | null
          recipient_gstin: string | null
          recipient_legal_name: string | null
          recipient_name: string
          recipient_pan: string | null
          recipient_state_code: string | null
          sac_code: string
          sgst_amount: number
          supplier_cin: string
          supplier_gstin: string
          supplier_name: string
          supplier_state_code: string
          supply_type: string
          taxable_value: number
          tech_fee_amount: number
          total: number
          vendor_id: string
          vendor_order_ids: string[]
        }
        Insert: {
          cgst_amount?: number
          commission_amount: number
          founding_waiver?: boolean
          gst_rate: number
          id?: string
          igst_amount?: number
          invoice_number: string
          issued_at?: string
          order_count: number
          payout_date: string
          period_end?: string | null
          period_start?: string | null
          product_value: number
          recipient_address?: Json | null
          recipient_gstin?: string | null
          recipient_legal_name?: string | null
          recipient_name: string
          recipient_pan?: string | null
          recipient_state_code?: string | null
          sac_code: string
          sgst_amount?: number
          supplier_cin: string
          supplier_gstin: string
          supplier_name: string
          supplier_state_code: string
          supply_type: string
          taxable_value: number
          tech_fee_amount: number
          total: number
          vendor_id: string
          vendor_order_ids: string[]
        }
        Update: {
          cgst_amount?: number
          commission_amount?: number
          founding_waiver?: boolean
          gst_rate?: number
          id?: string
          igst_amount?: number
          invoice_number?: string
          issued_at?: string
          order_count?: number
          payout_date?: string
          period_end?: string | null
          period_start?: string | null
          product_value?: number
          recipient_address?: Json | null
          recipient_gstin?: string | null
          recipient_legal_name?: string | null
          recipient_name?: string
          recipient_pan?: string | null
          recipient_state_code?: string | null
          sac_code?: string
          sgst_amount?: number
          supplier_cin?: string
          supplier_gstin?: string
          supplier_name?: string
          supplier_state_code?: string
          supply_type?: string
          taxable_value?: number
          tech_fee_amount?: number
          total?: number
          vendor_id?: string
          vendor_order_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "fee_invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_sales: {
        Row: {
          created_at: string
          description: string | null
          discount_percentage: number
          ends_at: string
          id: string
          is_active: boolean
          name: string
          product_ids: string[]
          starts_at: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_percentage?: number
          ends_at: string
          id?: string
          is_active?: boolean
          name: string
          product_ids?: string[]
          starts_at: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_percentage?: number
          ends_at?: string
          id?: string
          is_active?: boolean
          name?: string
          product_ids?: string[]
          starts_at?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flash_sales_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          code: string
          created_at: string
          current_balance: number
          expires_at: string | null
          id: string
          initial_balance: number
          is_active: boolean
          message: string | null
          purchaser_user_id: string | null
          recipient_email: string | null
          recipient_name: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          current_balance: number
          expires_at?: string | null
          id?: string
          initial_balance: number
          is_active?: boolean
          message?: string | null
          purchaser_user_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          current_balance?: number
          expires_at?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean
          message?: string | null
          purchaser_user_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hsn_codes: {
        Row: {
          code: string
          created_at: string
          description: string
          gst_rate: number
          gst_rate_above_limit: number | null
          id: string
          is_active: boolean
          price_limit: number | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          gst_rate: number
          gst_rate_above_limit?: number | null
          id?: string
          is_active?: boolean
          price_limit?: number | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          gst_rate?: number
          gst_rate_above_limit?: number | null
          id?: string
          is_active?: boolean
          price_limit?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      indian_states: {
        Row: {
          gst_code: string
          name: string
        }
        Insert: {
          gst_code: string
          name: string
        }
        Update: {
          gst_code?: string
          name?: string
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          cgst_amount: number
          color: string | null
          description: string
          discount: number
          gst_rate: number
          hsn_code: string | null
          id: string
          igst_amount: number
          invoice_id: string
          line_no: number
          order_item_id: string | null
          quantity: number
          sgst_amount: number
          size: string | null
          sku: string | null
          taxable_value: number
          total: number
          unit_price: number
        }
        Insert: {
          cgst_amount?: number
          color?: string | null
          description: string
          discount?: number
          gst_rate: number
          hsn_code?: string | null
          id?: string
          igst_amount?: number
          invoice_id: string
          line_no: number
          order_item_id?: string | null
          quantity: number
          sgst_amount?: number
          size?: string | null
          sku?: string | null
          taxable_value: number
          total: number
          unit_price: number
        }
        Update: {
          cgst_amount?: number
          color?: string | null
          description?: string
          discount?: number
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          igst_amount?: number
          invoice_id?: string
          line_no?: number
          order_item_id?: string | null
          quantity?: number
          sgst_amount?: number
          size?: string | null
          sku?: string | null
          taxable_value?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_series: {
        Row: {
          fiscal_year: string
          last_serial: number
          vendor_id: string
        }
        Insert: {
          fiscal_year: string
          last_serial?: number
          vendor_id: string
        }
        Update: {
          fiscal_year?: string
          last_serial?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_series_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          billing_address: Json
          billing_name: string
          billing_state: string | null
          cgst_amount: number
          created_at: string
          discount_amount: number
          discount_code: string | null
          id: string
          igst_amount: number
          invoice_number: string
          issued_at: string
          order_date: string | null
          order_id: string
          order_number: string | null
          place_of_supply_code: string | null
          seller_address: Json | null
          seller_gstin: string | null
          seller_legal_name: string | null
          seller_name: string
          seller_pan: string | null
          seller_state: string | null
          seller_state_code: string | null
          sgst_amount: number
          shipping_cost: number
          subtotal: number
          supply_type: string | null
          tax_amount: number
          taxable_value: number | null
          total: number
          vendor_id: string
          vendor_order_id: string
        }
        Insert: {
          billing_address: Json
          billing_name: string
          billing_state?: string | null
          cgst_amount?: number
          created_at?: string
          discount_amount?: number
          discount_code?: string | null
          id?: string
          igst_amount?: number
          invoice_number: string
          issued_at?: string
          order_date?: string | null
          order_id: string
          order_number?: string | null
          place_of_supply_code?: string | null
          seller_address?: Json | null
          seller_gstin?: string | null
          seller_legal_name?: string | null
          seller_name: string
          seller_pan?: string | null
          seller_state?: string | null
          seller_state_code?: string | null
          sgst_amount?: number
          shipping_cost?: number
          subtotal: number
          supply_type?: string | null
          tax_amount?: number
          taxable_value?: number | null
          total: number
          vendor_id: string
          vendor_order_id: string
        }
        Update: {
          billing_address?: Json
          billing_name?: string
          billing_state?: string | null
          cgst_amount?: number
          created_at?: string
          discount_amount?: number
          discount_code?: string | null
          id?: string
          igst_amount?: number
          invoice_number?: string
          issued_at?: string
          order_date?: string | null
          order_id?: string
          order_number?: string | null
          place_of_supply_code?: string | null
          seller_address?: Json | null
          seller_gstin?: string | null
          seller_legal_name?: string | null
          seller_name?: string
          seller_pan?: string | null
          seller_state?: string | null
          seller_state_code?: string | null
          sgst_amount?: number
          shipping_cost?: number
          subtotal?: number
          supply_type?: string | null
          tax_amount?: number
          taxable_value?: number | null
          total?: number
          vendor_id?: string
          vendor_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: true
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_points: {
        Row: {
          created_at: string
          id: string
          lifetime_points: number
          tier: string
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lifetime_points?: number
          tier?: string
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lifetime_points?: number
          tier?: string
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          points: number
          transaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          points: number
          transaction_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          points?: number
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          amount_paid: number
          auto_renew: boolean
          cancelled_at: string | null
          created_at: string
          expires_at: string
          id: string
          plan: Database["public"]["Enums"]["membership_plan"]
          started_at: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid?: number
          auto_renew?: boolean
          cancelled_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          plan: Database["public"]["Enums"]["membership_plan"]
          started_at?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          auto_renew?: boolean
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          plan?: Database["public"]["Enums"]["membership_plan"]
          started_at?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          email: string
          id: string
          is_subscribed: boolean
          name: string | null
          subscribed_at: string
          unsubscribed_at: string | null
        }
        Insert: {
          email: string
          id?: string
          is_subscribed?: boolean
          name?: string | null
          subscribed_at?: string
          unsubscribed_at?: string | null
        }
        Update: {
          email?: string
          id?: string
          is_subscribed?: boolean
          name?: string | null
          subscribed_at?: string
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          id: string
          link_url: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category: string
          created_at?: string
          id?: string
          link_url?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          link_url?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      order_cancellations: {
        Row: {
          cancelled_by: string | null
          created_at: string
          id: string
          order_id: string
          reason: string | null
          refund_id: string | null
          vendor_order_id: string
          was_already_shipped: boolean
        }
        Insert: {
          cancelled_by?: string | null
          created_at?: string
          id?: string
          order_id: string
          reason?: string | null
          refund_id?: string | null
          vendor_order_id: string
          was_already_shipped?: boolean
        }
        Update: {
          cancelled_by?: string | null
          created_at?: string
          id?: string
          order_id?: string
          reason?: string | null
          refund_id?: string | null
          vendor_order_id?: string
          was_already_shipped?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "order_cancellations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_cancellations_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_cancellations_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          color: string | null
          created_at: string
          customisation: Json | null
          customisation_price: number
          discount_amount: number | null
          id: string
          is_returnable: boolean
          order_id: string
          prep_days: number | null
          price: number
          product_id: string
          product_title: string
          quantity: number
          size: string | null
          sku: string | null
          variant_id: string
          variant_title: string | null
          vendor_id: string | null
          vendor_order_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          customisation?: Json | null
          customisation_price?: number
          discount_amount?: number | null
          id?: string
          is_returnable?: boolean
          order_id: string
          prep_days?: number | null
          price: number
          product_id: string
          product_title: string
          quantity: number
          size?: string | null
          sku?: string | null
          variant_id: string
          variant_title?: string | null
          vendor_id?: string | null
          vendor_order_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          customisation?: Json | null
          customisation_price?: number
          discount_amount?: number | null
          id?: string
          is_returnable?: boolean
          order_id?: string
          prep_days?: number | null
          price?: number
          product_id?: string
          product_title?: string
          quantity?: number
          size?: string | null
          sku?: string | null
          variant_id?: string
          variant_title?: string | null
          vendor_id?: string | null
          vendor_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_list_seen: {
        Row: {
          last_seen_at: string
          list_key: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          list_key: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          list_key?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          confirmation_email_sent_at: string | null
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          discount_amount: number
          discount_code: string | null
          estimated_delivery_date: string | null
          fulfilment_route: string
          id: string
          notes: string | null
          order_status: string
          payment_method: string
          payment_status: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          shipping_address: Json
          shipping_cost: number
          subtotal: number
          total: number
          unpaid_alert_sent_at: string | null
          updated_at: string
          user_id: string | null
          vendor_email_sent_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          confirmation_email_sent_at?: string | null
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          discount_amount?: number
          discount_code?: string | null
          estimated_delivery_date?: string | null
          fulfilment_route?: string
          id?: string
          notes?: string | null
          order_status?: string
          payment_method: string
          payment_status?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          shipping_address: Json
          shipping_cost?: number
          subtotal: number
          total: number
          unpaid_alert_sent_at?: string | null
          updated_at?: string
          user_id?: string | null
          vendor_email_sent_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          confirmation_email_sent_at?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          discount_amount?: number
          discount_code?: string | null
          estimated_delivery_date?: string | null
          fulfilment_route?: string
          id?: string
          notes?: string | null
          order_status?: string
          payment_method?: string
          payment_status?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          shipping_address?: Json
          shipping_cost?: number
          subtotal?: number
          total?: number
          unpaid_alert_sent_at?: string | null
          updated_at?: string
          user_id?: string | null
          vendor_email_sent_at?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_type: string
          id: string
          order_id: string | null
          payment_id: string | null
          raw_payload: Json
          razorpay_entity_id: string | null
          received_at: string
        }
        Insert: {
          event_type: string
          id?: string
          order_id?: string | null
          payment_id?: string | null
          raw_payload: Json
          razorpay_entity_id?: string | null
          received_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          order_id?: string | null
          payment_id?: string | null
          raw_payload?: Json
          razorpay_entity_id?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      payments: {
        Row: {
          amount: number
          created_at: string
          gateway_fee: number | null
          gateway_tax: number | null
          id: string
          metadata: Json | null
          order_id: string
          payment_method: string
          payment_status: string
          refund_amount: number | null
          refund_reason: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          gateway_fee?: number | null
          gateway_tax?: number | null
          id?: string
          metadata?: Json | null
          order_id: string
          payment_method: string
          payment_status?: string
          refund_amount?: number | null
          refund_reason?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          gateway_fee?: number | null
          gateway_tax?: number | null
          id?: string
          metadata?: Json | null
          order_id?: string
          payment_method?: string
          payment_status?: string
          refund_amount?: number | null
          refund_reason?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_rates: {
        Row: {
          charge_courier_to_boutique: boolean
          created_at: string
          created_by: string | null
          effective_from: string
          fee_gst_pct: number
          fee_sac_code: string
          gst_tcs_pct: number
          id: string
          marketplace_commission_pct: number
          note: string | null
          payment_gateway_fee_pct: number
          payout_cutoff_time: string
          payout_cutoff_weekday: number
          payout_hold_hours: number
          payout_weekday: number
          tds_individual_exempt_upto: number
          tds_no_pan_pct: number
          tds_pct: number
          technology_fee_pct: number
        }
        Insert: {
          charge_courier_to_boutique?: boolean
          created_at?: string
          created_by?: string | null
          effective_from: string
          fee_gst_pct?: number
          fee_sac_code?: string
          gst_tcs_pct?: number
          id?: string
          marketplace_commission_pct?: number
          note?: string | null
          payment_gateway_fee_pct?: number
          payout_cutoff_time?: string
          payout_cutoff_weekday?: number
          payout_hold_hours?: number
          payout_weekday?: number
          tds_individual_exempt_upto?: number
          tds_no_pan_pct?: number
          tds_pct?: number
          technology_fee_pct?: number
        }
        Update: {
          charge_courier_to_boutique?: boolean
          created_at?: string
          created_by?: string | null
          effective_from?: string
          fee_gst_pct?: number
          fee_sac_code?: string
          gst_tcs_pct?: number
          id?: string
          marketplace_commission_pct?: number
          note?: string | null
          payment_gateway_fee_pct?: number
          payout_cutoff_time?: string
          payout_cutoff_weekday?: number
          payout_hold_hours?: number
          payout_weekday?: number
          tds_individual_exempt_upto?: number
          tds_no_pan_pct?: number
          tds_pct?: number
          technology_fee_pct?: number
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          customer_shipping_enabled: boolean
          default_prep_days: number
          id: boolean
          launch_date: string | null
          payout_auto_send: boolean
          payout_rail: string
          payout_settlement_days: number
          return_evidence_required: boolean
          return_vendor_sla_hours: number
          review_images_require_approval: boolean
          updated_at: string
          updated_by: string | null
          warehouse_cutoff_hour: number
          warehouse_handling_days: number
          warehouse_inbound_transit_days: number
          warehouse_max_wait_days: number
          warehouse_routing_enabled: boolean
        }
        Insert: {
          customer_shipping_enabled?: boolean
          default_prep_days?: number
          id?: boolean
          launch_date?: string | null
          payout_auto_send?: boolean
          payout_rail?: string
          payout_settlement_days?: number
          return_evidence_required?: boolean
          return_vendor_sla_hours?: number
          review_images_require_approval?: boolean
          updated_at?: string
          updated_by?: string | null
          warehouse_cutoff_hour?: number
          warehouse_handling_days?: number
          warehouse_inbound_transit_days?: number
          warehouse_max_wait_days?: number
          warehouse_routing_enabled?: boolean
        }
        Update: {
          customer_shipping_enabled?: boolean
          default_prep_days?: number
          id?: boolean
          launch_date?: string | null
          payout_auto_send?: boolean
          payout_rail?: string
          payout_settlement_days?: number
          return_evidence_required?: boolean
          return_vendor_sla_hours?: number
          review_images_require_approval?: boolean
          updated_at?: string
          updated_by?: string | null
          warehouse_cutoff_hour?: number
          warehouse_handling_days?: number
          warehouse_inbound_transit_days?: number
          warehouse_max_wait_days?: number
          warehouse_routing_enabled?: boolean
        }
        Relationships: []
      }
      product_comparisons: {
        Row: {
          created_at: string
          id: string
          product_ids: string[]
          session_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_ids?: string[]
          session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_ids?: string[]
          session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      product_reviews: {
        Row: {
          created_at: string
          helpful_count: number
          id: string
          is_approved: boolean
          is_verified_purchase: boolean
          product_id: string
          rating: number
          review_text: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          helpful_count?: number
          id?: string
          is_approved?: boolean
          is_verified_purchase?: boolean
          product_id: string
          rating: number
          review_text?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          helpful_count?: number
          id?: string
          is_approved?: boolean
          is_verified_purchase?: boolean
          product_id?: string
          rating?: number
          review_text?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          low_stock_threshold: number | null
          name: string
          options: Json
          price: number | null
          product_id: string
          product_value: number | null
          sku: string | null
          stock: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          low_stock_threshold?: number | null
          name: string
          options?: Json
          price?: number | null
          product_id: string
          product_value?: number | null
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          low_stock_threshold?: number | null
          name?: string
          options?: Json
          price?: number | null
          product_id?: string
          product_value?: number | null
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          ai_content_status: string | null
          ai_original_photo_paths: string[]
          approval_status: string
          breadth_cm: number | null
          category_id: string | null
          cod_available: boolean
          compare_at_price: number | null
          compare_at_value: number | null
          country_of_origin: string
          created_at: string
          custom_size_price: number | null
          customisable: boolean
          customisation_days: number | null
          customisation_options: Json
          description: string | null
          height_cm: number | null
          id: string
          images: string[] | null
          is_active: boolean
          is_returnable: boolean
          length_cm: number | null
          low_stock_threshold: number
          made_to_order: boolean
          name: string
          net_quantity: string
          prep_days: number | null
          price: number
          product_value: number | null
          rejection_reason: string | null
          related_product_ids: string[] | null
          sku: string | null
          specifications: Json
          stock_quantity: number
          tags: string[] | null
          updated_at: string
          vendor_id: string | null
          video_is_primary: boolean
          video_status: string | null
          video_url: string | null
          weight_grams: number | null
        }
        Insert: {
          ai_content_status?: string | null
          ai_original_photo_paths?: string[]
          approval_status?: string
          breadth_cm?: number | null
          category_id?: string | null
          cod_available?: boolean
          compare_at_price?: number | null
          compare_at_value?: number | null
          country_of_origin?: string
          created_at?: string
          custom_size_price?: number | null
          customisable?: boolean
          customisation_days?: number | null
          customisation_options?: Json
          description?: string | null
          height_cm?: number | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          is_returnable?: boolean
          length_cm?: number | null
          low_stock_threshold?: number
          made_to_order?: boolean
          name: string
          net_quantity?: string
          prep_days?: number | null
          price?: number
          product_value?: number | null
          rejection_reason?: string | null
          related_product_ids?: string[] | null
          sku?: string | null
          specifications?: Json
          stock_quantity?: number
          tags?: string[] | null
          updated_at?: string
          vendor_id?: string | null
          video_is_primary?: boolean
          video_status?: string | null
          video_url?: string | null
          weight_grams?: number | null
        }
        Update: {
          ai_content_status?: string | null
          ai_original_photo_paths?: string[]
          approval_status?: string
          breadth_cm?: number | null
          category_id?: string | null
          cod_available?: boolean
          compare_at_price?: number | null
          compare_at_value?: number | null
          country_of_origin?: string
          created_at?: string
          custom_size_price?: number | null
          customisable?: boolean
          customisation_days?: number | null
          customisation_options?: Json
          description?: string | null
          height_cm?: number | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          is_returnable?: boolean
          length_cm?: number | null
          low_stock_threshold?: number
          made_to_order?: boolean
          name?: string
          net_quantity?: string
          prep_days?: number | null
          price?: number
          product_value?: number | null
          rejection_reason?: string | null
          related_product_ids?: string[] | null
          sku?: string | null
          specifications?: Json
          stock_quantity?: number
          tags?: string[] | null
          updated_at?: string
          vendor_id?: string | null
          video_is_primary?: boolean
          video_status?: string | null
          video_url?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recently_viewed: {
        Row: {
          id: string
          product_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          product_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recently_viewed_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          referral_code: string
          referred_email: string | null
          referred_reward_points: number
          referred_user_id: string | null
          referrer_reward_points: number
          referrer_user_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referral_code: string
          referred_email?: string | null
          referred_reward_points?: number
          referred_user_id?: string | null
          referrer_reward_points?: number
          referrer_user_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referral_code?: string
          referred_email?: string | null
          referred_reward_points?: number
          referred_user_id?: string | null
          referrer_reward_points?: number
          referrer_user_id?: string
          status?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          failure_reason: string | null
          gateway_processed_at: string | null
          id: string
          initiated_at: string
          initiated_by: string | null
          order_id: string
          payment_id: string
          razorpay_payment_id: string
          razorpay_refund_id: string | null
          reason: string | null
          return_request_id: string | null
          speed: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          failure_reason?: string | null
          gateway_processed_at?: string | null
          id?: string
          initiated_at?: string
          initiated_by?: string | null
          order_id: string
          payment_id: string
          razorpay_payment_id: string
          razorpay_refund_id?: string | null
          reason?: string | null
          return_request_id?: string | null
          speed?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          failure_reason?: string | null
          gateway_processed_at?: string | null
          id?: string
          initiated_at?: string
          initiated_by?: string | null
          order_id?: string
          payment_id?: string
          razorpay_payment_id?: string
          razorpay_refund_id?: string | null
          reason?: string | null
          return_request_id?: string | null
          speed?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_requests: {
        Row: {
          additional_notes: string | null
          admin_notes: string | null
          created_at: string
          escalated_at: string | null
          evidence_video_url: string | null
          exchange_details: Json | null
          handled_by: string
          id: string
          items: Json
          order_id: string
          reason: string
          received_at_warehouse_at: string | null
          received_by: string | null
          refund_amount: number | null
          replacement_qc_notes: string | null
          replacement_qc_status: string | null
          replacement_received_at: string | null
          request_type: string
          return_destination: string | null
          status: string
          updated_at: string
          user_id: string
          vendor_decision_at: string | null
          vendor_notes: string | null
          warehouse_qc_at: string | null
          warehouse_qc_by: string | null
          warehouse_qc_notes: string | null
          warehouse_qc_status: string | null
          warehouse_shelf: string | null
        }
        Insert: {
          additional_notes?: string | null
          admin_notes?: string | null
          created_at?: string
          escalated_at?: string | null
          evidence_video_url?: string | null
          exchange_details?: Json | null
          handled_by?: string
          id?: string
          items?: Json
          order_id: string
          reason: string
          received_at_warehouse_at?: string | null
          received_by?: string | null
          refund_amount?: number | null
          replacement_qc_notes?: string | null
          replacement_qc_status?: string | null
          replacement_received_at?: string | null
          request_type?: string
          return_destination?: string | null
          status?: string
          updated_at?: string
          user_id: string
          vendor_decision_at?: string | null
          vendor_notes?: string | null
          warehouse_qc_at?: string | null
          warehouse_qc_by?: string | null
          warehouse_qc_notes?: string | null
          warehouse_qc_status?: string | null
          warehouse_shelf?: string | null
        }
        Update: {
          additional_notes?: string | null
          admin_notes?: string | null
          created_at?: string
          escalated_at?: string | null
          evidence_video_url?: string | null
          exchange_details?: Json | null
          handled_by?: string
          id?: string
          items?: Json
          order_id?: string
          reason?: string
          received_at_warehouse_at?: string | null
          received_by?: string | null
          refund_amount?: number | null
          replacement_qc_notes?: string | null
          replacement_qc_status?: string | null
          replacement_received_at?: string | null
          request_type?: string
          return_destination?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vendor_decision_at?: string | null
          vendor_notes?: string | null
          warehouse_qc_at?: string | null
          warehouse_qc_by?: string | null
          warehouse_qc_notes?: string | null
          warehouse_qc_status?: string | null
          warehouse_shelf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      review_images: {
        Row: {
          created_at: string
          id: string
          review_id: string
          status: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          status?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          status?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_images_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_addresses: {
        Row: {
          address_line_1: string
          address_line_2: string | null
          city: string
          created_at: string
          full_name: string
          id: string
          is_default: boolean
          label: string
          phone: string
          pincode: string
          state: string
          user_id: string
        }
        Insert: {
          address_line_1: string
          address_line_2?: string | null
          city: string
          created_at?: string
          full_name: string
          id?: string
          is_default?: boolean
          label?: string
          phone: string
          pincode: string
          state: string
          user_id: string
        }
        Update: {
          address_line_1?: string
          address_line_2?: string | null
          city?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string
          phone?: string
          pincode?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      settlements: {
        Row: {
          amount: number
          created_at: string
          fees: number | null
          id: string
          razorpay_settlement_id: string
          settled_at: string
          tax: number | null
          utr: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          fees?: number | null
          id?: string
          razorpay_settlement_id: string
          settled_at: string
          tax?: number | null
          utr?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          fees?: number | null
          id?: string
          razorpay_settlement_id?: string
          settled_at?: string
          tax?: number | null
          utr?: string | null
        }
        Relationships: []
      }
      shipment_events: {
        Row: {
          activity: string | null
          awb_code: string
          event_status: string | null
          event_status_id: number | null
          event_timestamp: string | null
          id: string
          location: string | null
          raw_payload: Json
          received_at: string
          shipment_id: string | null
        }
        Insert: {
          activity?: string | null
          awb_code: string
          event_status?: string | null
          event_status_id?: number | null
          event_timestamp?: string | null
          id?: string
          location?: string | null
          raw_payload: Json
          received_at?: string
          shipment_id?: string | null
        }
        Update: {
          activity?: string | null
          awb_code?: string
          event_status?: string | null
          event_status_id?: number | null
          event_timestamp?: string | null
          id?: string
          location?: string | null
          raw_payload?: Json
          received_at?: string
          shipment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          awb_code: string | null
          cod_amount: number | null
          cod_charge: number | null
          cod_remittance_status: string | null
          cod_remittance_utr: string | null
          cod_remitted_on: string | null
          cod_synced_at: string | null
          cost_borne_by: string
          courier_cost: number | null
          courier_id: number | null
          courier_name: string | null
          created_at: string
          delivered_at: string | null
          dispatch_id: string | null
          estimated_delivery_date: string | null
          id: string
          invoice_url: string | null
          label_url: string | null
          manifest_url: string | null
          order_id: string | null
          picked_up_at: string | null
          pickup_scheduled_at: string | null
          return_request_id: string | null
          rto_initiated_at: string | null
          send_back_id: string | null
          shipment_type: string
          shiprocket_channel_order_id: string | null
          shiprocket_order_id: number | null
          shiprocket_shipment_id: number | null
          status: string
          status_raw: string | null
          updated_at: string
          vendor_order_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          awb_code?: string | null
          cod_amount?: number | null
          cod_charge?: number | null
          cod_remittance_status?: string | null
          cod_remittance_utr?: string | null
          cod_remitted_on?: string | null
          cod_synced_at?: string | null
          cost_borne_by?: string
          courier_cost?: number | null
          courier_id?: number | null
          courier_name?: string | null
          created_at?: string
          delivered_at?: string | null
          dispatch_id?: string | null
          estimated_delivery_date?: string | null
          id?: string
          invoice_url?: string | null
          label_url?: string | null
          manifest_url?: string | null
          order_id?: string | null
          picked_up_at?: string | null
          pickup_scheduled_at?: string | null
          return_request_id?: string | null
          rto_initiated_at?: string | null
          send_back_id?: string | null
          shipment_type?: string
          shiprocket_channel_order_id?: string | null
          shiprocket_order_id?: number | null
          shiprocket_shipment_id?: number | null
          status?: string
          status_raw?: string | null
          updated_at?: string
          vendor_order_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          awb_code?: string | null
          cod_amount?: number | null
          cod_charge?: number | null
          cod_remittance_status?: string | null
          cod_remittance_utr?: string | null
          cod_remitted_on?: string | null
          cod_synced_at?: string | null
          cost_borne_by?: string
          courier_cost?: number | null
          courier_id?: number | null
          courier_name?: string | null
          created_at?: string
          delivered_at?: string | null
          dispatch_id?: string | null
          estimated_delivery_date?: string | null
          id?: string
          invoice_url?: string | null
          label_url?: string | null
          manifest_url?: string | null
          order_id?: string | null
          picked_up_at?: string | null
          pickup_scheduled_at?: string | null
          return_request_id?: string | null
          rto_initiated_at?: string | null
          send_back_id?: string | null
          shipment_type?: string
          shiprocket_channel_order_id?: string | null
          shiprocket_order_id?: number | null
          shiprocket_shipment_id?: number | null
          status?: string
          status_raw?: string | null
          updated_at?: string
          vendor_order_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "warehouse_dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_send_back_id_fkey"
            columns: ["send_back_id"]
            isOneToOne: false
            referencedRelation: "boutique_send_backs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      shiprocket_tokens: {
        Row: {
          expires_at: string
          id: number
          token: string
          updated_at: string
        }
        Insert: {
          expires_at: string
          id?: number
          token: string
          updated_at?: string
        }
        Update: {
          expires_at?: string
          id?: number
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      size_guides: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          measurements: Json
          name: string
          sizes: Json
          unit: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          measurements?: Json
          name: string
          sizes?: Json
          unit?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          measurements?: Json
          name?: string
          sizes?: Json
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "size_guides_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          change_quantity: number
          changed_by: string | null
          created_at: string
          id: string
          movement_type: string
          product_id: string | null
          reason: string | null
          reference_order_id: string | null
          resulting_quantity: number
          variant_id: string | null
          vendor_id: string | null
        }
        Insert: {
          change_quantity: number
          changed_by?: string | null
          created_at?: string
          id?: string
          movement_type: string
          product_id?: string | null
          reason?: string | null
          reference_order_id?: string | null
          resulting_quantity: number
          variant_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          change_quantity?: number
          changed_by?: string | null
          created_at?: string
          id?: string
          movement_type?: string
          product_id?: string | null
          reason?: string | null
          reference_order_id?: string | null
          resulting_quantity?: number
          variant_id?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reference_order_id_fkey"
            columns: ["reference_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_documents: {
        Row: {
          created_at: string
          doc_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          uploaded_by: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          doc_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          uploaded_by?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          doc_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          uploaded_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_kyc: {
        Row: {
          alternate_mobile: string
          authorized_designation: string
          authorized_email: string
          authorized_mobile: string
          authorized_name: string
          bank_proof_type: string
          brand_legal_declared_at: string | null
          brand_same_as_legal: boolean
          business_constitution: string
          business_email: string
          contact_designation: string | null
          contact_email: string | null
          contact_mobile: string | null
          contact_name: string | null
          contact_same_as_authorized: boolean
          gstin: string | null
          instagram_url: string | null
          legal_business_name: string
          marketing_consent_at: string | null
          marketing_emails_opt_in: boolean
          pan: string
          primary_mobile: string
          submitted_at: string
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
          vendor_id: string
          website_url: string | null
        }
        Insert: {
          alternate_mobile: string
          authorized_designation: string
          authorized_email: string
          authorized_mobile: string
          authorized_name: string
          bank_proof_type: string
          brand_legal_declared_at?: string | null
          brand_same_as_legal?: boolean
          business_constitution: string
          business_email: string
          contact_designation?: string | null
          contact_email?: string | null
          contact_mobile?: string | null
          contact_name?: string | null
          contact_same_as_authorized?: boolean
          gstin?: string | null
          instagram_url?: string | null
          legal_business_name: string
          marketing_consent_at?: string | null
          marketing_emails_opt_in?: boolean
          pan: string
          primary_mobile: string
          submitted_at?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          vendor_id: string
          website_url?: string | null
        }
        Update: {
          alternate_mobile?: string
          authorized_designation?: string
          authorized_email?: string
          authorized_mobile?: string
          authorized_name?: string
          bank_proof_type?: string
          brand_legal_declared_at?: string | null
          brand_same_as_legal?: boolean
          business_constitution?: string
          business_email?: string
          contact_designation?: string | null
          contact_email?: string | null
          contact_mobile?: string | null
          contact_name?: string | null
          contact_same_as_authorized?: boolean
          gstin?: string | null
          instagram_url?: string | null
          legal_business_name?: string
          marketing_consent_at?: string | null
          marketing_emails_opt_in?: boolean
          pan?: string
          primary_mobile?: string
          submitted_at?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          vendor_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_kyc_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_members_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_orders: {
        Row: {
          arrived_at_warehouse_at: string | null
          carrier: string | null
          cod_handling_charge: number
          cod_received_at: string | null
          cod_received_source: string | null
          cod_received_utr: string | null
          commission_amount: number
          commission_rate: number
          courier_charge: number
          created_at: string
          delivered_at: string | null
          dispatch_id: string | null
          due_notified_at: string | null
          expected_at_warehouse_on: string | null
          fee_gst_amount: number
          fee_gst_rate: number
          fee_invoice_id: string | null
          fees_computed_at: string | null
          gateway_fee_amount: number
          gateway_fee_rate: number
          goods_gst: number
          goods_value: number
          hsn_missing: boolean
          id: string
          late_reminder_sent_at: string | null
          net_payable: number
          order_id: string
          overdue_alerted_at: string | null
          payout_eligible_on: string | null
          payout_id: string | null
          payout_notified_at: string | null
          product_value: number
          qc_at: string | null
          qc_by: string | null
          qc_notes: string | null
          qc_status: string | null
          rates_effective_from: string | null
          ready_by: string | null
          received_at_warehouse_at: string | null
          received_by: string | null
          reminder_sent_at: string | null
          return_window_ends_on: string | null
          rzp_released_at: string | null
          rzp_reversed_amount: number
          rzp_settled_at: string | null
          rzp_settlement_id: string | null
          rzp_settlement_utr: string | null
          rzp_transfer_amount: number | null
          rzp_transfer_error: string | null
          rzp_transfer_id: string | null
          rzp_transfer_kind: string | null
          rzp_transfer_status: string | null
          shipping_cost: number
          shipping_to_boutique: boolean
          status: string
          subtotal: number
          supply_type: string | null
          tcs_amount: number
          tcs_rate: number
          tds_amount: number
          tds_rate: number
          tech_fee_amount: number
          tech_fee_rate: number
          tracking_number: string | null
          updated_at: string
          vendor_id: string
          warehouse_shelf: string | null
        }
        Insert: {
          arrived_at_warehouse_at?: string | null
          carrier?: string | null
          cod_handling_charge?: number
          cod_received_at?: string | null
          cod_received_source?: string | null
          cod_received_utr?: string | null
          commission_amount?: number
          commission_rate?: number
          courier_charge?: number
          created_at?: string
          delivered_at?: string | null
          dispatch_id?: string | null
          due_notified_at?: string | null
          expected_at_warehouse_on?: string | null
          fee_gst_amount?: number
          fee_gst_rate?: number
          fee_invoice_id?: string | null
          fees_computed_at?: string | null
          gateway_fee_amount?: number
          gateway_fee_rate?: number
          goods_gst?: number
          goods_value?: number
          hsn_missing?: boolean
          id?: string
          late_reminder_sent_at?: string | null
          net_payable?: number
          order_id: string
          overdue_alerted_at?: string | null
          payout_eligible_on?: string | null
          payout_id?: string | null
          payout_notified_at?: string | null
          product_value?: number
          qc_at?: string | null
          qc_by?: string | null
          qc_notes?: string | null
          qc_status?: string | null
          rates_effective_from?: string | null
          ready_by?: string | null
          received_at_warehouse_at?: string | null
          received_by?: string | null
          reminder_sent_at?: string | null
          return_window_ends_on?: string | null
          rzp_released_at?: string | null
          rzp_reversed_amount?: number
          rzp_settled_at?: string | null
          rzp_settlement_id?: string | null
          rzp_settlement_utr?: string | null
          rzp_transfer_amount?: number | null
          rzp_transfer_error?: string | null
          rzp_transfer_id?: string | null
          rzp_transfer_kind?: string | null
          rzp_transfer_status?: string | null
          shipping_cost?: number
          shipping_to_boutique?: boolean
          status?: string
          subtotal?: number
          supply_type?: string | null
          tcs_amount?: number
          tcs_rate?: number
          tds_amount?: number
          tds_rate?: number
          tech_fee_amount?: number
          tech_fee_rate?: number
          tracking_number?: string | null
          updated_at?: string
          vendor_id: string
          warehouse_shelf?: string | null
        }
        Update: {
          arrived_at_warehouse_at?: string | null
          carrier?: string | null
          cod_handling_charge?: number
          cod_received_at?: string | null
          cod_received_source?: string | null
          cod_received_utr?: string | null
          commission_amount?: number
          commission_rate?: number
          courier_charge?: number
          created_at?: string
          delivered_at?: string | null
          dispatch_id?: string | null
          due_notified_at?: string | null
          expected_at_warehouse_on?: string | null
          fee_gst_amount?: number
          fee_gst_rate?: number
          fee_invoice_id?: string | null
          fees_computed_at?: string | null
          gateway_fee_amount?: number
          gateway_fee_rate?: number
          goods_gst?: number
          goods_value?: number
          hsn_missing?: boolean
          id?: string
          late_reminder_sent_at?: string | null
          net_payable?: number
          order_id?: string
          overdue_alerted_at?: string | null
          payout_eligible_on?: string | null
          payout_id?: string | null
          payout_notified_at?: string | null
          product_value?: number
          qc_at?: string | null
          qc_by?: string | null
          qc_notes?: string | null
          qc_status?: string | null
          rates_effective_from?: string | null
          ready_by?: string | null
          received_at_warehouse_at?: string | null
          received_by?: string | null
          reminder_sent_at?: string | null
          return_window_ends_on?: string | null
          rzp_released_at?: string | null
          rzp_reversed_amount?: number
          rzp_settled_at?: string | null
          rzp_settlement_id?: string | null
          rzp_settlement_utr?: string | null
          rzp_transfer_amount?: number | null
          rzp_transfer_error?: string | null
          rzp_transfer_id?: string | null
          rzp_transfer_kind?: string | null
          rzp_transfer_status?: string | null
          shipping_cost?: number
          shipping_to_boutique?: boolean
          status?: string
          subtotal?: number
          supply_type?: string | null
          tcs_amount?: number
          tcs_rate?: number
          tds_amount?: number
          tds_rate?: number
          tech_fee_amount?: number
          tech_fee_rate?: number
          tracking_number?: string | null
          updated_at?: string
          vendor_id?: string
          warehouse_shelf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_orders_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "warehouse_dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_orders_fee_invoice_id_fkey"
            columns: ["fee_invoice_id"]
            isOneToOne: false
            referencedRelation: "fee_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_orders_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "vendor_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payout_accounts: {
        Row: {
          account_holder_name: string
          bank_account_number: string
          bank_ifsc: string
          bank_name: string | null
          business_type: string
          created_at: string
          id: string
          legal_business_name: string | null
          pan: string | null
          razorpay_account_id: string | null
          razorpay_error: string | null
          razorpay_product_id: string | null
          razorpay_requirements: Json | null
          razorpay_status: string
          razorpay_synced_at: string | null
          rzpx_contact_id: string | null
          rzpx_error: string | null
          rzpx_fund_account_id: string | null
          rzpx_name_approved_by: string | null
          rzpx_registered_name: string | null
          rzpx_status: string
          rzpx_validation_id: string | null
          rzpx_verified_at: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          account_holder_name: string
          bank_account_number: string
          bank_ifsc: string
          bank_name?: string | null
          business_type?: string
          created_at?: string
          id?: string
          legal_business_name?: string | null
          pan?: string | null
          razorpay_account_id?: string | null
          razorpay_error?: string | null
          razorpay_product_id?: string | null
          razorpay_requirements?: Json | null
          razorpay_status?: string
          razorpay_synced_at?: string | null
          rzpx_contact_id?: string | null
          rzpx_error?: string | null
          rzpx_fund_account_id?: string | null
          rzpx_name_approved_by?: string | null
          rzpx_registered_name?: string | null
          rzpx_status?: string
          rzpx_validation_id?: string | null
          rzpx_verified_at?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          account_holder_name?: string
          bank_account_number?: string
          bank_ifsc?: string
          bank_name?: string | null
          business_type?: string
          created_at?: string
          id?: string
          legal_business_name?: string | null
          pan?: string | null
          razorpay_account_id?: string | null
          razorpay_error?: string | null
          razorpay_product_id?: string | null
          razorpay_requirements?: Json | null
          razorpay_status?: string
          razorpay_synced_at?: string | null
          rzpx_contact_id?: string | null
          rzpx_error?: string | null
          rzpx_fund_account_id?: string | null
          rzpx_name_approved_by?: string | null
          rzpx_registered_name?: string | null
          rzpx_status?: string
          rzpx_validation_id?: string | null
          rzpx_verified_at?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payout_accounts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payouts: {
        Row: {
          bank_account_last4: string | null
          commission_amount: number
          created_at: string
          failed_at: string | null
          failure_reason: string | null
          gross_sales: number
          id: string
          method: string
          net_payable: number
          order_count: number
          paid_at: string | null
          payment_reference: string | null
          payout_date: string | null
          period_end: string
          period_start: string
          rzpx_error: string | null
          rzpx_fees: number | null
          rzpx_mode: string | null
          rzpx_payout_id: string | null
          rzpx_status: string | null
          rzpx_tax: number | null
          sent_at: string | null
          sent_by: string | null
          status: string
          updated_at: string
          vendor_id: string
          vendor_order_ids: string[]
        }
        Insert: {
          bank_account_last4?: string | null
          commission_amount?: number
          created_at?: string
          failed_at?: string | null
          failure_reason?: string | null
          gross_sales?: number
          id?: string
          method?: string
          net_payable?: number
          order_count?: number
          paid_at?: string | null
          payment_reference?: string | null
          payout_date?: string | null
          period_end: string
          period_start: string
          rzpx_error?: string | null
          rzpx_fees?: number | null
          rzpx_mode?: string | null
          rzpx_payout_id?: string | null
          rzpx_status?: string | null
          rzpx_tax?: number | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
          vendor_id: string
          vendor_order_ids?: string[]
        }
        Update: {
          bank_account_last4?: string | null
          commission_amount?: number
          created_at?: string
          failed_at?: string | null
          failure_reason?: string | null
          gross_sales?: number
          id?: string
          method?: string
          net_payable?: number
          order_count?: number
          paid_at?: string | null
          payment_reference?: string | null
          payout_date?: string | null
          period_end?: string
          period_start?: string
          rzpx_error?: string | null
          rzpx_fees?: number | null
          rzpx_mode?: string | null
          rzpx_payout_id?: string | null
          rzpx_status?: string | null
          rzpx_tax?: number | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
          vendor_order_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payouts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_quality_tags: {
        Row: {
          note: string | null
          tag: string
          updated_at: string
          updated_by: string | null
          vendor_id: string
        }
        Insert: {
          note?: string | null
          tag: string
          updated_at?: string
          updated_by?: string | null
          vendor_id: string
        }
        Update: {
          note?: string | null
          tag?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_quality_tags_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_size_charts: {
        Row: {
          category_id: string
          created_at: string
          id: string
          updated_at: string
          values: Json
          vendor_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          updated_at?: string
          values?: Json
          vendor_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          values?: Json
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_size_charts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_size_charts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: Json | null
          approved_at: string | null
          approved_by: string | null
          banner_url: string | null
          boutique_code: string
          cod_enabled: boolean
          commission_rate: number | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          default_prep_days: number | null
          description: string | null
          founding_from: string | null
          founding_until: string | null
          free_shipping_threshold: number | null
          gst_number: string | null
          id: string
          is_founding: boolean
          is_trusted: boolean
          is_verified: boolean
          logo_url: string | null
          name: string
          owner_user_id: string | null
          pan_number: string | null
          payout_account_status: string
          payout_reminder_sent_at: string | null
          rating: number | null
          return_policy: string | null
          return_window_days: number
          returns_enabled: boolean
          shipping_flat_rate: number
          shiprocket_pickup_id: number | null
          shiprocket_pickup_location: string | null
          shiprocket_pickup_registered_at: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          banner_url?: string | null
          boutique_code?: string
          cod_enabled?: boolean
          commission_rate?: number | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_prep_days?: number | null
          description?: string | null
          founding_from?: string | null
          founding_until?: string | null
          free_shipping_threshold?: number | null
          gst_number?: string | null
          id?: string
          is_founding?: boolean
          is_trusted?: boolean
          is_verified?: boolean
          logo_url?: string | null
          name: string
          owner_user_id?: string | null
          pan_number?: string | null
          payout_account_status?: string
          payout_reminder_sent_at?: string | null
          rating?: number | null
          return_policy?: string | null
          return_window_days?: number
          returns_enabled?: boolean
          shipping_flat_rate?: number
          shiprocket_pickup_id?: number | null
          shiprocket_pickup_location?: string | null
          shiprocket_pickup_registered_at?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          banner_url?: string | null
          boutique_code?: string
          cod_enabled?: boolean
          commission_rate?: number | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_prep_days?: number | null
          description?: string | null
          founding_from?: string | null
          founding_until?: string | null
          free_shipping_threshold?: number | null
          gst_number?: string | null
          id?: string
          is_founding?: boolean
          is_trusted?: boolean
          is_verified?: boolean
          logo_url?: string | null
          name?: string
          owner_user_id?: string | null
          pan_number?: string | null
          payout_account_status?: string
          payout_reminder_sent_at?: string | null
          rating?: number | null
          return_policy?: string | null
          return_window_days?: number
          returns_enabled?: boolean
          shipping_flat_rate?: number
          shiprocket_pickup_id?: number | null
          shiprocket_pickup_location?: string | null
          shiprocket_pickup_registered_at?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      warehouse_dispatches: {
        Row: {
          breadth_cm: number
          created_at: string
          height_cm: number
          id: string
          length_cm: number
          order_id: string
          packed_at: string
          packed_by: string | null
          purpose: string
          return_request_id: string | null
          rto_received_at: string | null
          status: string
          updated_at: string
          warehouse_id: string
          weight_kg: number
        }
        Insert: {
          breadth_cm: number
          created_at?: string
          height_cm: number
          id?: string
          length_cm: number
          order_id: string
          packed_at?: string
          packed_by?: string | null
          purpose?: string
          return_request_id?: string | null
          rto_received_at?: string | null
          status?: string
          updated_at?: string
          warehouse_id: string
          weight_kg: number
        }
        Update: {
          breadth_cm?: number
          created_at?: string
          height_cm?: number
          id?: string
          length_cm?: number
          order_id?: string
          packed_at?: string
          packed_by?: string | null
          purpose?: string
          return_request_id?: string | null
          rto_received_at?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_dispatches_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_dispatches_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_dispatches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_holidays: {
        Row: {
          created_at: string
          holiday_date: string
          name: string
        }
        Insert: {
          created_at?: string
          holiday_date: string
          name: string
        }
        Update: {
          created_at?: string
          holiday_date?: string
          name?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          address: Json
          code: string
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          shiprocket_pickup_id: number | null
          shiprocket_pickup_location: string | null
          shiprocket_pickup_registered_at: string | null
          updated_at: string
        }
        Insert: {
          address: Json
          code: string
          contact_email: string
          contact_name: string
          contact_phone: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          shiprocket_pickup_id?: number | null
          shiprocket_pickup_location?: string | null
          shiprocket_pickup_registered_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json
          code?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          shiprocket_pickup_id?: number | null
          shiprocket_pickup_location?: string | null
          shiprocket_pickup_registered_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abandon_checkout: { Args: { _order_id: string }; Returns: boolean }
      add_business_days: { Args: { _d: string; _n: number }; Returns: string }
      add_warehouse_working_days: {
        Args: { _d: string; _n: number }
        Returns: string
      }
      adjust_stock: {
        Args: {
          _delta: number
          _movement_type: string
          _product_id: string
          _reason: string
          _reference_order_id: string
          _variant_id: string
        }
        Returns: Json
      }
      admin_list_warehouse_staff: {
        Args: never
        Returns: {
          added_at: string
          email: string
          user_id: string
        }[]
      }
      admin_redispatch_after_rto: {
        Args: { _dispatch_id: string }
        Returns: undefined
      }
      admin_set_warehouse_staff: {
        Args: { _email: string; _enabled: boolean }
        Returns: string
      }
      admin_user_ids: { Args: never; Returns: string[] }
      admin_user_ids_and_warehouse: { Args: never; Returns: string[] }
      announce_vendor_order: {
        Args: { _vendor_order_id: string }
        Returns: undefined
      }
      apply_shipment_cod: { Args: { _shipment_id: string }; Returns: undefined }
      assert_warehouse_operator: { Args: never; Returns: undefined }
      auth_user_id_by_email: { Args: { _email: string }; Returns: string }
      can_access_product_original: {
        Args: { _object_name: string; _user_id: string }
        Returns: boolean
      }
      can_operate_warehouse: { Args: { _user_id: string }; Returns: boolean }
      can_view_customisation_photo: {
        Args: { _path: string }
        Returns: boolean
      }
      cancel_pending_order: { Args: { _order_id: string }; Returns: undefined }
      claim_email_otp_attempt: {
        Args: { _id: string; _max_attempts: number }
        Returns: number
      }
      cod_tracking: {
        Args: { _vendor_id: string }
        Returns: {
          awb_code: string
          boutique_code: string
          boutique_name: string
          cod_amount: number
          cod_charge: number
          cod_received_at: string
          cod_received_source: string
          cod_received_utr: string
          courier_name: string
          delivered_at: string
          net_payable: number
          order_date: string
          order_number: string
          paid_at: string
          payout_on: string
          payout_utr: string
          shiprocket_status: string
          stage: string
          status: string
          vendor_id: string
          vendor_order_id: string
        }[]
      }
      compute_vendor_order_fees: {
        Args: { _vendor_order_id: string }
        Returns: undefined
      }
      create_boutique_send_back: {
        Args: { _notes?: string; _reason: string; _vendor_order_id: string }
        Returns: string
      }
      derive_order_status: { Args: { _order_id: string }; Returns: string }
      dispatch_lead_vendor_order: {
        Args: { _dispatch_id: string }
        Returns: string
      }
      effective_commission_pct: {
        Args: { _at: string; _vendor_id: string }
        Returns: number
      }
      escalate_overdue_return_requests: { Args: never; Returns: undefined }
      fiscal_year_code: { Args: { _at: string }; Returns: string }
      generate_fee_invoices: { Args: { _upto?: string }; Returns: number }
      get_user_vendor_id: { Args: { _user_id: string }; Returns: string }
      gst_rate_for: {
        Args: { _hsn_code_id: string; _unit_price: number }
        Returns: number
      }
      gst_rate_for_value: {
        Args: { _category_id: string; _value: number }
        Returns: number
      }
      gst_state_code: { Args: { _state: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_discount_usage: {
        Args: { _discount_id: string }
        Returns: undefined
      }
      inr: { Args: { _amount: number }; Returns: string }
      invoke_edge_function: {
        Args: { _body: Json; _name: string }
        Returns: undefined
      }
      is_privileged_writer: { Args: never; Returns: boolean }
      is_server_or_warehouse: { Args: never; Returns: boolean }
      is_vendor_member: {
        Args: { _user_id: string; _vendor_id: string }
        Returns: boolean
      }
      is_warehouse_working_day: { Args: { _d: string }; Returns: boolean }
      mark_cod_received: {
        Args: {
          _received_on: string
          _utr: string
          _vendor_order_ids: string[]
        }
        Returns: number
      }
      next_boutique_invoice_number: {
        Args: { _at: string; _vendor_id: string }
        Returns: string
      }
      next_fee_invoice_number: { Args: { _at: string }; Returns: string }
      next_invoice_seq: { Args: never; Returns: number }
      next_payout_date: { Args: { _ready_at: string }; Returns: string }
      nlink: {
        Args: { _focus?: string; _path: string; _tab: string }
        Returns: string
      }
      normalize_indian_mobile: { Args: { _raw: string }; Returns: string }
      normalize_instagram_profile: { Args: { _raw: string }; Returns: string }
      normalize_website_url: { Args: { _raw: string }; Returns: string }
      notify_admins: {
        Args: {
          _body: string
          _category: string
          _link: string
          _title: string
          _type: string
        }
        Returns: undefined
      }
      notify_customer: {
        Args: {
          _body: string
          _order_id: string
          _title: string
          _type: string
        }
        Returns: undefined
      }
      notify_vendor_members:
        | {
            Args: {
              _body: string
              _title: string
              _type: string
              _vendor_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _body: string
              _link: string
              _title: string
              _type: string
              _vendor_id: string
            }
            Returns: undefined
          }
      notify_warehouse: {
        Args: { _body: string; _link: string; _title: string; _type: string }
        Returns: undefined
      }
      order_contains_vendor_sale: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      order_id_is_placed: { Args: { _order_id: string }; Returns: boolean }
      order_is_placed: {
        Args: { _payment_method: string; _payment_status: string }
        Returns: boolean
      }
      order_ref: { Args: { _order_id: string }; Returns: string }
      prepare_vendor_payouts: {
        Args: { _payout_date?: string }
        Returns: {
          net_payable: number
          order_count: number
          payout_id: string
          skipped_reason: string
          vendor_id: string
          vendor_name: string
        }[]
      }
      price_with_gst: {
        Args: { _category_id: string; _value: number }
        Returns: number
      }
      process_vendor_payout_queue: { Args: never; Returns: undefined }
      rates_on: {
        Args: { _at: string }
        Returns: {
          charge_courier_to_boutique: boolean
          created_at: string
          created_by: string | null
          effective_from: string
          fee_gst_pct: number
          fee_sac_code: string
          gst_tcs_pct: number
          id: string
          marketplace_commission_pct: number
          note: string | null
          payment_gateway_fee_pct: number
          payout_cutoff_time: string
          payout_cutoff_weekday: number
          payout_hold_hours: number
          payout_weekday: number
          tds_individual_exempt_upto: number
          tds_no_pan_pct: number
          tds_pct: number
          technology_fee_pct: number
        }
        SetofOptions: {
          from: "*"
          to: "platform_rates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recheck_vendor_payout: { Args: { _payout_id: string }; Returns: number }
      record_cod_received: {
        Args: {
          _received_at: string
          _source: string
          _utr: string
          _vendor_order_ids: string[]
        }
        Returns: number
      }
      remind_unconfirmed_orders: { Args: never; Returns: undefined }
      return_request_contains_vendor_item: {
        Args: { _return_request_id: string; _user_id: string }
        Returns: boolean
      }
      return_request_items_sole_vendor: {
        Args: { _items: Json }
        Returns: string
      }
      return_request_sole_vendor: {
        Args: { _request_id: string }
        Returns: string
      }
      statement_lines: {
        Args: { _from: string; _to: string; _vendor_id: string }
        Returns: {
          boutique_code: string
          boutique_name: string
          cod_charge: number
          commission: number
          courier: number
          delivered_on: string
          fee_gst: number
          fee_invoice_number: string
          gateway_fee: number
          goods_value: number
          gst: number
          net_payout: number
          net_taxable: number
          order_date: string
          order_number: string
          payment_date: string
          payment_method: string
          payout_status: string
          product_value: number
          refunded: number
          status: string
          supply_type: string
          tcs_cgst: number
          tcs_igst: number
          tcs_rate: number
          tcs_sgst: number
          tds: number
          tds_rate: number
          tech_fee: number
          utr: string
          vendor_id: string
          vendor_order_id: string
        }[]
      }
      submit_vendor_application: { Args: { _app: Json }; Returns: string }
      value_from_price: {
        Args: { _category_id: string; _price: number }
        Returns: number
      }
      vendor_bank_last4: { Args: { _vendor_id: string }; Returns: string }
      vendor_document_label: { Args: { _doc_type: string }; Returns: string }
      vendor_optional_documents: {
        Args: { _constitution: string }
        Returns: string[]
      }
      vendor_order_items_snapshot: {
        Args: { _vendor_order_id: string }
        Returns: Json
      }
      vendor_order_payout_blocker: {
        Args: { _vendor_order_id: string }
        Returns: string
      }
      vendor_order_payout_blockers: {
        Args: { _vendor_order_ids: string[] }
        Returns: {
          blocker: string
          vendor_order_id: string
        }[]
      }
      vendor_order_payout_date: {
        Args: { _delivered_at: string; _vendor_order_id: string }
        Returns: string
      }
      vendor_order_payout_date_for: {
        Args: {
          _delivered_at: string
          _vendor_order_id: string
          _window_end: string
        }
        Returns: string
      }
      vendor_order_payout_hold_days: {
        Args: { _vendor_order_id: string }
        Returns: number
      }
      vendor_order_window_end: {
        Args: {
          _delivered_at: string
          _vendor_order_id: string
          _window_end: string
        }
        Returns: string
      }
      vendor_payout_account_link: { Args: never; Returns: string }
      vendor_required_documents: {
        Args: { _constitution: string }
        Returns: string[]
      }
      vendor_respond_to_return: {
        Args: { _decision: string; _note?: string; _request_id: string }
        Returns: {
          additional_notes: string | null
          admin_notes: string | null
          created_at: string
          escalated_at: string | null
          evidence_video_url: string | null
          exchange_details: Json | null
          handled_by: string
          id: string
          items: Json
          order_id: string
          reason: string
          received_at_warehouse_at: string | null
          received_by: string | null
          refund_amount: number | null
          replacement_qc_notes: string | null
          replacement_qc_status: string | null
          replacement_received_at: string | null
          request_type: string
          return_destination: string | null
          status: string
          updated_at: string
          user_id: string
          vendor_decision_at: string | null
          vendor_notes: string | null
          warehouse_qc_at: string | null
          warehouse_qc_by: string | null
          warehouse_qc_notes: string | null
          warehouse_qc_status: string | null
          warehouse_shelf: string | null
        }
        SetofOptions: {
          from: "*"
          to: "return_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      warehouse_cancel_dispatch: {
        Args: { _dispatch_id: string }
        Returns: undefined
      }
      warehouse_create_dispatch: {
        Args: {
          _allow_partial?: boolean
          _breadth_cm: number
          _height_cm: number
          _length_cm: number
          _order_id: string
          _vendor_order_ids: string[]
          _weight_kg: number
        }
        Returns: {
          breadth_cm: number
          created_at: string
          height_cm: number
          id: string
          length_cm: number
          order_id: string
          packed_at: string
          packed_by: string | null
          purpose: string
          return_request_id: string | null
          rto_received_at: string | null
          status: string
          updated_at: string
          warehouse_id: string
          weight_kg: number
        }
        SetofOptions: {
          from: "*"
          to: "warehouse_dispatches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      warehouse_dispatch_by: { Args: { _received_at: string }; Returns: string }
      warehouse_receive_parcel: {
        Args: { _shelf?: string; _vendor_order_id: string }
        Returns: {
          arrived_at_warehouse_at: string | null
          carrier: string | null
          cod_handling_charge: number
          cod_received_at: string | null
          cod_received_source: string | null
          cod_received_utr: string | null
          commission_amount: number
          commission_rate: number
          courier_charge: number
          created_at: string
          delivered_at: string | null
          dispatch_id: string | null
          due_notified_at: string | null
          expected_at_warehouse_on: string | null
          fee_gst_amount: number
          fee_gst_rate: number
          fee_invoice_id: string | null
          fees_computed_at: string | null
          gateway_fee_amount: number
          gateway_fee_rate: number
          goods_gst: number
          goods_value: number
          hsn_missing: boolean
          id: string
          late_reminder_sent_at: string | null
          net_payable: number
          order_id: string
          overdue_alerted_at: string | null
          payout_eligible_on: string | null
          payout_id: string | null
          payout_notified_at: string | null
          product_value: number
          qc_at: string | null
          qc_by: string | null
          qc_notes: string | null
          qc_status: string | null
          rates_effective_from: string | null
          ready_by: string | null
          received_at_warehouse_at: string | null
          received_by: string | null
          reminder_sent_at: string | null
          return_window_ends_on: string | null
          rzp_released_at: string | null
          rzp_reversed_amount: number
          rzp_settled_at: string | null
          rzp_settlement_id: string | null
          rzp_settlement_utr: string | null
          rzp_transfer_amount: number | null
          rzp_transfer_error: string | null
          rzp_transfer_id: string | null
          rzp_transfer_kind: string | null
          rzp_transfer_status: string | null
          shipping_cost: number
          shipping_to_boutique: boolean
          status: string
          subtotal: number
          supply_type: string | null
          tcs_amount: number
          tcs_rate: number
          tds_amount: number
          tds_rate: number
          tech_fee_amount: number
          tech_fee_rate: number
          tracking_number: string | null
          updated_at: string
          vendor_id: string
          warehouse_shelf: string | null
        }
        SetofOptions: {
          from: "*"
          to: "vendor_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      warehouse_receive_replacement: {
        Args: { _return_request_id: string }
        Returns: {
          additional_notes: string | null
          admin_notes: string | null
          created_at: string
          escalated_at: string | null
          evidence_video_url: string | null
          exchange_details: Json | null
          handled_by: string
          id: string
          items: Json
          order_id: string
          reason: string
          received_at_warehouse_at: string | null
          received_by: string | null
          refund_amount: number | null
          replacement_qc_notes: string | null
          replacement_qc_status: string | null
          replacement_received_at: string | null
          request_type: string
          return_destination: string | null
          status: string
          updated_at: string
          user_id: string
          vendor_decision_at: string | null
          vendor_notes: string | null
          warehouse_qc_at: string | null
          warehouse_qc_by: string | null
          warehouse_qc_notes: string | null
          warehouse_qc_status: string | null
          warehouse_shelf: string | null
        }
        SetofOptions: {
          from: "*"
          to: "return_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      warehouse_receive_return: {
        Args: { _return_request_id: string; _shelf?: string }
        Returns: {
          additional_notes: string | null
          admin_notes: string | null
          created_at: string
          escalated_at: string | null
          evidence_video_url: string | null
          exchange_details: Json | null
          handled_by: string
          id: string
          items: Json
          order_id: string
          reason: string
          received_at_warehouse_at: string | null
          received_by: string | null
          refund_amount: number | null
          replacement_qc_notes: string | null
          replacement_qc_status: string | null
          replacement_received_at: string | null
          request_type: string
          return_destination: string | null
          status: string
          updated_at: string
          user_id: string
          vendor_decision_at: string | null
          vendor_notes: string | null
          warehouse_qc_at: string | null
          warehouse_qc_by: string | null
          warehouse_qc_notes: string | null
          warehouse_qc_status: string | null
          warehouse_shelf: string | null
        }
        SetofOptions: {
          from: "*"
          to: "return_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      warehouse_receive_rto: {
        Args: { _dispatch_id: string }
        Returns: {
          breadth_cm: number
          created_at: string
          height_cm: number
          id: string
          length_cm: number
          order_id: string
          packed_at: string
          packed_by: string | null
          purpose: string
          return_request_id: string | null
          rto_received_at: string | null
          status: string
          updated_at: string
          warehouse_id: string
          weight_kg: number
        }
        SetofOptions: {
          from: "*"
          to: "warehouse_dispatches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      warehouse_record_qc: {
        Args: { _notes?: string; _passed: boolean; _vendor_order_id: string }
        Returns: {
          arrived_at_warehouse_at: string | null
          carrier: string | null
          cod_handling_charge: number
          cod_received_at: string | null
          cod_received_source: string | null
          cod_received_utr: string | null
          commission_amount: number
          commission_rate: number
          courier_charge: number
          created_at: string
          delivered_at: string | null
          dispatch_id: string | null
          due_notified_at: string | null
          expected_at_warehouse_on: string | null
          fee_gst_amount: number
          fee_gst_rate: number
          fee_invoice_id: string | null
          fees_computed_at: string | null
          gateway_fee_amount: number
          gateway_fee_rate: number
          goods_gst: number
          goods_value: number
          hsn_missing: boolean
          id: string
          late_reminder_sent_at: string | null
          net_payable: number
          order_id: string
          overdue_alerted_at: string | null
          payout_eligible_on: string | null
          payout_id: string | null
          payout_notified_at: string | null
          product_value: number
          qc_at: string | null
          qc_by: string | null
          qc_notes: string | null
          qc_status: string | null
          rates_effective_from: string | null
          ready_by: string | null
          received_at_warehouse_at: string | null
          received_by: string | null
          reminder_sent_at: string | null
          return_window_ends_on: string | null
          rzp_released_at: string | null
          rzp_reversed_amount: number
          rzp_settled_at: string | null
          rzp_settlement_id: string | null
          rzp_settlement_utr: string | null
          rzp_transfer_amount: number | null
          rzp_transfer_error: string | null
          rzp_transfer_id: string | null
          rzp_transfer_kind: string | null
          rzp_transfer_status: string | null
          shipping_cost: number
          shipping_to_boutique: boolean
          status: string
          subtotal: number
          supply_type: string | null
          tcs_amount: number
          tcs_rate: number
          tds_amount: number
          tds_rate: number
          tech_fee_amount: number
          tech_fee_rate: number
          tracking_number: string | null
          updated_at: string
          vendor_id: string
          warehouse_shelf: string | null
        }
        SetofOptions: {
          from: "*"
          to: "vendor_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      warehouse_update_dispatch_parcel: {
        Args: {
          _breadth_cm: number
          _dispatch_id: string
          _height_cm: number
          _length_cm: number
          _weight_kg: number
        }
        Returns: {
          breadth_cm: number
          created_at: string
          height_cm: number
          id: string
          length_cm: number
          order_id: string
          packed_at: string
          packed_by: string | null
          purpose: string
          return_request_id: string | null
          rto_received_at: string | null
          status: string
          updated_at: string
          warehouse_id: string
          weight_kg: number
        }
        SetofOptions: {
          from: "*"
          to: "warehouse_dispatches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      warehouse_watch: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "vendor_admin"
        | "vendor_staff"
        | "warehouse_staff"
      membership_plan: "monthly" | "annual"
      membership_status: "active" | "cancelled" | "expired"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "admin",
        "user",
        "vendor_admin",
        "vendor_staff",
        "warehouse_staff",
      ],
      membership_plan: ["monthly", "annual"],
      membership_status: ["active", "cancelled", "expired"],
    },
  },
} as const
