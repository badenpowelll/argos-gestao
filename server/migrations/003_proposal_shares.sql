-- Links de compartilhamento do PDF da proposta (para envio ao cliente por WhatsApp).
-- Guarda apenas o HASH do token: o link completo só é mostrado uma vez, na criação.
create table proposal_shares (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  version int not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  views int not null default 0,
  last_viewed_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  foreign key (proposal_id, version) references proposal_versions (proposal_id, version) on delete cascade
);
create index proposal_shares_proposal_idx on proposal_shares (proposal_id);
