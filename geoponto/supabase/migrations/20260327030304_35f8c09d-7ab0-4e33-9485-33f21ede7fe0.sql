
-- Create teams table
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Admins/owners can manage teams
CREATE POLICY "Admins can manage teams"
ON public.teams FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner'));

-- Company members can view teams
CREATE POLICY "Company members can view teams"
ON public.teams FOR SELECT
TO authenticated
USING (company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Add team_id to profiles
ALTER TABLE public.profiles ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
