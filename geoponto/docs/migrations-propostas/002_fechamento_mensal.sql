-- PROPOSTA — NÃO APLICADA. Depende de autorização expressa do proprietário.
-- Migration ADITIVA (só cria objetos novos; não altera nem apaga dados existentes).
-- Fica fora de supabase/** de propósito. Pré-requisito: 001 (funções has_role/get_user_company_id já existem no banco).
--
-- Fechamento mensal com estados, versões, retificação formal e bloqueio de competência.
-- Estados: aberto → em_apuracao → com_pendencias ⇄ conferido → aprovado_rh → exportado_folha → processado → conciliado → encerrado

CREATE TABLE public.monthly_closings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  competence    date NOT NULL CHECK (competence = date_trunc('month', competence)::date),
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  status        text NOT NULL DEFAULT 'aberto' CHECK (status IN
                ('aberto','em_apuracao','com_pendencias','conferido','aprovado_rh',
                 'exportado_folha','processado','conciliado','encerrado','substituido')),
  snapshot      jsonb NOT NULL DEFAULT '[]',   -- apuração por funcionário (memória de cálculo)
  justification text,                          -- obrigatória a partir da versão 2 (retificação)
  rectifies_id  uuid REFERENCES public.monthly_closings(id),
  created_by    uuid NOT NULL,
  approved_by   uuid,
  approved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, competence, version),
  CHECK (version = 1 OR (justification IS NOT NULL AND length(btrim(justification)) >= 10))
);
-- Só uma versão "viva" (não substituída) por competência.
CREATE UNIQUE INDEX monthly_closings_one_live ON public.monthly_closings (company_id, competence) WHERE status <> 'substituido';

CREATE TABLE public.monthly_closing_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_id  uuid NOT NULL REFERENCES public.monthly_closings(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL,
  from_status text,
  to_status   text NOT NULL,
  actor       uuid NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_closing_events ENABLE ROW LEVEL SECURITY;

-- Leitura: gestor, admin e dono da empresa. Escrita: SOMENTE pelas funções abaixo (sem política de INSERT/UPDATE/DELETE).
CREATE POLICY "Gestores leem fechamentos da empresa" ON public.monthly_closings FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id()
       AND (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')));
CREATE POLICY "Gestores leem eventos de fechamento" ON public.monthly_closing_events FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id()
       AND (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')));

-- Criar a apuração (versão 1) para uma competência.
CREATE OR REPLACE FUNCTION public.closing_open(_competence date, _snapshot jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  INSERT INTO public.monthly_closings (company_id, competence, snapshot, status, created_by)
  VALUES (public.get_user_company_id(), date_trunc('month', _competence)::date, COALESCE(_snapshot,'[]'), 'em_apuracao', auth.uid())
  RETURNING id INTO cid;
  INSERT INTO public.monthly_closing_events (closing_id, company_id, from_status, to_status, actor, note)
  VALUES (cid, public.get_user_company_id(), NULL, 'em_apuracao', auth.uid(), 'Apuração registrada');
  RETURN cid;
END $$;

-- Transições permitidas e quem pode executá-las. Aprovação do RH: só admin/dono e nunca quem criou a apuração.
CREATE OR REPLACE FUNCTION public.closing_transition(_closing_id uuid, _to text, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.monthly_closings%ROWTYPE; ok boolean; is_hr boolean;
BEGIN
  SELECT * INTO c FROM public.monthly_closings WHERE id = _closing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado'; END IF;
  IF c.company_id IS DISTINCT FROM public.get_user_company_id() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  is_hr := public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner');
  IF NOT (is_hr OR public.has_role(auth.uid(),'manager')) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  ok := (c.status, _to) IN (
    ('em_apuracao','com_pendencias'), ('em_apuracao','conferido'),
    ('com_pendencias','em_apuracao'), ('com_pendencias','conferido'),
    ('conferido','com_pendencias'), ('conferido','aprovado_rh'),
    ('aprovado_rh','exportado_folha'), ('exportado_folha','processado'),
    ('processado','conciliado'), ('conciliado','encerrado'));
  IF NOT ok THEN RAISE EXCEPTION 'Transição não permitida: % → %', c.status, _to; END IF;

  -- Etapas do RH/folha: só admin/dono.
  IF _to IN ('aprovado_rh','exportado_folha','processado','conciliado','encerrado') AND NOT is_hr THEN
    RAISE EXCEPTION 'Esta etapa exige perfil de RH (admin/dono)';
  END IF;
  IF _to = 'aprovado_rh' AND c.created_by = auth.uid() THEN
    RAISE EXCEPTION 'Separação de funções: quem criou a apuração não pode aprová-la';
  END IF;

  UPDATE public.monthly_closings
     SET status = _to, updated_at = now(),
         approved_by = CASE WHEN _to = 'aprovado_rh' THEN auth.uid() ELSE approved_by END,
         approved_at = CASE WHEN _to = 'aprovado_rh' THEN now() ELSE approved_at END
   WHERE id = c.id;
  INSERT INTO public.monthly_closing_events (closing_id, company_id, from_status, to_status, actor, note)
  VALUES (c.id, c.company_id, c.status, _to, auth.uid(), _note);
END $$;

-- Retificação formal: exige justificativa, cria nova versão e marca a anterior como substituída.
CREATE OR REPLACE FUNCTION public.closing_rectify(_closing_id uuid, _justification text, _snapshot jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.monthly_closings%ROWTYPE; nid uuid;
BEGIN
  SELECT * INTO c FROM public.monthly_closings WHERE id = _closing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado'; END IF;
  IF c.company_id IS DISTINCT FROM public.get_user_company_id()
     OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'Somente RH (admin/dono) pode retificar';
  END IF;
  IF c.status NOT IN ('aprovado_rh','exportado_folha','processado','conciliado','encerrado') THEN
    RAISE EXCEPTION 'Só se retifica um fechamento já aprovado; antes disso, edite a apuração';
  END IF;
  IF _justification IS NULL OR length(btrim(_justification)) < 10 THEN
    RAISE EXCEPTION 'Justificativa obrigatória (mínimo de 10 caracteres)';
  END IF;

  UPDATE public.monthly_closings SET status = 'substituido', updated_at = now() WHERE id = c.id;
  INSERT INTO public.monthly_closings (company_id, competence, version, status, snapshot, justification, rectifies_id, created_by)
  VALUES (c.company_id, c.competence, c.version + 1, 'em_apuracao', COALESCE(_snapshot, c.snapshot), btrim(_justification), c.id, auth.uid())
  RETURNING id INTO nid;
  INSERT INTO public.monthly_closing_events (closing_id, company_id, from_status, to_status, actor, note)
  VALUES (c.id, c.company_id, c.status, 'substituido', auth.uid(), 'Retificada: ' || btrim(_justification)),
         (nid,  c.company_id, NULL, 'em_apuracao', auth.uid(), 'Versão ' || (c.version + 1) || ' criada por retificação');
  RETURN nid;
END $$;

REVOKE ALL ON FUNCTION public.closing_open(date, jsonb), public.closing_transition(uuid, text, text),
                       public.closing_rectify(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.closing_open(date, jsonb), public.closing_transition(uuid, text, text),
                          public.closing_rectify(uuid, text, jsonb) TO authenticated;

-- Bloqueio de competência: com o fechamento aprovado (ou além), não se aprovam ajustes nem se cadastram abonos
-- para datas daquele mês. Marcações originais NÃO são bloqueadas (sincronização offline tardia continua válida).
CREATE OR REPLACE FUNCTION public.guard_locked_competence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date; locked boolean;
BEGIN
  d := date_trunc('month', NEW.date)::date;
  SELECT EXISTS (SELECT 1 FROM public.monthly_closings m
                  WHERE m.company_id = NEW.company_id AND m.competence = d
                    AND m.status IN ('aprovado_rh','exportado_folha','processado','conciliado','encerrado')) INTO locked;
  IF locked THEN
    RAISE EXCEPTION 'Competência % está bloqueada. Solicite retificação formal do fechamento.', to_char(d, 'MM/YYYY');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER adjustments_lock_competence_ins BEFORE INSERT ON public.adjustments
FOR EACH ROW EXECUTE FUNCTION public.guard_locked_competence();
CREATE TRIGGER adjustments_lock_competence_upd BEFORE UPDATE OF status ON public.adjustments
FOR EACH ROW WHEN (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.guard_locked_competence();
CREATE TRIGGER absences_lock_competence BEFORE INSERT OR UPDATE ON public.absence_justifications
FOR EACH ROW EXECUTE FUNCTION public.guard_locked_competence();

-- ROLLBACK:
--   DROP TRIGGER absences_lock_competence ON public.absence_justifications;
--   DROP TRIGGER adjustments_lock_competence_upd ON public.adjustments;
--   DROP TRIGGER adjustments_lock_competence_ins ON public.adjustments;
--   DROP FUNCTION public.guard_locked_competence();
--   DROP FUNCTION public.closing_rectify(uuid, text, jsonb), public.closing_transition(uuid, text, text), public.closing_open(date, jsonb);
--   DROP TABLE public.monthly_closing_events, public.monthly_closings;
