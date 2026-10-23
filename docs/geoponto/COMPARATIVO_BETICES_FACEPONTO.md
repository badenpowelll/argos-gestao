# Comparativo GeoPonto × Betices × Faceponto

**Status: NÃO REALIZADO.** `betices.geopontoapp.com` e `faceponto.com.br` não resolvem a partir do ambiente de desenvolvimento (`getaddrinfo ENOTFOUND`). Sem evidência, nenhuma funcionalidade deles é descrita aqui (nada será inventado ou presumido de memória).

Para concluir é preciso, para cada um: (a) acesso por navegador com conta autorizada, prints/gravação das telas e lista de módulos, ou (b) o código-fonte do Betices, se for projeto seu (qual repositório?).

Matriz a preencher após o acesso:

| Funcionalidade | GeoPonto atual | Betices | Faceponto | Reutilização | Melhoria | Prioridade |
|---|---|---|---|---|---|---|
| Registro facial com prova de vida | 🟡 heurística | ? | ? | | | Alta |
| Registro coletivo (tablet) | ❌ | ? | ? | | | Média |
| Escalas/12x36 | ❌ | ? | ? | | | Alta |
| Banco de horas | ❌ | ? | ? | | | Alta |
| Folha/exportação | ❌ | ? | ? | | | Alta |
| Portal do empregado | 🟡 | ? | ? | | | Média |
| App/PWA | ✅ PWA | ? | ? | | | Média |
| Conformidade 671 | 🟡 | ? | ? | | | Alta |

Reaproveitamento dentro da Argos: do **argos-gestao** vêm padrões de idempotência, imutabilidade por trigger, auditoria imutável e importação com revisão humana (ver `AUDITORIA_INTEGRACAO_PONTO_CONTABILIDADE.md`). Outros repositórios do proprietário (Licita Argos, Portal Argos etc.) **não foram acessados**: só `geoponto` e `argos-gestao` estão no escopo desta sessão.
