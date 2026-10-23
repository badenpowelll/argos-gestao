-- Allow users to also view a company they just created (before profile is updated)
DROP POLICY IF EXISTS "Users can view own company" ON public.companies;
CREATE POLICY "Users can view own company"
ON public.companies FOR SELECT
TO authenticated
USING (
  id = get_user_company_id()
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'owner'::app_role)
);