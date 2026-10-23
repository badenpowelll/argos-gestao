
CREATE TABLE public.registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  company_id uuid REFERENCES public.companies(id),
  team_id uuid REFERENCES public.teams(id),
  avatar_url text,
  address_cep text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public form, no auth required)
CREATE POLICY "Anyone can submit registration requests"
  ON public.registration_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins/owners can view requests
CREATE POLICY "Admins can view registration requests"
  ON public.registration_requests FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role)
  );

-- Only admins/owners can update requests (approve/reject)
CREATE POLICY "Admins can update registration requests"
  ON public.registration_requests FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'owner'::app_role)
  );
