# Matriz de conformidade — Portaria MTP nº 671/2021 (REP-P) · GeoPonto IA

> 23/10/2026 · base: `geoponto@566c344` e banco real (consulta somente leitura).
> **Limite desta verificação:** o ambiente de desenvolvimento não alcança `gov.br` (`ENOTFOUND`), então **não foi possível ler a Portaria, os leiautes oficiais de AFD/AEJ nem a documentação do REP-P**. Os requisitos abaixo são o entendimento geral da norma e **devem ser conferidos linha a linha** no texto oficial e por especialista trabalhista antes de qualquer declaração de conformidade. Este documento **não** certifica nem homologa nada.

Legenda: ✅ atende no código/banco · 🟡 parcial · ❌ não atende · ⛔ depende de terceiros/validação formal.

| # | Requisito (a confirmar na norma) | Estado | Evidência / lacuna |
|---|---|---|---|
| 1 | Registro feito pelo próprio trabalhador, sem marcação automática ou pré-assinalada | ✅ | marcação por ação do usuário (`PunchClock.tsx`); sem automação |
| 2 | Identificação do empregador (CNPJ/CPF, nome, local) no registro/comprovante | 🟡 | CNPJ em `companies`; comprovante informativo contém empregador e CNPJ; sem local da prestação |
| 3 | Identificação do trabalhador por identificador oficial (CPF) | ❌ | **não há CPF/matrícula** no cadastro |
| 4 | Data/hora com relógio sincronizado a fonte confiável | ❌ | offline grava hora do aparelho; sem comparação com hora do servidor/Observatório Nacional |
| 5 | NSR sequencial, único e persistente | 🟡 | NSR só **calculado** na exportação; muda com inserções retroativas (sync offline) |
| 6 | Comprovante de registro entregue ao trabalhador | 🟡 | PDF informativo só no painel do admin; o trabalhador não emite o seu |
| 7 | Registros originais íntegros, sem edição/exclusão | ❌ | banco real tem política UPDATE em `time_entries` para admin/dono/gestor; hash só no cálculo |
| 8 | Ajustes/tratamentos sem alterar o original, com trilha | ✅ 🟡 | ajuste cria **nova** marcação + `audit_logs`; falta bloquear edição direta (item 7) |
| 9 | Armazenamento seguro, com cópia/redundância | ⛔ | backup depende do provedor (Supabase/Lovable Cloud); não verificado |
| 10 | Arquivo-fonte de dados (AFD) conforme leiaute oficial | 🟡 | AFD **simplificado**, sem validação no leiaute oficial |
| 11 | AEJ (Arquivo Eletrônico de Jornada) conforme leiaute oficial | ❌ | inexistente |
| 12 | Espelho de ponto | 🟡 | PDF existe (`EmployeeReport`), editável antes da geração; avaliar se pode haver campo editável no espelho oficial |
| 13 | Assinatura digital dos arquivos (certificado ICP-Brasil) | ❌ | inexistente |
| 14 | Atestado Técnico e Termo de Responsabilidade do desenvolvedor | ⛔ | documentos formais da Argos, ainda não elaborados |
| 15 | Acesso de auditor-fiscal / disponibilização dos arquivos | 🟡 | exportação existe para admin; sem perfil de fiscalização |
| 16 | Segurança, LGPD e tratamento de biometria | 🟡 | RLS por empresa, buckets privados; **sem reconhecimento facial real nem prova de vida**; falta RIPD/retenção |
| 17 | Operação sem restrição indevida (offline/indisponibilidade) | ✅ 🟡 | fila offline existe; hora local (item 4) |

## Resumo
- **Atende:** 2 itens plenamente (1, 17 com ressalva); **parciais:** 9; **não atendem:** 6 (3, 4, 7, 11, 13 e 8 depende do 7); **dependem de terceiros:** 3.
- **Não declarar conformidade, homologação ou certificação.** O sistema registra e apura ponto, mas **não cumpre** a Portaria hoje.

## Ordem de correção sugerida
1. Item 7: remover/limitar o UPDATE em `time_entries` e bloquear por trigger (migration, com autorização).
2. Itens 3 e 5: CPF/matrícula no cadastro e **NSR gravado** no momento da marcação, com hora do servidor (item 4).
3. Item 6: comprovante para o trabalhador (depende do NSR gravado por causa da RLS).
4. Itens 10, 11, 13: AFD/AEJ nos leiautes oficiais + assinatura (precisa dos leiautes e de certificado ICP-Brasil).
5. Item 14 e validação final com especialista.
