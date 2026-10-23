
-- Create enum for absence justification types
CREATE TYPE public.absence_type AS ENUM ('folga', 'feriado_nacional', 'feriado_estadual', 'feriado_municipal');

-- Create table
CREATE TABLE public.absence_justifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id),
  date DATE NOT NULL,
  type absence_type NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.absence_justifications ENABLE ROW LEVEL SECURITY;

-- Admins can do everything for their company
CREATE POLICY "Admins can manage absence justifications"
ON public.absence_justifications
FOR ALL
TO authenticated
USING (
  (company_id = get_user_company_id()) AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
)
WITH CHECK (
  (company_id = get_user_company_id()) AND
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role))
);

-- Users can view their own justifications
CREATE POLICY "Users can view own absence justifications"
ON public.absence_justifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_absence_justifications_updated_at
BEFORE UPDATE ON public.absence_justifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
