CREATE POLICY "Users can cancel their own pending return requests"
ON public.return_requests
FOR UPDATE
TO public
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status = 'cancelled');