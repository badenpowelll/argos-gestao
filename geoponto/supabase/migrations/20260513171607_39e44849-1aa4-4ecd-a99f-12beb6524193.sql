-- Remove a política recursiva (subquery na própria tabela causava bloqueio silencioso)
DROP POLICY IF EXISTS "Profiles viewable by company members" ON public.profiles;

-- Recria usando a função SECURITY DEFINER já existente (sem recursão)
CREATE POLICY "Profiles viewable by company members"
ON public.profiles
FOR SELECT
USING (
  company_id = public.get_user_company_id()
  OR auth.uid() = user_id
);

-- Também corrige a política UPDATE para evitar a mesma recursão
DROP POLICY IF EXISTS "Users can update own profile or admins can update company profiles" ON public.profiles;

CREATE POLICY "Users can update own profile or admins can update company profiles"
ON public.profiles
FOR UPDATE
USING (
  auth.uid() = user_id
  OR (
    (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role))
    AND company_id = public.get_user_company_id()
  )
);
