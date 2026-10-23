# Auditoria técnica — GeoPonto IA 2.0 × folha, contabilidade, financeiro e glosas

> Data: 23/10/2026. Escopo: viabilidade do que existe e do que falta. **Nenhum código de integração foi escrito, nenhuma migration aplicada, nenhum dado real tocado.**
> Regra: onde não há evidência, está escrito "não identificado". Nada foi presumido.

## 1. Fontes auditadas

| Fonte | Situação |
|---|---|
| `badenpowelll/geoponto` (React + Vite + Supabase/Lovable Cloud), commit `5a8e4f8` + `b1ed215` | ✅ lido (código, tipos, 12 migrations) |
| `badenpowelll/argos-gestao` (React + Express + PostgreSQL/Railway) | ✅ lido (migrations 001–003, `docs/ARQUITETURA.md`, rotas, auth) |
| `https://betices.geopontoapp.com` | ❌ **inacessível** do ambiente de desenvolvimento (`ENOTFOUND`). Não foi possível auditá-lo. |
| Sistema contábil / folha / RH existente | ❌ **não identificado** (ver §3) |

## 2. O que existe hoje

### 2.1 GeoPonto IA (Supabase, multiempresa por `company_id` + RLS)
Tabelas: `companies` (nome, CNPJ, plano), `profiles` (nome, e-mail, telefone, `team_id`, `face_template`), `user_roles` (`owner/admin/manager/employee`), `teams`, `time_entries`, `geofences`, `adjustments`, `absence_justifications` (folga/feriados), `work_schedules` (nome, tipo, `daily_hours`), `hour_bank` (apenas **um saldo** por usuário), `audit_logs`, `subscriptions`, `registration_requests`, `solicitacoes_suporte`.

Pontos fortes aproveitáveis:
- Marcações originais **não são alteradas**: a aprovação de um ajuste **insere** nova marcação (`Admin.tsx`), não edita a original.
- Isolamento multiempresa por `company_id` com RLS; papéis e `audit_logs` já existem.
- Geolocalização, biometria facial, modo offline, feriados nacionais/municipais, espelho em PDF.
- Novo (commit `b1ed215`): apuração mensal básica, NSR + hash SHA-256 encadeado, exportação AFD simplificado.

Lacunas relevantes:
- **Sem CPF, matrícula, data de admissão, cargo, salário/hora, CBO, vínculo** → nenhum dado para identificar o empregado na folha.
- **Sem estabelecimentos** (só empresa) e **sem contratos, postos, clientes ou centros de custo**.
- `work_schedules` só guarda horas/dia: **sem horários de entrada/saída, intervalos, 12x36, noturno, tolerância por escala**, e **sem vínculo empregado↔escala**.
- `hour_bank` é um saldo solto: **sem livro de movimentações, vencimento, acordo, conversão em pagamento**. A tela não o utiliza.
- **Sem convenção coletiva** (adicional de HE, DSR, noturno, regras de banco).
- Fechamento inexistente como processo: sem estados, competência bloqueada, versionamento, aprovador.
- Imutabilidade é por política, não por trigger: o hash encadeado **detecta**, não **impede** edição direta no banco.

### 2.2 ARGOS GESTÃO 360° (PostgreSQL próprio)
Tabelas: `users` (admin/financeiro/operador/leitura), `company`, `audit_log` (imutável), `clients`, `documents`, `systems`, `contracts`, `contract_items`, `charges`, `payments` (imutável, estorno), `contact_log`, `expenses`, `contract_imports`, mais pricing/propostas.

Natureza do sistema: **ERP/CRM comercial da Argos como fornecedora de software** (contratos de licença/sistemas, cobrança recorrente, PDV). Padrões **reaproveitáveis**: valores em centavos, `idempotency_key`, `dedupe_key`, trigger de imutabilidade, auditoria imutável, importação com revisão humana, motor de regras que "não presume".

**Não é** sistema de RH, folha, contabilidade nem de terceirização: não há empregados, matrículas, postos de trabalho, centros de custo, plano de contas, contas a pagar estruturadas (`expenses` é simples), notas fiscais ou glosas.

## 3. Dependência não resolvida: o "sistema contábil existente"

O pedido cita um sistema próprio de contabilidade, folha, financeiro, contratos e centros de custo. **Não foi encontrado** em nenhum dos dois repositórios acessíveis, nem endpoint, banco ou credenciais.

Decisão necessária do proprietário (uma destas):
1. Informar repositório/API/banco do sistema existente (e conceder acesso) → integração por adaptador.
2. A folha é de terceiro (Domínio, Alterdata, Senior, Contabilizei etc.) → integração por **arquivo/API oficial do fornecedor**; qual?
3. Não existe sistema → construir módulos mínimos (cadastro de empregado, rubricas, centro de custo) dentro do GeoPonto/Argos Gestão.

Não serão inventados endpoints, tabelas ou credenciais enquanto isso não for definido.

## 4. Matriz de viabilidade

Legenda: ✅ existe · 🟡 parcial · ❌ falta · ⛔ depende de decisão/dado externo.

| Requisito | Estado | Observação |
|---|---|---|
| Marcações originais preservadas | ✅ | ajuste insere, não edita |
| Apuração diária/mensal (extras, atrasos, faltas, tolerância) | 🟡 | feita (b1ed215), sem categorias de HE, noturno nem DSR |
| Escalas e jornadas por empregado | ❌ | falta modelo de escala com horários e vínculo |
| Cadastro trabalhista (CPF, matrícula, admissão, salário, cargo) | ❌ | bloqueia folha e eSocial |
| Estabelecimentos | ❌ | |
| Convenção coletiva parametrizável | ❌ | exige as CCTs reais de cada categoria ⛔ |
| Motor de decisão (pagamento/banco/desconto/abono/glosa/pendência) | ❌ | desenho em `ARQUITETURA_…` (a produzir) |
| Regra anti dupla contagem extra × banco | ❌ | implementar por constraint no livro de apuração |
| Banco de horas com livro, validade e acordo | ❌ | hoje só saldo |
| Fluxo de estados do fechamento + bloqueio de competência | ❌ | |
| Retificação versionada + reprocessamento | ❌ | |
| Adaptador de folha com idempotência/conciliação | ❌ ⛔ | padrão `idempotency_key`/`dedupe_key` do Argos Gestão serve de modelo; destino indefinido |
| Rubricas de folha | ❌ ⛔ | códigos de rubrica são do sistema de folha |
| Contratos de terceirização, postos, cobertura, substituição | ❌ | `contracts` do Argos Gestão é de software, não de postos |
| Glosa contratual | ❌ ⛔ | exige cláusulas reais dos contratos |
| Centros de custo, contas a pagar/receber, NF, plano de contas | 🟡 ⛔ | receber/cobranças existem no Argos Gestão; resto não; plano de contas é do contador |
| Assistente de IA consultivo | ❌ | viável (somente leitura) com a API da Anthropic; custo e LGPD a decidir |
| Autorização granular e separação de funções | 🟡 | papéis existem em ambos; faltam permissões por ação (aprovar RH ≠ conferir) |
| LGPD | 🟡 | páginas de privacidade e biometria; faltam RIPD, retenção e base legal por tratamento |
| Portaria 671 | 🟡 | NSR/hash/AFD simplificado; falta imutabilidade no banco, comprovante e AFDT/AEJ oficiais |
| eSocial | ❌ | **fora do escopo** sem autorização expressa e validação de leiautes |

## 5. Viabilidade geral

**Viável, em fases**, com três condições:
1. Definir o destino da folha (§3).
2. Fornecer os insumos jurídicos: CCTs/ACTs aplicáveis, acordos de banco de horas, contratos de terceirização com cláusulas de glosa, tabela de rubricas.
3. Escolher a **base do código**: o GeoPonto (Supabase) é o dono natural de jornada e apuração; o Argos Gestão (Postgres/Express) tem os melhores padrões financeiros e a base de contratos/cobrança. Recomendação: **GeoPonto continua dono da jornada; contratos, glosa e financeiro ficam no Argos Gestão**, ligados por API assinada e identificadores externos, sem duplicar cadastro (um lado é mestre de cada entidade).

Um ponto técnico a decidir cedo: são **dois bancos e dois modelos de autenticação diferentes** (Supabase Auth + RLS × JWT próprio). A ponte exige conta de serviço, assinatura de requisições e mapeamento `company_id` ↔ `clients.id`.

## 6. Plano de implementação proposto

| Fase | Entrega | Depende de |
|---|---|---|
| 0 | Fechar §3 e coletar CCTs, acordos, contratos, rubricas | proprietário |
| 1 | Cadastro trabalhista (CPF, matrícula, admissão, cargo), estabelecimentos, escalas com horários e vínculo | — |
| 2 | Motor de apuração parametrizado (HE por categoria, noturno, DSR, tolerância) + classificação A–F + livro do banco de horas | CCT |
| 3 | Fechamento: estados, bloqueio de competência, retificação versionada, aprovação RH, trilha | 1–2 |
| 4 | Prévia de rubricas + adaptador de folha (idempotente, conciliação) em **modo exportação/sandbox**; imutabilidade por trigger (Portaria 671) | folha |
| 5 | Contratos e postos, cobertura, proposta de glosa e revisão | contratos/cláusulas |
| 6 | Financeiro/contábil (centro de custo, provisões, lançamentos) | contador |
| 7 | Assistente de IA consultivo (somente leitura) | 2–3 |

Cada fase com migrations **aditivas** (sem DROP/ALTER destrutivo), aplicadas à parte com autorização.

## 7. Restrições assumidas
- Nunca alterar/excluir marcações originais; correções são novos registros versionados.
- Hora trabalhada nunca liquidada duas vezes (extra paga **e** crédito no banco).
- Glosa contratual não vira desconto salarial automaticamente.
- IA somente consultiva.
- Sem eSocial, sem folha em produção, sem migrations destrutivas sem autorização expressa.

## 8. Entregáveis seguintes
Pendentes (a produzir após as decisões do §3): `ARQUITETURA_INTEGRACAO_GEOPONTO_ERP.md`, `MODELO_DADOS_APURACAO_MENSAL.md`, `MATRIZ_REGRAS_TRABALHISTAS.md`, `MAPEAMENTO_RUBRICAS_FOLHA.md`, `REGRAS_GLOSAS_CONTRATUAIS.md`, `PLANO_TESTES_FECHAMENTO.md`. As matrizes de regras e rubricas **não devem ser preenchidas sem as CCTs e a tabela de rubricas reais**.
