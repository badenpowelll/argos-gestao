# Plano de evolução GeoPonto IA 2.0

Ordem do pacote de 14 prompts, ajustada pela auditoria (P = prioridade). Cada etapa: branch separada, migrations **aditivas**, testes, relatório, e **aprovação antes do merge/produção**.

| Etapa | Prompt | Situação | Ajuste recomendado |
|---|---|---|---|
| 0 | 01 Auditoria | ✅ este conjunto (comparativo pendente de acesso) | obter acesso a Betices/Faceponto |
| 1 | **Correções de segurança urgentes** (novo) | ❌ | ~~bucket privado~~ (já é privado); **remover/limitar UPDATE em `time_entries`**; honestidade do "facial"; trigger anti-edição |
| 2 | 02 Arquitetura | 🟡 | partir de `ARQUITETURA…` já proposto (GeoPonto = jornada; Argos Gestão = contratos/financeiro) |
| 3 | 03 Colaboradores | ❌ | pré-requisito de folha: CPF, matrícula, admissão, estabelecimento |
| 4 | 05 Jornada/escala/banco | 🟡 | escalas com horários; livro do banco; intrajornada |
| 5 | 04 Facial + REP-P | 🟡 | reconhecimento real + prova de vida **com modelo adequado**; NSR persistente; AEJ; assinatura. Avaliar certificação |
| 6 | 06 Férias/atestados | ❌ | |
| 7 | 07 Fechamento (estados/versões) | 🟡 | evoluir o que existe |
| 8 | 11 Central de interoperabilidade (RF-001) | ❌ | alta prioridade (decisão do proprietário) |
| 9 | 08 Folha / eSocial | ❌ ⛔ | depende do sistema de folha; **sem transmissão ao eSocial** |
| 10 | 09 Contabilidade/custos · 10 Contratos/glosas | ❌ ⛔ | depende de plano de contas e cláusulas |
| 11 | 12 IA · 13 Portais/UX | ❌ | IA só consultiva |
| 12 | 14 Auditoria final | ❌ | |

## Decisões e insumos pendentes (proprietário)
1. Acesso a Betices e Faceponto (ou código do Betices).
2. Sistema de folha/contabilidade de destino e acesso.
3. CCTs/ACTs, acordos de banco de horas, contratos com cláusulas de glosa, tabela de rubricas.
4. Autorização para: migration de aprovação atômica de ajuste e leitura de abonos pelo gestor (`geoponto/docs/migrations-propostas/001`), restringir UPDATE em `time_entries`, definir retenção de fotos.
5. Escolha do modelo de reconhecimento facial (ver custo, LGPD e hospedagem).
