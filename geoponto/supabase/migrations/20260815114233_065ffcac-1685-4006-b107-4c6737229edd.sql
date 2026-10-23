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
  is_privileged boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    is_privileged := public.has_role(auth.uid(), 'admin')
                  OR public.has_role(auth.uid(), 'owner')
                  OR public.has_role(auth.uid(), 'manager');
  ELSE
    -- service_role / edge functions: lançamento administrativo, confia no status
    RETURN NEW;
  END IF;

  -- Lançamento administrativo (ajuste aprovado, ponto lançado para outro usuário,
  -- ou registro manual sem GPS): confia no status enviado pela aplicação.
  IF is_privileged AND (
       NEW.user_id <> auth.uid()
       OR NEW.latitude IS NULL
       OR NEW.longitude IS NULL
     ) THEN
    RETURN NEW;
  END IF;

  -- Auto-registro do próprio funcionário: recalcula no servidor.
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

  IF best_dist IS NULL OR best_dist <= best_radius THEN
    NEW.status := 'verified';
  ELSE
    NEW.status := 'outside_perimeter';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_time_entry_status() FROM PUBLIC, anon, authenticated;