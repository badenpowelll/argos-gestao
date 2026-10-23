-- 1. Restringir acesso a profiles apenas para usuários da mesma empresa
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by company members" 
ON public.profiles 
FOR SELECT 
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- 2. Garantir que administradores só possam atualizar perfis da sua empresa
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update own profile or admins can update company profiles"
ON public.profiles
FOR UPDATE
USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = auth.uid()
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'owner')
    AND p.company_id = public.profiles.company_id
  )
);

-- 3. Índices de Performance
CREATE INDEX IF NOT EXISTS idx_time_entries_company_timestamp ON public.time_entries (company_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON public.time_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON public.audit_logs (company_id, created_at DESC);

-- 4. Ajustar Bucket de Storage (Segurança)
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images viewable by company members"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'avatars' AND
  (
    -- Proprietário da imagem
    (storage.foldername(storage.objects.name))[2] = auth.uid()::text OR
    -- Admin da mesma empresa
    EXISTS (
      SELECT 1 FROM public.profiles viewer
      JOIN public.profiles target ON target.user_id::text = (storage.foldername(storage.objects.name))[2]
      JOIN public.user_roles ur ON ur.user_id = viewer.user_id
      WHERE viewer.user_id = auth.uid()
      AND ur.role IN ('admin', 'owner', 'manager')
      AND viewer.company_id = target.company_id
    )
  )
);
