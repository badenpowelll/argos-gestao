-- ARGOS PRICING: precificação e propostas comerciais.

-- Dados institucionais e de pagamento (aparecem nas propostas). Fonte: propostas PDV ATEC/AH Crédito e Brandbook.
alter table company
  add column address text,
  add column phone text,
  add column bank_name text,
  add column bank_agency text,
  add column bank_account text,
  add column pix_key_cnpj text,
  add column pix_key_random text,
  add column pix_receiver_name text,
  add column pix_city text,
  add column google_review_url text,
  add column responsible_name text,
  add column responsible_role text;

update company set
  address = 'Rua Feira de Santana, 852, Sala 1, Potengi, Natal/RN, CEP 59120-080',
  phone = '(84) 99620-6159',
  email = coalesce(email, 'contato@portalargossolucoes.com'),
  bank_name = 'Itaú Unibanco (341)',
  bank_agency = '7087',
  bank_account = '98943-5',
  pix_key_cnpj = '65305027000138',
  pix_key_random = '16596a82-a0ae-4de7-98ab-9e487c7e74f9',
  pix_receiver_name = 'ARGOS SOLUCOES',
  pix_city = 'NATAL',
  responsible_name = 'DANIELLE SHEILA DE MELO FRANÇA',
  responsible_role = 'Sócia-Administradora';

create table pricing_settings (
  id int primary key default 1 check (id = 1),
  hourly_rate_cents bigint not null default 3500,
  min_dev_hours numeric(8,2) not null default 24,
  validity_days int not null default 15,
  default_margin_pct numeric(6,2) not null default 20,
  card_fees jsonb not null default '[]'::jsonb, -- [{installments, fee_pct, source}] definidos pelo administrador
  updated_at timestamptz not null default now()
);
insert into pricing_settings default values;

create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  currency text not null check (currency in ('USD','EUR')),
  rate numeric(12,6) not null check (rate > 0), -- BRL por 1 unidade
  as_of date not null,
  source text not null,
  manual boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index fx_rates_idx on fx_rates (currency, as_of desc, created_at desc);

create table tax_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  regime text not null,
  initial_rate_pct numeric(6,3) check (initial_rate_pct between 0 and 100),
  recurring_rate_pct numeric(6,3) check (recurring_rate_pct between 0 and 100),
  base text not null default 'receita_bruta',
  valid_from date not null,
  valid_to date,
  notes text,
  validated_at timestamptz,
  validated_by_name text,   -- contador/responsável que validou
  validation_ref text,      -- documento/parecer de referência
  active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

create table pricing_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vendor text,
  plan text,
  category text not null check (category in ('ferramenta','infra','dominio','email','outro')),
  price_cents bigint check (price_cents >= 0), -- na moeda original; NULL = ainda não verificado
  currency text not null default 'BRL' check (currency in ('BRL','USD','EUR')),
  periodicity text not null default 'mensal' check (periodicity in ('mensal','anual','bienal','trienal','quadrienal','unica')),
  projects_served int not null default 1 check (projects_served >= 1),
  allocation_pct numeric(7,4) check (allocation_pct between 0 and 100),
  included_in_id uuid references pricing_catalog(id),
  price_verified boolean not null default false,
  source text,
  verified_at date,
  notes text,
  active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table proposal_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('escopo','fora_escopo','condicoes')),
  body jsonb not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create sequence proposal_number_seq;

create table proposals (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  client_id uuid references clients(id),
  status text not null default 'rascunho'
    check (status in ('rascunho','emitida','enviada','aprovada','recusada','expirada','cancelada')),
  current_version int not null default 1,
  approved_version int,
  approved_at timestamptz,
  approved_by uuid references users(id),
  contract_id uuid references contracts(id),
  project_name text not null,
  client_snapshot jsonb not null default '{}'::jsonb,
  commercial_owner text,
  issued_at date,
  valid_until date,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index proposals_client_idx on proposals (client_id);

create table proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  version int not null,
  status text not null default 'rascunho' check (status in ('rascunho','emitida')),
  content jsonb not null,   -- escopo, prazo, entradas do cálculo, opções de pagamento, visibilidade
  result jsonb,             -- resultado do motor no momento da emissão (congelado)
  snapshots jsonb,          -- câmbio, catálogo e tributação usados (congelados na emissão)
  pdf_document_id uuid references documents(id),
  change_note text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  unique (proposal_id, version)
);

-- Versão emitida é imutável (preserva a proposta enviada/aprovada; custos e cotações futuros não a alteram).
create function proposal_versions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'emitida' then raise exception 'versão emitida não pode ser excluída'; end if;
    return old;
  end if;
  if old.status = 'emitida' then
    if new.status = 'emitida' and new.content = old.content and new.result is not distinct from old.result
       and new.snapshots is not distinct from old.snapshots and new.version = old.version then
      return new; -- permite apenas metadados (ex.: pdf_document_id)
    end if;
    raise exception 'versão emitida é imutável; crie uma nova versão';
  end if;
  return new;
end $$;
create trigger proposal_versions_immutable before update or delete on proposal_versions
  for each row execute function proposal_versions_guard();

-- ---- Catálogo inicial. Preços só quando verificados; os demais ficam EM BRANCO (NULL) para preenchimento manual.
update pricing_settings set card_fees = '[{"installments":10,"fee_pct":10.57,"source":"Stone, crédito em 10x — proposta PDV ATEC 17/10/2026 (confirmar na maquininha)"}]'::jsonb;

insert into pricing_catalog (name, vendor, plan, category, price_cents, currency, periodicity, projects_served, price_verified, source, verified_at, notes) values
 ('Lovable Pro', 'Lovable', 'Pro', 'ferramenta', 2500, 'USD', 'mensal', 8, true, 'Proposta PDV ATEC (17/10/2026)', '2026-10-17', 'Manutenção e publicação; rateado entre 8 sistemas'),
 ('Lovable Cloud', 'Lovable', 'Cloud', 'infra', 2500, 'USD', 'mensal', 8, true, 'Proposta PDV ATEC (17/10/2026)', '2026-10-17', 'Banco Postgres, hospedagem e armazenamento'),
 ('Claude Pro', 'Anthropic', 'Pro', 'ferramenta', 2000, 'USD', 'mensal', 8, true, 'Proposta PDV ATEC (17/10/2026)', '2026-10-17', 'Correções e suporte técnico'),
 ('ChatGPT', 'OpenAI', null, 'ferramenta', null, 'USD', 'mensal', 1, false, null, null, 'Informe plano e preço vigentes'),
 ('Railway', 'Railway', null, 'infra', null, 'USD', 'mensal', 1, false, null, null, 'Informe plano e consumo; PostgreSQL pode estar incluído neste plano'),
 ('PostgreSQL (Railway)', 'Railway', null, 'infra', null, 'USD', 'mensal', 1, false, null, null, 'Marque como "incluído em" Railway para não contar em duplicidade'),
 ('Hetzner CX33', 'Hetzner', 'CX33 (sem IPv4)', 'infra', 849, 'EUR', 'mensal', 1, true, 'Referência inicial informada pela Argos (Alemanha/Finlândia); sujeita a atualização', '2026-10-18', 'Ajuste "projetos hospedados" para ratear'),
 ('Hetzner — backups automáticos', 'Hetzner', null, 'infra', null, 'EUR', 'mensal', 1, false, null, null, 'Preço a verificar no site oficial'),
 ('Hetzner — IPv4 primário', 'Hetzner', null, 'infra', null, 'EUR', 'mensal', 1, false, null, null, 'Preço a verificar no site oficial'),
 ('Hetzner — Storage Box BX11', 'Hetzner', 'BX11', 'infra', null, 'EUR', 'mensal', 1, false, null, null, 'Preço a verificar no site oficial'),
 ('Cloudflare Pages', 'Cloudflare', null, 'infra', null, 'USD', 'mensal', 1, false, null, null, 'Preço/plano a verificar'),
 ('Cloudflare Edge / Workers', 'Cloudflare', null, 'infra', null, 'USD', 'mensal', 1, false, null, null, 'Preço/plano a verificar'),
 ('Cloudflare Turnstile', 'Cloudflare', null, 'infra', null, 'USD', 'mensal', 1, false, null, null, 'Preço/plano a verificar'),
 ('Domínio .com.br (3 anos)', 'Hostinger', '.com.br', 'dominio', 13098, 'BRL', 'trienal', 1, true, 'Proposta PDV ATEC (17/10/2026)', '2026-10-17', 'Registro; pago pelo cliente na entrada'),
 ('E-mail Starter Business (4 anos)', 'Hostinger', 'Starter Business', 'email', 11952, 'BRL', 'quadrienal', 1, true, 'Proposta PDV ATEC (17/10/2026)', '2026-10-17', 'Distribua entre projetos ajustando "projetos atendidos"');
update pricing_catalog set included_in_id = (select id from pricing_catalog where name = 'Railway') where name = 'PostgreSQL (Railway)';

alter table contracts add column source_proposal_id uuid references proposals(id);
create index contracts_proposal_idx on contracts (source_proposal_id);
