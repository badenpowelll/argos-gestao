# Auditoria técnica do GeoPonto IA (Prompt 01)

> 23/10/2026 · base: `badenpowelll/geoponto@e16cc33` (inclui fechamento mensal e AFD simplificado) · leitura de código; nada em produção foi alterado.
> Só consta como "existe" o que foi confirmado no código. **Não auditados (inacessíveis daqui):** `betices.geopontoapp.com`, `faceponto.com.br` (ambos `ENOTFOUND`), `geoponto.lovable.app` (não consultado). Ver `COMPARATIVO_BETICES_FACEPONTO.md`.

## 1. Stack
React 18 + Vite + TypeScript, Tailwind + shadcn/ui, TanStack Query, Leaflet (mapas), jsPDF/html2canvas (espelho), PWA com service worker (workbox), Supabase (Postgres + Auth + Storage + Edge Functions) via Lovable Cloud, login Google gerenciado (`@lovable.dev/cloud-auth-js`). Testes: Vitest (só 1 exemplo + os 5 novos); Playwright configurado sem testes. Sem CI (`.github` ausente).

## 2. Banco e segurança (migrations)
- 14 tabelas, todas com RLS ligado; isolamento por `company_id`; papéis `owner/admin/manager/employee` em `user_roles`.
- `time_entries`: sem política de DELETE; **UPDATE liberado a admin/dono/gestor no banco real** (não está nas migrations); INSERT limitado ao próprio usuário; trigger `enforce_time_entry_status`.
- Ajustes aprovados **inserem** nova marcação (não editam a original).
- `audit_logs`: INSERT por qualquer autenticado (política ampliada depois); leitura só admin.

## 3. Achados críticos

| # | Achado | Evidência | Gravidade |
|---|---|---|---|
| A1 | **Não há reconhecimento facial real.** A "validação" é heurística de cor de pele em 160×120 px no navegador (≥15 % de pixels "de pele" por 5+ quadros). Não compara identidade, não há prova de vida, aceita foto/outra pessoa. | `CameraPreview.tsx` | Alta (a oferta comercial diz "facial") |
| A2 | `face_template` guarda só `{photos_count, trained}`; **não existe template biométrico**. `face_score` existe na tabela mas não é calculado por modelo. | `EmployeeRegister.tsx`, `types.ts` | Alta |
| A3 | ~~Bucket `avatars` público.~~ **CORRIGIDO em 23/10/2026:** consulta ao banco real mostra `avatars` e `suporte-anexos` com `public=false`, e uma migration posterior (20260513171056) restringiu a leitura a membros da empresa. Não há exposição pública por URL. Resta avaliar retenção das fotos e acesso por gestores (LGPD). | consulta `storage.buckets` | Baixa |
| A4 | Uma migration contém `DELETE FROM time_entries;` (já aplicada; indica que houve limpeza de dados). Migrations futuras destrutivas devem ser proibidas por processo. | migration 20260331222855 | Média |
| A5 | **CORRIGIDO/AGRAVADO em 23/10/2026:** o banco real tem a política `Admins can update time entries` (UPDATE em `time_entries` por admin, dono **e gestor** da empresa), que não consta nas migrations do repositório. Ou seja, as marcações **podem ser editadas** por esses papéis. Sem trigger de bloqueio nem hash gravado. | `pg_policies` | **Alta** |
| A14 | Aprovar ajuste insere a marcação do colaborador, mas a única política de INSERT em `time_entries` exige `auth.uid() = user_id`: a RLS bloqueia quando quem aprova é outra pessoa, e o código ignorava o erro (ajuste ficava "aprovado" sem marcação). Hoje há 0 ajustes aprovados, então ainda não ocorreu. Código corrigido na branch `claude/painel-gestor`; correção definitiva exige a migration proposta. | `Admin.tsx`, `pg_policies` | Alta |
| A6 | Sem NSR persistido: o NSR atual é calculado na exportação e **muda se houver inserção retroativa** (offline sincronizado depois). | `portaria671.ts` | Média |
| A7 | Relógio: marcação usa `now()` do cliente quando offline; sem comparação com hora do servidor. | `PunchClock.tsx`, `useOfflineQueue.ts` | Média |
| A8 | `device_id` = `navigator.userAgent` (truncado): não identifica dispositivo autorizado. | `PunchClock.tsx:332` | Média |
| A9 | Intervalos: "Pausa/Retorno" são gravados como `out/in` (sem tipo próprio). Apuração soma pares in→out (almoço sai da conta, correto), mas **não valida intrajornada** (mín. 1 h acima de 6 h) nem interjornada. | `stepToType` | Média |
| A10 | `hour_bank` é só um saldo, sem uso na interface e sem livro de movimentações. | tipos/telas | Média |
| A11 | Atraso fixo às 08:15 (`isEntryLate`) em vez da escala do empregado. | `timeCalculations.ts` | Média |
| A12 | `.env` versionado (só URL e chave pública do Supabase). Aceitável por design da Lovable; não colocar segredos ali. | `.env` | Baixa |
| A13 | Cobertura de testes praticamente nula nas regras de cálculo antigas (relatório PDF, dashboard). | — | Média |

## 4. Pontos fortes
Marcação original preservada; RLS por empresa; geofence; fila offline e PWA; feriados; espelho em PDF; ajustes e abonos com aprovação; LGPD/termos/privacidade; solicitações de cadastro; suporte; auditoria básica.

## 5. Conformidade (resumo)
Não declarar conformidade com a Portaria 671. Faltam, entre outros: REP-P formal (inclusive Atestado Técnico/Termo de Responsabilidade), NSR persistente, assinatura digital, AEJ, comprovante, sincronização de relógio, armazenamento redundante. Detalhe nos planos.
