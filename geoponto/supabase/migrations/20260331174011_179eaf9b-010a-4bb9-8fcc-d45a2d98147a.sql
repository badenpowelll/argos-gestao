
CREATE POLICY "Anon can view companies for registration"
  ON public.companies FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can view teams for registration"
  ON public.teams FOR SELECT
  TO anon
  USING (true);
