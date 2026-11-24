-- 22 Nov 2026: order notices go by email only for now (client decision). SMS
-- needs Twilio India + DLT approval first (supabase/live-setup/ORDER_SMS_DLT.md).
--
-- queue_order_sms now does nothing. The triggers from
-- 20261119100000_order_sms_notifications.sql stay, so no SMS is attempted and
-- nothing is written to order_sms_logs. Emails are separate and unchanged.
--
-- Turning the triggers off instead would not last: scripts/media-to-r2 runs
-- ENABLE TRIGGER USER on the tables it updates.
--
-- To switch SMS on, add a migration that restores queue_order_sms from
-- 20261119100000_order_sms_notifications.sql.
CREATE OR REPLACE FUNCTION public.queue_order_sms(_order_id uuid, _event text, _vendor_order_id uuid DEFAULT NULL, _return_request_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_order_sms(uuid, text, uuid, uuid) FROM public, anon, authenticated;
