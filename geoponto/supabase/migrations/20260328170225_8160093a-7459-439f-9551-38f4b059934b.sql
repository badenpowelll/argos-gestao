
ALTER TABLE public.adjustments ADD COLUMN proposed_time TIME NOT NULL DEFAULT '08:00';
ALTER TABLE public.adjustments ADD COLUMN punch_step TEXT NOT NULL DEFAULT 'entrada';

CREATE POLICY "Admins can update time entries"
ON public.time_entries
FOR UPDATE
TO authenticated
USING (
  (company_id = get_user_company_id()) AND 
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);
