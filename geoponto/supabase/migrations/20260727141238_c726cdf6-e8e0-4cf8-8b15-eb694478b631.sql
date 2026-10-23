-- Remove política pública que permitia qualquer pessoa ler as fotos
DROP POLICY IF EXISTS "Public read access to avatars" ON storage.objects;
-- Remove política que permitia qualquer usuário autenticado ver fotos de outros
DROP POLICY IF EXISTS "Anyone can view face images" ON storage.objects;
-- Remove política antiga baseada em foldername[2] (só cobria face-images) para consolidar
DROP POLICY IF EXISTS "Avatar images viewable by company members" ON storage.objects;

-- Nova política única de leitura autenticada, cobrindo:
--  - avatares de perfil (path: {user_id}/...)
--  - fotos de ponto (path: face-images/{user_id}/...)
CREATE POLICY "Avatars readable by owner or company staff"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    -- Dono do arquivo (avatar de perfil)
    (storage.foldername(name))[1] = (auth.uid())::text
    -- Dono da foto de ponto
    OR ((storage.foldername(name))[1] = 'face-images' AND (storage.foldername(name))[2] = (auth.uid())::text)
    -- Gestor/admin/owner da mesma empresa que o dono do avatar
    OR EXISTS (
      SELECT 1
      FROM public.profiles viewer
      JOIN public.profiles target ON target.user_id::text = (storage.foldername(objects.name))[1]
      JOIN public.user_roles ur ON ur.user_id = viewer.user_id
      WHERE viewer.user_id = auth.uid()
        AND ur.role IN ('admin','owner','manager')
        AND viewer.company_id = target.company_id
    )
    -- Gestor/admin/owner da mesma empresa que o dono da foto de ponto
    OR EXISTS (
      SELECT 1
      FROM public.profiles viewer
      JOIN public.profiles target ON target.user_id::text = (storage.foldername(objects.name))[2]
      JOIN public.user_roles ur ON ur.user_id = viewer.user_id
      WHERE viewer.user_id = auth.uid()
        AND ur.role IN ('admin','owner','manager')
        AND viewer.company_id = target.company_id
        AND (storage.foldername(objects.name))[1] = 'face-images'
    )
  )
);