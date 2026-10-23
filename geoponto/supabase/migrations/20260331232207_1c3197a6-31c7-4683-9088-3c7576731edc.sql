CREATE POLICY "Admins can delete registration requests"
ON public.registration_requests
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role));