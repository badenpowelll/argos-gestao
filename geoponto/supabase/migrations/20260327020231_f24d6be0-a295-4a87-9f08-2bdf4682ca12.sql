
-- Fix overly permissive audit_logs insert policy
DROP POLICY "System can insert audit logs" ON public.audit_logs;

CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
