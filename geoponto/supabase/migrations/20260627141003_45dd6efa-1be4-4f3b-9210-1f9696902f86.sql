
-- 1) Adjustments: escopo de empresa para UPDATE de gestores
DROP POLICY IF EXISTS "Managers can update adjustments" ON public.adjustments;
CREATE POLICY "Managers can update adjustments"
  ON public.adjustments
  FOR UPDATE
  USING (
    company_id = public.get_user_company_id()
    AND (public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id()
    AND (public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  );

-- 2) Storage: face-images precisam validar o segundo segmento = auth.uid()
DROP POLICY IF EXISTS "Users can upload their own face images" ON storage.objects;
CREATE POLICY "Users can upload their own face images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'face-images'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 3) Audit logs: bloquear user_id NULL (impede forjar log anônimo)
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4) Companies / Teams: remover acesso anônimo amplo
DROP POLICY IF EXISTS "Anon can view companies for registration" ON public.companies;
DROP POLICY IF EXISTS "Anon can view teams for registration" ON public.teams;

-- 5) RPCs públicas e seguras que devolvem APENAS id + name para o formulário
CREATE OR REPLACE FUNCTION public.get_public_companies()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name FROM public.companies ORDER BY name;
$$;

CREATE OR REPLACE FUNCTION public.get_public_teams()
RETURNS TABLE (id uuid, name text, company_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, company_id FROM public.teams ORDER BY name;
$$;

REVOKE ALL ON FUNCTION public.get_public_companies() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_teams() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_companies() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_teams() TO anon, authenticated;
