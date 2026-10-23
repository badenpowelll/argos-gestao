\set ON_ERROR_STOP off
\set U1 '00000000-0000-0000-0000-000000000001'
\set M1 '00000000-0000-0000-0000-0000000000a1'
\set H1 '00000000-0000-0000-0000-0000000000b1'
\set H2 '00000000-0000-0000-0000-0000000000b2'
\set X1 '00000000-0000-0000-0000-0000000000c1'
create temp table res(caso text, resultado text);
create or replace function pg_temp.try(_caso text, _uid text, _sql text) returns void language plpgsql as $$
begin
  perform set_config('app.uid', _uid, false);
  begin execute _sql; insert into res values (_caso,'OK');
  exception when others then insert into res values (_caso,'ERRO: '||sqlerrm); end;
end $$;

-- ajuste do funcionário u1 criado
insert into adjustments(id,user_id,company_id,date,punch_step,proposed_time) values ('11111111-1111-1111-1111-111111111111',:'U1','00000000-0000-0000-0000-00000000000c','2025-03-10','entrada','08:00:00');
select pg_temp.try('001 gestor aprova ajuste do funcionário', :'M1', $$select approve_adjustment('11111111-1111-1111-1111-111111111111')$$);
select pg_temp.try('001 reaprovar o mesmo ajuste falha', :'M1', $$select approve_adjustment('11111111-1111-1111-1111-111111111111')$$);
insert into adjustments(id,user_id,company_id,date,punch_step,proposed_time) values ('22222222-2222-2222-2222-222222222222',:'M1','00000000-0000-0000-0000-00000000000c','2025-03-11','entrada','08:00:00');
select pg_temp.try('001 gestor aprovar o PRÓPRIO ajuste falha', :'M1', $$select approve_adjustment('22222222-2222-2222-2222-222222222222')$$);
select pg_temp.try('001 funcionário não aprova', :'U1', $$select approve_adjustment('22222222-2222-2222-2222-222222222222')$$);
select pg_temp.try('001 admin de OUTRA empresa não aprova', :'X1', $$select approve_adjustment('22222222-2222-2222-2222-222222222222')$$);

select pg_temp.try('002 gestor abre apuração', :'M1', $$select closing_open('2025-03-15','[{"u":"x"}]')$$);
select pg_temp.try('002 funcionário não abre', :'U1', $$select closing_open('2025-03-15','[]')$$);
select pg_temp.try('002 duas versões vivas na mesma competência falha', :'H1', $$select closing_open('2025-03-20','[]')$$);
create temp table cid as select id from monthly_closings limit 1;
select pg_temp.try('002 pular estados (em_apuracao→aprovado_rh) falha', :'H2', format($$select closing_transition(%L,'aprovado_rh')$$, (select id from cid)));
select pg_temp.try('002 conferir (gestor)', :'M1', format($$select closing_transition(%L,'conferido')$$, (select id from cid)));
select pg_temp.try('002 gestor não aprova pelo RH', :'M1', format($$select closing_transition(%L,'aprovado_rh')$$, (select id from cid)));
select pg_temp.try('002 criador (gestor) não é RH; admin H1 aprova', :'H1', format($$select closing_transition(%L,'aprovado_rh')$$, (select id from cid)));
select pg_temp.try('002 admin de outra empresa não mexe', :'X1', format($$select closing_transition(%L,'exportado_folha')$$, (select id from cid)));

-- bloqueio de competência (março/2025 aprovado)
select pg_temp.try('002 ajuste novo em competência bloqueada falha', :'U1', $$insert into adjustments(user_id,company_id,date,punch_step,proposed_time) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','2025-03-20','saida','17:00:00')$$);
select pg_temp.try('002 abono em competência bloqueada falha', :'H1', $$insert into absence_justifications(user_id,company_id,date) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','2025-03-21')$$);
select pg_temp.try('002 ajuste em OUTRO mês (abril) permitido', :'U1', $$insert into adjustments(user_id,company_id,date,punch_step,proposed_time) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','2025-04-02','saida','17:00:00')$$);
select pg_temp.try('002 marcação original em competência bloqueada continua permitida', :'U1', $$insert into time_entries(user_id,company_id,timestamp,type) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','2025-03-25 11:00+00','in')$$);

-- retificação
select pg_temp.try('002 gestor não retifica', :'M1', format($$select closing_rectify(%L,'motivo suficientemente longo','[]')$$, (select id from cid)));
select pg_temp.try('002 retificar sem justificativa falha', :'H2', format($$select closing_rectify(%L,'curta','[]')$$, (select id from cid)));
select pg_temp.try('002 admin retifica com justificativa', :'H2', format($$select closing_rectify(%L,'Correção de horas extras do dia 10','[]')$$, (select id from cid)));
select pg_temp.try('002 após retificar, competência volta a abrir ajustes', :'U1', $$insert into adjustments(user_id,company_id,date,punch_step,proposed_time) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','2025-03-22','saida','17:00:00')$$);
select pg_temp.try('002 escrita direta na tabela é impossível sem permissão (authenticated sem grant)', :'U1', $$set local role authenticated; insert into monthly_closings(company_id,competence,created_by) values ('00000000-0000-0000-0000-00000000000c','2025-05-01','00000000-0000-0000-0000-000000000001')$$);
reset role;
select caso, resultado from res order by ctid;
select 'entradas criadas por aprovação: '||count(*) from time_entries where timestamp::date='2025-03-10';
select 'versões: '||string_agg(version||':'||status, ', ' order by version) from monthly_closings;
select 'eventos: '||count(*) from monthly_closing_events;
