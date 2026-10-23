\set ON_ERROR_STOP off
\set U1 '00000000-0000-0000-0000-000000000001'
\set M1 '00000000-0000-0000-0000-0000000000a1'
\set H1 '00000000-0000-0000-0000-0000000000b1'
\set CA '00000000-0000-0000-0000-00000000000c'
\set CB '00000000-0000-0000-0000-00000000000d'
create temp table res(caso text, resultado text);
create or replace function pg_temp.try(_caso text, _uid text, _sql text) returns void language plpgsql as $$
begin
  perform set_config('app.uid', _uid, false);
  begin execute _sql; insert into res values (_caso,'OK');
  exception when others then insert into res values (_caso,'ERRO: '||sqlerrm); end;
end $$;

-- legado: 3 marcações antes da migration não existem neste banco novo; simulamos 2 já existentes na empresa A ANTES do trigger? (o trigger já está ativo; testamos continuidade abaixo)
select pg_temp.try('003 funcionário grava CPF próprio falha', :'U1', $$update profiles set cpf='12345678909' where user_id='00000000-0000-0000-0000-000000000001'$$);
select pg_temp.try('003 admin grava CPF', :'H1', $$update profiles set cpf='12345678909', registration_number='M-001', admission_date='2024-01-10' where user_id='00000000-0000-0000-0000-000000000001'$$);
select pg_temp.try('003 CPF com formato inválido falha', :'H1', $$update profiles set cpf='123' where user_id='00000000-0000-0000-0000-0000000000a1'$$);
select pg_temp.try('003 CPF repetido na mesma empresa falha', :'H1', $$update profiles set cpf='12345678909' where user_id='00000000-0000-0000-0000-0000000000a1'$$);
select pg_temp.try('003 matrícula repetida na mesma empresa falha', :'H1', $$update profiles set registration_number='M-001' where user_id='00000000-0000-0000-0000-0000000000a1'$$);
select pg_temp.try('003 funcionário ainda edita outros campos do perfil', :'U1', $$update profiles set company_id=company_id where user_id='00000000-0000-0000-0000-000000000001'$$);

-- NSR sequencial, hora do servidor, hash
select pg_temp.try('003 marcação 1 (relógio do aparelho atrasado 2h)', :'U1', $$insert into time_entries(user_id,company_id,timestamp,type) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c', now() - interval '2 hours','in')$$);
select pg_temp.try('003 marcação 2', :'U1', $$insert into time_entries(user_id,company_id,timestamp,type) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c', now(),'out')$$);
select pg_temp.try('003 marcação da empresa B começa a própria sequência', :'H1', $$insert into time_entries(user_id,company_id,timestamp,type) values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000000d', now(),'in')$$);
select pg_temp.try('003 cliente não consegue forçar NSR/hora do servidor', :'U1', $$insert into time_entries(user_id,company_id,timestamp,type,nsr,server_received_at,record_hash) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c', now(),'in',999,'2000-01-01','fake')$$);
select pg_temp.try('003 alterar NSR depois falha', :'H1', $$update time_entries set nsr = 1000 where nsr = 1 and company_id='00000000-0000-0000-0000-00000000000c'$$);
select pg_temp.try('003 alterar hash depois falha', :'H1', $$update time_entries set record_hash = 'x' where nsr = 1 and company_id='00000000-0000-0000-0000-00000000000c'$$);
select pg_temp.try('003 editar a hora continua permitido (política atual) e fica auditado', :'H1', $$update time_entries set timestamp = timestamp + interval '10 minutes' where nsr = 2 and company_id='00000000-0000-0000-0000-00000000000c'$$);

select caso, resultado from res order by ctid;
select 'empresa A: nsr=' || string_agg(nsr::text, ',' order by nsr) || ' | offset(s)=' || string_agg(clock_offset_seconds::text, ',' order by nsr) from time_entries where company_id=:'CA' and nsr is not null;
select 'empresa B: nsr=' || string_agg(nsr::text, ',' order by nsr) from time_entries where company_id=:'CB';
select 'cadeia A ligada: ' || bool_and(t.prev_hash = coalesce(lag_hash, repeat('0',64))) from (select prev_hash, lag(record_hash) over (order by nsr) as lag_hash from time_entries where company_id=:'CA' and nsr is not null) t;
select 'auditoria da edição: ' || count(*) from audit_logs where action='time_entry_edited';
select 'hash recalculado confere (nsr 1): ' || (record_hash = encode(sha256(convert_to(concat_ws('|', prev_hash, nsr, '12345678000190', user_id, to_char(timestamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), type), 'UTF8')),'hex')) from time_entries where nsr=1 and company_id=:'CA';
