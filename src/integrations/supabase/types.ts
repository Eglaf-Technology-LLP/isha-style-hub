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
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      discounts: {
        Row: {
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
      order_items: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_returnable: boolean
          order_id: string
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
          id?: string
          is_returnable?: boolean
          order_id: string
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
          id?: string
          is_returnable?: boolean
          order_id?: string
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
      orders: {
        Row: {
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
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
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
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
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
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
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
          approval_status: string
          breadth_cm: number | null
          category_id: string | null
          compare_at_price: number | null
          country_of_origin: string
          created_at: string
          description: string | null
          height_cm: number | null
          id: string
          images: string[] | null
          is_active: boolean
          is_returnable: boolean
          length_cm: number | null
          low_stock_threshold: number
          name: string
          net_quantity: string
          price: number
          rejection_reason: string | null
          related_product_ids: string[] | null
          sku: string | null
          specifications: Json
          stock_quantity: number
          tags: string[] | null
          updated_at: string
          vendor_id: string | null
          weight_grams: number | null
        }
        Insert: {
          approval_status?: string
          breadth_cm?: number | null
          category_id?: string | null
          compare_at_price?: number | null
          country_of_origin?: string
          created_at?: string
          description?: string | null
          height_cm?: number | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          is_returnable?: boolean
          length_cm?: number | null
          low_stock_threshold?: number
          name: string
          net_quantity?: string
          price?: number
          rejection_reason?: string | null
          related_product_ids?: string[] | null
          sku?: string | null
          specifications?: Json
          stock_quantity?: number
          tags?: string[] | null
          updated_at?: string
          vendor_id?: string | null
          weight_grams?: number | null
        }
        Update: {
          approval_status?: string
          breadth_cm?: number | null
          category_id?: string | null
          compare_at_price?: number | null
          country_of_origin?: string
          created_at?: string
          description?: string | null
          height_cm?: number | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          is_returnable?: boolean
          length_cm?: number | null
          low_stock_threshold?: number
          name?: string
          net_quantity?: string
          price?: number
          rejection_reason?: string | null
          related_product_ids?: string[] | null
          sku?: string | null
          specifications?: Json
          stock_quantity?: number
          tags?: string[] | null
          updated_at?: string
          vendor_id?: string | null
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
          exchange_details: Json | null
          id: string
          items: Json
          order_id: string
          reason: string
          refund_amount: number | null
          request_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_notes?: string | null
          admin_notes?: string | null
          created_at?: string
          exchange_details?: Json | null
          id?: string
          items?: Json
          order_id: string
          reason: string
          refund_amount?: number | null
          request_type?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_notes?: string | null
          admin_notes?: string | null
          created_at?: string
          exchange_details?: Json | null
          id?: string
          items?: Json
          order_id?: string
          reason?: string
          refund_amount?: number | null
          request_type?: string
          status?: string
          updated_at?: string
          user_id?: string
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
          courier_id: number | null
          courier_name: string | null
          created_at: string
          delivered_at: string | null
          id: string
          invoice_url: string | null
          label_url: string | null
          manifest_url: string | null
          picked_up_at: string | null
          pickup_scheduled_at: string | null
          return_request_id: string | null
          rto_initiated_at: string | null
          shipment_type: string
          shiprocket_channel_order_id: string | null
          shiprocket_order_id: number | null
          shiprocket_shipment_id: number | null
          status: string
          status_raw: string | null
          updated_at: string
          vendor_order_id: string
        }
        Insert: {
          awb_code?: string | null
          courier_id?: number | null
          courier_name?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          invoice_url?: string | null
          label_url?: string | null
          manifest_url?: string | null
          picked_up_at?: string | null
          pickup_scheduled_at?: string | null
          return_request_id?: string | null
          rto_initiated_at?: string | null
          shipment_type?: string
          shiprocket_channel_order_id?: string | null
          shiprocket_order_id?: number | null
          shiprocket_shipment_id?: number | null
          status?: string
          status_raw?: string | null
          updated_at?: string
          vendor_order_id: string
        }
        Update: {
          awb_code?: string | null
          courier_id?: number | null
          courier_name?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          invoice_url?: string | null
          label_url?: string | null
          manifest_url?: string | null
          picked_up_at?: string | null
          pickup_scheduled_at?: string | null
          return_request_id?: string | null
          rto_initiated_at?: string | null
          shipment_type?: string
          shiprocket_channel_order_id?: string | null
          shiprocket_order_id?: number | null
          shiprocket_shipment_id?: number | null
          status?: string
          status_raw?: string | null
          updated_at?: string
          vendor_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
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
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          measurements?: Json
          name: string
          sizes?: Json
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          measurements?: Json
          name?: string
          sizes?: Json
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
          carrier: string | null
          commission_amount: number
          commission_rate: number
          created_at: string
          id: string
          net_payable: number
          order_id: string
          shipping_cost: number
          status: string
          subtotal: number
          tracking_number: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          carrier?: string | null
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          id?: string
          net_payable?: number
          order_id: string
          shipping_cost?: number
          status?: string
          subtotal?: number
          tracking_number?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          carrier?: string | null
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          id?: string
          net_payable?: number
          order_id?: string
          shipping_cost?: number
          status?: string
          subtotal?: number
          tracking_number?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          business_type: string
          created_at: string
          id: string
          razorpay_account_id: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          account_holder_name: string
          bank_account_number: string
          bank_ifsc: string
          business_type?: string
          created_at?: string
          id?: string
          razorpay_account_id?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          account_holder_name?: string
          bank_account_number?: string
          bank_ifsc?: string
          business_type?: string
          created_at?: string
          id?: string
          razorpay_account_id?: string | null
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
          commission_amount: number
          created_at: string
          gross_sales: number
          id: string
          net_payable: number
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          commission_amount?: number
          created_at?: string
          gross_sales?: number
          id?: string
          net_payable?: number
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          commission_amount?: number
          created_at?: string
          gross_sales?: number
          id?: string
          net_payable?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
          vendor_id?: string
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
      vendors: {
        Row: {
          address: Json | null
          approved_at: string | null
          approved_by: string | null
          banner_url: string | null
          commission_rate: number
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          description: string | null
          free_shipping_threshold: number | null
          gst_number: string | null
          id: string
          is_trusted: boolean
          logo_url: string | null
          name: string
          owner_user_id: string | null
          pan_number: string | null
          payout_account_status: string
          rating: number | null
          return_policy: string | null
          return_window_days: number
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
          commission_rate?: number
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          free_shipping_threshold?: number | null
          gst_number?: string | null
          id?: string
          is_trusted?: boolean
          logo_url?: string | null
          name: string
          owner_user_id?: string | null
          pan_number?: string | null
          payout_account_status?: string
          rating?: number | null
          return_policy?: string | null
          return_window_days?: number
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
          commission_rate?: number
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          free_shipping_threshold?: number | null
          gst_number?: string | null
          id?: string
          is_trusted?: boolean
          logo_url?: string | null
          name?: string
          owner_user_id?: string | null
          pan_number?: string | null
          payout_account_status?: string
          rating?: number | null
          return_policy?: string | null
          return_window_days?: number
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
      cancel_pending_order: { Args: { _order_id: string }; Returns: undefined }
      get_user_vendor_id: { Args: { _user_id: string }; Returns: string }
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
      is_vendor_member: {
        Args: { _user_id: string; _vendor_id: string }
        Returns: boolean
      }
      order_contains_vendor_sale: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "vendor_admin" | "vendor_staff"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "user", "vendor_admin", "vendor_staff"],
      membership_plan: ["monthly", "annual"],
      membership_status: ["active", "cancelled", "expired"],
    },
  },
} as const
