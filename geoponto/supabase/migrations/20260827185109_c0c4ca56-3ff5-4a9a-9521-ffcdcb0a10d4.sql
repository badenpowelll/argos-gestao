CREATE TABLE public.solicitacoes_suporte (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL,
  nome text NOT NULL DEFAULT '',
  email_ou_matricula text NOT NULL DEFAULT '',
  modulo_origem text NOT NULL DEFAULT '',
  mensagem text NOT NULL,
  anexo_url text,
  status text NOT NULL DEFAULT 'Aberto',
  resposta text,
  sincronizado boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.solicitacoes_suporte TO authenticated;
GRANT ALL ON public.solicitacoes_suporte TO service_role;

ALTER TABLE public.solicitacoes_suporte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own support requests"
ON public.solicitacoes_suporte FOR SELECT TO authenticated
USING (auth.uid() = usuario_id);

CREATE POLICY "Users can create own support requests"
ON public.solicitacoes_suporte FOR INSERT TO authenticated
WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Admins can view all support requests"
ON public.solicitacoes_suporte FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Admins can update all support requests"
ON public.solicitacoes_suporte FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE INDEX idx_solicitacoes_suporte_usuario ON public.solicitacoes_suporte(usuario_id);
CREATE INDEX idx_solicitacoes_suporte_status ON public.solicitacoes_suporte(status);

CREATE TRIGGER update_solicitacoes_suporte_updated_at
BEFORE UPDATE ON public.solicitacoes_suporte
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Políticas de storage para o bucket privado de anexos de suporte
CREATE POLICY "Users can upload own support attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'suporte-anexos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users and admins can read support attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'suporte-anexos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  )
);