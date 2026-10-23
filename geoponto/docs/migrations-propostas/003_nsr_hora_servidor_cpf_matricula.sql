-- PROPOSTA — NÃO APLICADA. Depende de autorização expressa do proprietário.
-- Migration ADITIVA: só ADICIONA colunas/tabela/triggers. Não altera nem apaga dados existentes e NÃO faz backfill.
-- Fica fora de supabase/** de propósito.
--
-- O que resolve (matriz de conformidade MTE): NSR gravado e sequencial por empresa; hora do servidor ao lado da hora da
-- marcação (relógio do aparelho); código de integridade encadeado gravado; CPF/matrícula/admissão no cadastro; trilha das
-- edições de marcação. A política "Admins can update time entries" NÃO é alterada (decisão do proprietário, 23/10/2026).

-- 1) Dados trabalhistas no cadastro.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS admission_date date;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cpf_formato CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_unico_por_empresa ON public.profiles (company_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_matricula_unica_por_empresa ON public.profiles (company_id, registration_number) WHERE registration_number IS NOT NULL;

-- Só admin/dono altera CPF, matrícula e admissão (o usuário pode editar o próprio perfil, mas não esses campos).
CREATE OR REPLACE FUNCTION public.guard_labor_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.cpf IS DISTINCT FROM OLD.cpf OR NEW.registration_number IS DISTINCT FROM OLD.registration_number
      OR NEW.admission_date IS DISTINCT FROM OLD.admission_date)
     AND auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'Somente admin ou dono altera CPF, matrícula e admissão';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_guard_labor_fields BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_labor_fields();

-- 2) Marcações: hora do servidor, NSR e integridade.
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS server_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS clock_offset_seconds integer,
  ADD COLUMN IF NOT EXISTS nsr bigint,
  ADD COLUMN IF NOT EXISTS prev_hash text,
  ADD COLUMN IF NOT EXISTS record_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS time_entries_nsr_unico_por_empresa ON public.time_entries (company_id, nsr) WHERE nsr IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.company_nsr_counter (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_nsr   bigint NOT NULL,
  last_hash  text NOT NULL
);
ALTER TABLE public.company_nsr_counter ENABLE ROW LEVEL SECURITY;  -- sem políticas: só o trigger (SECURITY DEFINER) acessa

CREATE OR REPLACE FUNCTION public.time_entries_stamp() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cnpj text; seed bigint; last_h text; canon text;
BEGIN
  NEW.server_received_at := now();                       -- hora do servidor: o cliente não define
  NEW.clock_offset_seconds := round(extract(epoch FROM (NEW.server_received_at - NEW.timestamp)))::integer;
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;     -- sem empresa, sem NSR

  -- NSR sequencial por empresa, sem lacunas: o contador é travado pela linha. Primeira vez: continua após o legado.
  SELECT count(*) INTO seed FROM public.time_entries WHERE company_id = NEW.company_id;
  INSERT INTO public.company_nsr_counter (company_id, last_nsr, last_hash)
  VALUES (NEW.company_id, seed, repeat('0', 64))
  ON CONFLICT (company_id) DO NOTHING;
  SELECT last_nsr + 1, last_hash INTO NEW.nsr, last_h FROM public.company_nsr_counter WHERE company_id = NEW.company_id FOR UPDATE;

  SELECT regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') INTO v_cnpj FROM public.companies c WHERE c.id = NEW.company_id;
  canon := to_char(NEW.timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  NEW.prev_hash := last_h;
  NEW.record_hash := encode(sha256(convert_to(concat_ws('|', last_h, NEW.nsr, v_cnpj, NEW.user_id, canon, NEW.type), 'UTF8')), 'hex');

  UPDATE public.company_nsr_counter SET last_nsr = NEW.nsr, last_hash = NEW.record_hash WHERE company_id = NEW.company_id;
  RETURN NEW;
END $$;
CREATE TRIGGER time_entries_stamp BEFORE INSERT ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.time_entries_stamp();

-- Colunas de integridade não mudam. Edições de hora/tipo continuam permitidas pela política atual, mas ficam registradas.
CREATE OR REPLACE FUNCTION public.time_entries_guard_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.nsr IS DISTINCT FROM OLD.nsr OR NEW.record_hash IS DISTINCT FROM OLD.record_hash
     OR NEW.prev_hash IS DISTINCT FROM OLD.prev_hash OR NEW.server_received_at IS DISTINCT FROM OLD.server_received_at
     OR NEW.clock_offset_seconds IS DISTINCT FROM OLD.clock_offset_seconds THEN
    RAISE EXCEPTION 'NSR, hora do servidor e códigos de integridade não podem ser alterados';
  END IF;
  IF NEW.timestamp IS DISTINCT FROM OLD.timestamp OR NEW.type IS DISTINCT FROM OLD.type OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    INSERT INTO public.audit_logs (user_id, company_id, action, metadata, snapshot_before, snapshot_after)
    VALUES (auth.uid(), OLD.company_id, 'time_entry_edited',
            jsonb_build_object('time_entry_id', OLD.id, 'nsr', OLD.nsr),
            jsonb_build_object('timestamp', OLD.timestamp, 'type', OLD.type, 'user_id', OLD.user_id),
            jsonb_build_object('timestamp', NEW.timestamp, 'type', NEW.type, 'user_id', NEW.user_id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER time_entries_guard_update BEFORE UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.time_entries_guard_update();

-- ROLLBACK (as colunas novas ficam; remova só se não houver NSR gravados):
--   DROP TRIGGER time_entries_guard_update ON public.time_entries; DROP FUNCTION public.time_entries_guard_update();
--   DROP TRIGGER time_entries_stamp ON public.time_entries;        DROP FUNCTION public.time_entries_stamp();
--   DROP TABLE public.company_nsr_counter;
--   DROP TRIGGER profiles_guard_labor_fields ON public.profiles;   DROP FUNCTION public.guard_labor_fields();
--   ALTER TABLE public.time_entries DROP COLUMN server_received_at, DROP COLUMN clock_offset_seconds, DROP COLUMN nsr, DROP COLUMN prev_hash, DROP COLUMN record_hash;
--   ALTER TABLE public.profiles DROP CONSTRAINT profiles_cpf_formato, DROP COLUMN cpf, DROP COLUMN registration_number, DROP COLUMN admission_date;
