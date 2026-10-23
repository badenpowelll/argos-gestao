-- PROPOSTA — NÃO APLICADA. Depende de autorização expressa do proprietário.
-- Migration ADITIVA (sem DROP/DELETE). Fica fora de supabase/** de propósito.
--
-- Achados no banco real (consulta somente leitura em pg_policies, 23/10/2026):
--  1) time_entries só tem política de INSERT "auth.uid() = user_id": quando o gestor/admin aprova um
--     ajuste, a marcação do colaborador é bloqueada pela RLS. (Hoje há 0 ajustes aprovados, então o problema
--     ainda não apareceu.)
--  2) Gestor não enxerga absence_justifications de outros (só admin/dono gerenciam), então o fechamento
--     do gestor pode mostrar faltas já abonadas.
--
-- Solução: função atômica e auditada para aprovar, e leitura de abonos pelo gestor.

-- 1) Aprovação atômica: valida papel e empresa, impede auto-aprovação, cria a marcação, audita.
CREATE OR REPLACE FUNCTION public.approve_adjustment(_adjustment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.adjustments%ROWTYPE;
  punch public.punch_type;
BEGIN
  SELECT * INTO a FROM public.adjustments WHERE id = _adjustment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ajuste não encontrado'; END IF;
  IF a.status <> 'pending' THEN RAISE EXCEPTION 'Ajuste já decidido'; END IF;
  IF a.company_id IS DISTINCT FROM public.get_user_company_id()
     OR NOT (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar este ajuste';
  END IF;
  IF a.user_id = auth.uid() THEN RAISE EXCEPTION 'Não é permitido aprovar o próprio ajuste'; END IF;

  punch := CASE WHEN a.punch_step IN ('entrada', 'retorno_almoco') THEN 'in' ELSE 'out' END;

  INSERT INTO public.time_entries (user_id, company_id, timestamp, type, status, sync_status)
  VALUES (a.user_id, a.company_id, (a.date + COALESCE(a.proposed_time::time, '08:00'::time)), punch, 'verified', 'synced');

  UPDATE public.adjustments SET status = 'approved', approved_by = auth.uid() WHERE id = a.id;

  INSERT INTO public.audit_logs (user_id, company_id, action, metadata, snapshot_before, snapshot_after)
  VALUES (auth.uid(), a.company_id, 'adjustment_approved',
          jsonb_build_object('adjustment_id', a.id, 'target_user_id', a.user_id, 'date', a.date,
                             'punch_step', a.punch_step, 'proposed_time', a.proposed_time),
          jsonb_build_object('status', 'pending'),
          jsonb_build_object('status', 'approved', 'approved_by', auth.uid()));
END;
$$;
REVOKE ALL ON FUNCTION public.approve_adjustment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_adjustment(uuid) TO authenticated;

-- 2) Gestor lê (somente leitura) os abonos da própria empresa.
CREATE POLICY "Managers can view company absence justifications"
ON public.absence_justifications
FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id() AND public.has_role(auth.uid(), 'manager'));

-- Observação: o timestamp acima usa o fuso da sessão do banco. Definir o fuso oficial (America/Fortaleza)
-- antes de aplicar, junto com a decisão sobre armazenar o NSR (item 6 do plano).
--
-- ROLLBACK (se necessário):
--   DROP POLICY "Managers can view company absence justifications" ON public.absence_justifications;
--   DROP FUNCTION public.approve_adjustment(uuid);
