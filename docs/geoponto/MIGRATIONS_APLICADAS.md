# Migrations aplicadas no banco do GeoPonto IA (Lovable Cloud)

Projeto Lovable `e73ace6d-a1e0-4389-a8fa-644067354e90`. Aplicadas em **23/10/2026**, com autorização expressa do proprietário, via SQL no banco (não pelo repositório). Os arquivos-fonte estão em `geoponto/docs/migrations-propostas/` (repositório `badenpowelll/geoponto`).

| Migration | O que criou | Verificação (somente leitura) |
|---|---|---|
| 001 aprovação de ajustes e gestor | função `approve_adjustment(uuid)` (SECURITY DEFINER, só `authenticated`); política `Managers can view company absence justifications` (SELECT) | função existe, `anon` sem execução; política existe |
| 002 fechamento mensal | tabelas `monthly_closings` e `monthly_closing_events` (RLS ligada, só SELECT para gestor/admin/dono); funções `closing_open`, `closing_transition`, `closing_rectify`; função e 3 triggers de bloqueio de competência | objetos existem; `anon` sem execução; 0 fechamentos criados |

Antes/depois: nenhuma linha de dados foi alterada (1.441 marcações e 102 ajustes no momento da conferência; 0 fechamentos).

**Não aplicado (aguarda decisão):** a política `Admins can update time entries` (UPDATE em `time_entries` por admin/dono/gestor) continua existindo.
**Observação:** a função 001 grava a marcação aprovada com a hora do ajuste interpretada no fuso da sessão do banco (igual ao comportamento atual do app). Definir o fuso oficial junto com o NSR gravado (item 6 do plano).

## Rollback
001: `DROP FUNCTION public.approve_adjustment(uuid); DROP POLICY "Managers can view company absence justifications" ON public.absence_justifications;`
002: ver o bloco ROLLBACK no fim de `002_fechamento_mensal.sql` (remove triggers, funções e tabelas; só use se não houver fechamentos registrados).
