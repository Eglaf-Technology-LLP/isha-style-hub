
-- Create return request types
CREATE TABLE public.return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  user_id uuid NOT NULL,
  request_type text NOT NULL DEFAULT 'return', -- 'return' or 'exchange'
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected, picked_up, completed, cancelled
  reason text NOT NULL,
  additional_notes text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb, -- array of {order_item_id, product_title, quantity, size, color}
  exchange_details jsonb, -- for exchange: {new_size, new_color, new_variant_id}
  admin_notes text,
  refund_amount numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can create return requests"
ON public.return_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own return requests"
ON public.return_requests
FOR SELECT
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage return requests"
ON public.return_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_return_requests_updated_at
BEFORE UPDATE ON public.return_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
