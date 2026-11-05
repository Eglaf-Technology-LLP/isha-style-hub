-- Per-user "I've looked at this status bucket" marker, backing the
-- notification-style badges on the Orders page status tabs (Pending,
-- Cancelled, etc. - not the "All Orders" total, which stays a real live
-- count). list_key is prefixed per page/role (e.g. "orders_admin:cancelled",
-- "orders_vendor:pending") so admin and vendor tracking never collide, and
-- each status tracks independently.
CREATE TABLE public.order_list_seen (
  user_id uuid NOT NULL,
  list_key text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list_key)
);

ALTER TABLE public.order_list_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own seen marks"
  ON public.order_list_seen FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
