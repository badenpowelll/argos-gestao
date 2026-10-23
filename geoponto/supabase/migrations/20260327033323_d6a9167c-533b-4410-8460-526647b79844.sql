CREATE POLICY "Admins can insert companies"
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role)
);