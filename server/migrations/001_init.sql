-- ARGOS GESTÃO 360° — esquema inicial.
-- Valores monetários SEMPRE em centavos (bigint). Datas de vencimento/competência são `date`.

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  password_hash text not null,
  role text not null check (role in ('admin','financeiro','operador','leitura')),
  active boolean not null default true,
  failed_logins int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create unique index users_email_uq on users (lower(email));

create table company (
  id int primary key default 1 check (id = 1),
  legal_name text not null,
  trade_name text not null,
  cnpj text,
  site text,
  email text,
  whatsapp text,
  updated_at timestamptz not null default now()
);
-- Dados institucionais constantes do Brandbook Argos Soluções 2026 e do contato informado pela empresa.
insert into company (legal_name, trade_name, cnpj, site, whatsapp)
values ('ARGOS TERCEIRIZAÇÃO DE MÃO DE OBRA, CONSULTORIA E SOLUÇÕES LTDA', 'Argos Soluções',
        '65305027000138', 'portalargossolucoes.com', '5584998590183');

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_name text,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb,
  ip text
);
create index audit_entity_idx on audit_log (entity, entity_id, at desc);

create function audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log é imutável';
end $$;
create trigger audit_log_no_change before update or delete on audit_log
  for each row execute function audit_log_immutable();

create table clients (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pessoa_fisica','empresa_privada','orgao_publico')),
  name text not null,
  trade_name text,
  document text,
  email text,
  phone text,
  whatsapp text,
  zip text, street text, number text, complement text, district text, city text, state text,
  responsible_name text,
  responsible_role text,
  sector text,
  public_sphere text check (public_sphere in ('municipal','estadual','federal') or public_sphere is null),
  notes text,
  status text not null default 'ativo' check (status in ('prospecto','ativo','inativo')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index clients_document_uq on clients (document) where document is not null;
create index clients_name_idx on clients (lower(name));

create table documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('contrato_original','comprovante','anexo')),
  filename text not null,
  mime text not null,
  size_bytes int not null,
  sha256 text not null,
  content bytea not null,
  client_id uuid references clients(id),
  contract_id uuid,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index documents_contract_idx on documents (contract_id);
create index documents_sha_idx on documents (sha256);

create table systems (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  name text not null,
  description text,
  access_url text,
  domain text,
  infrastructure text,
  database_info text,
  version text,
  delivered_at date,
  implemented_at date,
  maintenance_until date,
  support_until date,
  operational_cost_cents bigint not null default 0 check (operational_cost_cents >= 0), -- custo MENSAL de infraestrutura
  status text not null default 'em_desenvolvimento'
    check (status in ('em_desenvolvimento','em_producao','manutencao','suspenso','descontinuado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index systems_client_idx on systems (client_id);

create sequence contract_number_seq;

create table contracts (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  client_id uuid not null references clients(id),
  system_id uuid references systems(id),
  parent_contract_id uuid references contracts(id),
  kind text not null check (kind in ('proposta','contrato','aditivo')),
  status text not null default 'rascunho'
    check (status in ('rascunho','proposta','ativo','suspenso','encerrado','cancelado')),
  object text,
  signed_at date,
  start_date date,
  end_date date,
  auto_renew boolean not null default false,
  adjustment_index text,
  adjustment_month int check (adjustment_month between 1 and 12),
  payment_terms text,
  due_day int check (due_day between 1 and 31),
  fine_percent numeric(6,3) not null default 0 check (fine_percent >= 0),
  interest_monthly_percent numeric(6,3) not null default 0 check (interest_monthly_percent >= 0),
  -- fluxo de setor público (opcional)
  is_public_flow boolean not null default false,
  administrative_process text,
  commitment_number text,
  notes text,
  source_document_id uuid references documents(id),
  approved_at timestamptz,
  activated_at timestamptz,
  activated_by uuid references users(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'proposta' or status in ('rascunho','proposta','cancelado'))
);
create index contracts_client_idx on contracts (client_id);
alter table documents add constraint documents_contract_fk foreign key (contract_id) references contracts(id);

create table contract_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  kind text not null check (kind in ('implementacao','desenvolvimento','licenca','mensalidade','hospedagem',
                                     'dominio','treinamento','suporte','outro')),
  description text not null,
  billing_type text not null check (billing_type in ('unico','recorrente','parcelado','por_usuario','sob_demanda')),
  unit_amount_cents bigint not null check (unit_amount_cents >= 0),
  quantity numeric(10,2) not null default 1 check (quantity > 0), -- usuários (por_usuario) ou unidades
  installments int check (installments between 1 and 120),
  interval_months int not null default 1 check (interval_months between 1 and 36),
  first_due_date date,
  discount_cents bigint not null default 0 check (discount_cents >= 0), -- desconto por cobrança gerada
  active boolean not null default true,
  notes text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  check (billing_type <> 'parcelado' or installments is not null)
);
create index contract_items_contract_idx on contract_items (contract_id);

create table charges (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  contract_id uuid references contracts(id),
  contract_item_id uuid references contract_items(id),
  system_id uuid references systems(id),
  description text not null,
  competence date,
  installment_no int,
  installments_total int,
  due_date date not null,
  amount_cents bigint not null check (amount_cents > 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  interest_cents bigint not null default 0 check (interest_cents >= 0),
  fine_cents bigint not null default 0 check (fine_cents >= 0),
  paid_cents bigint not null default 0 check (paid_cents >= 0),
  status text not null default 'pendente' check (status in ('pendente','parcial','paga','cancelada')),
  cancelled_reason text,
  dedupe_key text,
  -- setor público (opcionais)
  administrative_process text,
  commitment_number text,
  invoice_number text,
  liquidation_date date,
  payment_forecast_date date,
  paid_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_cents - discount_cents >= 0)
);
create unique index charges_dedupe_uq on charges (dedupe_key) where dedupe_key is not null;
create index charges_status_due_idx on charges (status, due_date);
create index charges_client_idx on charges (client_id);
create index charges_contract_idx on charges (contract_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references charges(id),
  method text not null check (method in ('pix','transferencia','cartao','boleto','dinheiro')),
  amount_cents bigint not null check (amount_cents > 0),
  paid_at timestamptz not null default now(),
  reference text,
  receipt_document_id uuid references documents(id),
  operator_id uuid references users(id),
  operator_name text,
  idempotency_key text,
  line_no int not null default 0,
  status text not null default 'confirmado' check (status in ('confirmado','estornado')),
  reversed_at timestamptz,
  reversed_by uuid references users(id),
  reversal_reason text,
  notes text,
  created_at timestamptz not null default now()
);
create unique index payments_idem_uq on payments (idempotency_key, line_no) where idempotency_key is not null;
create index payments_charge_idx on payments (charge_id);
create index payments_paid_at_idx on payments (paid_at);

-- Pagamentos nunca são apagados nem reescritos: só podem ser estornados (confirmado -> estornado).
create function payments_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'pagamentos não podem ser excluídos; use estorno';
  end if;
  if old.status = 'estornado' then
    raise exception 'pagamento já estornado é imutável';
  end if;
  if new.charge_id is distinct from old.charge_id or new.amount_cents is distinct from old.amount_cents
     or new.method is distinct from old.method or new.paid_at is distinct from old.paid_at
     or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'dados do pagamento são imutáveis; use estorno';
  end if;
  return new;
end $$;
create trigger payments_no_rewrite before update or delete on payments
  for each row execute function payments_guard();

create table contact_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  charge_id uuid references charges(id),
  channel text not null check (channel in ('whatsapp','telefone','email','presencial','outro')),
  direction text not null default 'saida' check (direction in ('saida','entrada')),
  message text,
  operator_id uuid references users(id),
  operator_name text,
  created_at timestamptz not null default now()
);
create index contact_log_client_idx on contact_log (client_id, created_at desc);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  system_id uuid references systems(id),
  client_id uuid references clients(id),
  category text not null,
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  competence date not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index expenses_competence_idx on expenses (competence);

create table contract_imports (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id),
  status text not null default 'revisao' check (status in ('revisao','confirmado','descartado')),
  extraction jsonb not null,
  contract_id uuid references contracts(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
