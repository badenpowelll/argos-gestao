-- 1. Create security definer function to get user's company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_company_id FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_company_id TO authenticated;

-- 2. Drop the recursive policy on profiles
DROP POLICY IF EXISTS "Users can view company profiles" ON public.profiles;

-- 3. Recreate it using the security definer function
CREATE POLICY "Users can view company profiles"
ON public.profiles
FOR SELECT
USING (company_id = public.get_user_company_id());

-- 4. Fix companies SELECT policy (also uses profiles subquery)
DROP POLICY IF EXISTS "Users can view own company" ON public.companies;
CREATE POLICY "Users can view own company"
ON public.companies
FOR SELECT
USING (id = public.get_user_company_id());

-- 5. Fix other policies that reference profiles in subqueries
DROP POLICY IF EXISTS "Company members can view geofences" ON public.geofences;
CREATE POLICY "Company members can view geofences"
ON public.geofences
FOR SELECT
USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Company members can view teams" ON public.teams;
CREATE POLICY "Company members can view teams"
ON public.teams
FOR SELECT
TO authenticated
USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Company members can view schedules" ON public.work_schedules;
CREATE POLICY "Company members can view schedules"
ON public.work_schedules
FOR SELECT
USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Managers can view company hour bank" ON public.hour_bank;
CREATE POLICY "Managers can view company hour bank"
ON public.hour_bank
FOR SELECT
USING (
  company_id = public.get_user_company_id()
  AND (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Admins can view subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can view subscriptions"
ON public.subscriptions
FOR SELECT
USING (
  company_id = public.get_user_company_id()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
);

DROP POLICY IF EXISTS "Managers can view company adjustments" ON public.adjustments;
CREATE POLICY "Managers can view company adjustments"
ON public.adjustments
FOR SELECT
USING (
  company_id = public.get_user_company_id()
  AND (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Managers can view company entries" ON public.time_entries;
CREATE POLICY "Managers can view company entries"
ON public.time_entries
FOR SELECT
USING (
  company_id = public.get_user_company_id()
  AND (has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
);