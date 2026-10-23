-- 1. Bloqueia auto-alteração de company_id/team_id por usuário comum
CREATE OR REPLACE FUNCTION public.protect_profile_company_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Chamadas sem usuário autenticado (service_role / edge functions / triggers internos) passam
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner') THEN
    RETURN NEW;
  END IF;

  -- Usuário comum: preserva os valores antigos
  NEW.company_id := OLD.company_id;
  NEW.team_id := OLD.team_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_company_change ON public.profiles;
CREATE TRIGGER protect_profile_company_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_company_change();

-- 2. Recalcula o status do ponto no servidor
CREATE OR REPLACE FUNCTION public.enforce_time_entry_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  best_dist double precision := NULL;
  best_radius double precision := NULL;
  fence RECORD;
  d double precision;
  r constant double precision := 6371000;
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    NEW.status := 'flagged';
    RETURN NEW;
  END IF;

  FOR fence IN
    SELECT latitude, longitude, radius
    FROM public.geofences
    WHERE company_id = NEW.company_id
  LOOP
    d := r * 2 * atan2(
      sqrt(
        power(sin(radians(fence.latitude - NEW.latitude) / 2), 2) +
        cos(radians(NEW.latitude)) * cos(radians(fence.latitude)) *
        power(sin(radians(fence.longitude - NEW.longitude) / 2), 2)
      ),
      sqrt(
        1 - (
          power(sin(radians(fence.latitude - NEW.latitude) / 2), 2) +
          cos(radians(NEW.latitude)) * cos(radians(fence.latitude)) *
          power(sin(radians(fence.longitude - NEW.longitude) / 2), 2)
        )
      )
    );
    IF best_dist IS NULL OR d < best_dist THEN
      best_dist := d;
      best_radius := fence.radius;
    END IF;
  END LOOP;

  IF best_dist IS NULL THEN
    NEW.status := 'verified';
  ELSIF best_dist <= best_radius THEN
    NEW.status := 'verified';
  ELSE
    NEW.status := 'outside_perimeter';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_time_entry_status ON public.time_entries;
CREATE TRIGGER enforce_time_entry_status
BEFORE INSERT ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_time_entry_status();

-- 3. Restringe INSERT em audit_logs a gestores/admins/owners
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Privileged users can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'manager')
  )
);