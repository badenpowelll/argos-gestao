# GeoPonto IA — Requisitos funcionais

> Construção por módulos. Cada requisito traz regras, integrações, segurança, critérios de aceitação e prioridade. Viabilidade detalhada em `AUDITORIA_INTEGRACAO_PONTO_CONTABILIDADE.md`.

## RF-001 — Interoperabilidade automática  ·  Prioridade: **ALTA (obrigatório)**

**Descrição.** Interoperabilidade bidirecional, segura e automatizada entre o GeoPonto IA e sistemas externos de ponto, RH, Departamento Pessoal, folha, financeiro e contabilidade: importar, sincronizar, processar e exportar informações trabalhistas.

### Escopo por informação

| Informação | Importar | Exportar | Observação de viabilidade |
|---|---|---|---|
| Horas extras | ✔ | ✔ (pagamento ou banco) | apuração básica existe; falta categoria/adicional (CCT) |
| Banco de horas | ✔ | ✔ | falta livro de movimentações (hoje só saldo) |
| Férias | ✔ | — | sem tabela; criar `afastamentos` (tipo férias) |
| Atestados | ✔ (período + justificativa) | — | **não armazenar CID/diagnóstico**; só período e código de justificativa |
| Faltas e atrasos | — | ✔ (análise) | apuração existe; destino é "pendência de RH" |
| Licenças | ✔ | — | mesma tabela `afastamentos` |
| Escalas | ✔ | ✔ | `work_schedules` insuficiente; criar escala com horários + vínculo |
| Folha | — | ✔ (rubricas, quantidades, valores aprovados) | rubricas dependem do sistema de folha |
| Contabilidade | — | ✔ (eventos, centros de custo) | centros de custo não existem |
| Glosas | — | ✔ (proposta por posto/contrato/competência) | exige contratos de postos e cláusulas |

### Regras de negócio
1. **Dado importado nunca sobrescreve marcação original.** Importações geram registros próprios (`origem = externa`), em tabela separada de `time_entries`; nunca `UPDATE`/`DELETE` em marcação.
2. Ocorrência que afete a folha só segue após o fluxo de aprovação (ver fechamento mensal).
3. Identificação única do empregado: chave composta `empresa + matrícula`, com CPF como atributo de conferência (hoje **inexistente**: pré-requisito).
4. Hora trabalhada nunca liquidada em duplicidade (extra paga **e** banco).
5. Divergência entre sistemas vira **pendência de conferência**, nunca resolução automática silenciosa.

### Requisitos técnicos
- API REST documentada (OpenAPI), versionada (`/v1`), paginada.
- Webhooks assinados (HMAC-SHA256, timestamp, replay protection) com retentativa exponencial.
- Importação/exportação CSV, XLSX e JSON, com **validação prévia (dry-run)** e relatório de erros por linha.
- Adaptadores por conector (interface única); formatos oficiais/proprietários só quando houver especificação e acesso confirmados.
- Idempotência: `Idempotency-Key` por requisição e hash de conteúdo por arquivo; duplicidade rejeitada com referência ao lote original.
- Histórico de sincronizações (lote, origem, usuário, contagens, resultado), reprocessamento e **reconciliação automática** (comparação de totais e itens entre origem e destino).
- Tratamento de falhas: fila com estados (`pendente → enviado → confirmado | falhou`), *dead-letter*, alerta.
- Auditoria imutável (modelo do `audit_log` do Argos Gestão).

### Segurança e LGPD
- Credenciais por integração em cofre/variáveis de ambiente, nunca no repositório; escopo mínimo por conector; rotação.
- Autorização por ação (importar, aprovar, exportar), separação de funções (quem importa ≠ quem aprova).
- Isolamento multiempresa (RLS por `company_id`) também nos lotes e logs.
- Dados de saúde: apenas período/código; acesso restrito e registrado; minimização e retenção definidas em RIPD.

### Critérios de aceitação
- [ ] Reimportar o mesmo arquivo não cria registros novos.
- [ ] Nenhuma importação altera linha de `time_entries` (teste automatizado).
- [ ] Arquivo inválido é rejeitado integralmente ou por linha, conforme modo, com relatório.
- [ ] Usuário de uma empresa não vê lotes de outra (teste multiempresa).
- [ ] Falha do destino deixa o lote reenviável sem duplicar lançamentos.
- [ ] Conciliação aponta divergência de total entre GeoPonto e destino.
- [ ] Webhook com assinatura inválida/antiga é recusado.
- [ ] Exportação de folha só inclui competência **aprovada pelo RH**.

### Pré-requisitos (bloqueantes)
1. Definir o sistema de folha/contabilidade de destino e obter documentação/credenciais (**não identificado**).
2. Cadastro trabalhista: CPF, matrícula, admissão.
3. Tabela de rubricas e CCTs aplicáveis.

### Fluxo do fechamento mensal
Sistemas de ponto e RH → **Central de Integração do GeoPonto IA** → apuração de jornada e validação pelo RH → folha de pagamento · banco de horas · glosas e custos.

### Ordem sugerida de construção do RF-001
1. Modelo de lotes/logs/idempotência + importação CSV/JSON de escalas e afastamentos (dry-run).
2. Cadastro trabalhista (pré-requisito) e escala com horários.
3. API REST v1 + OpenAPI + webhooks assinados.
4. Exportação de apuração aprovada (CSV/XLSX/JSON) em modo sandbox.
5. Adaptadores específicos após definição do destino.
