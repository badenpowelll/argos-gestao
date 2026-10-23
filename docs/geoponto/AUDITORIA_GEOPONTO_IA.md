# Auditoria técnica do GeoPonto IA (Prompt 01)

> 23/10/2026 · base: `badenpowelll/geoponto@e16cc33` (inclui fechamento mensal e AFD simplificado) · leitura de código; nada em produção foi alterado.
> Só consta como "existe" o que foi confirmado no código. **Não auditados (inacessíveis daqui):** `betices.geopontoapp.com`, `faceponto.com.br` (ambos `ENOTFOUND`), `geoponto.lovable.app` (não consultado). Ver `COMPARATIVO_BETICES_FACEPONTO.md`.

## 1. Stack
React 18 + Vite + TypeScript, Tailwind + shadcn/ui, TanStack Query, Leaflet (mapas), jsPDF/html2canvas (espelho), PWA com service worker (workbox), Supabase (Postgres + Auth + Storage + Edge Functions) via Lovable Cloud, login Google gerenciado (`@lovable.dev/cloud-auth-js`). Testes: Vitest (só 1 exemplo + os 5 novos); Playwright configurado sem testes. Sem CI (`.github` ausente).

## 2. Banco e segurança (migrations)
- 14 tabelas, todas com RLS ligado; isolamento por `company_id`; papéis `owner/admin/manager/employee` em `user_roles`.
- **`time_entries` sem política de UPDATE/DELETE** → imutável para usuários comuns; INSERT limitado ao próprio usuário; trigger `enforce_time_entry_status`.
- Ajustes aprovados **inserem** nova marcação (não editam a original).
- `audit_logs`: INSERT por qualquer autenticado (política ampliada depois); leitura só admin.

## 3. Achados críticos

| # | Achado | Evidência | Gravidade |
|---|---|---|---|
| A1 | **Não há reconhecimento facial real.** A "validação" é heurística de cor de pele em 160×120 px no navegador (≥15 % de pixels "de pele" por 5+ quadros). Não compara identidade, não há prova de vida, aceita foto/outra pessoa. | `CameraPreview.tsx` | Alta (a oferta comercial diz "facial") |
| A2 | `face_template` guarda só `{photos_count, trained}`; **não existe template biométrico**. `face_score` existe na tabela mas não é calculado por modelo. | `EmployeeRegister.tsx`, `types.ts` | Alta |
| A3 | Fotos de cada marcação vão para o bucket `avatars`, criado **público** (`public=true`) com política de leitura sem filtro por dono. Dado pessoal/biométrico potencialmente exposto por URL. **Verificar o estado atual no banco** antes de afirmar exposição. | migration 20260327030152 | Alta (LGPD art. 11) |
| A4 | Uma migration contém `DELETE FROM time_entries;` (já aplicada; indica que houve limpeza de dados). Migrations futuras destrutivas devem ser proibidas por processo. | migration 20260331222855 | Média |
| A5 | Imutabilidade só por RLS: `service_role`/dono do banco ainda edita. Sem trigger de bloqueio nem hash (hash adicionado só no cálculo de exportação). | — | Média |
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
