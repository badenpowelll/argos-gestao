# Matriz de riscos

| ID | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Marketing/uso como "ponto facial" sem reconhecimento real (A1/A2) | Alta | Alto (consumidor, trabalhista) | Corrigir texto OU implementar reconhecimento + prova de vida; não anunciar até lá |
| R2 | ~~Foto exposta em bucket público~~ — descartado: buckets privados, leitura restrita à empresa. Resta definir retenção das fotos e quem as vê | Baixa | Médio | Política de retenção; revisar acesso do gestor |
| R3 | Declarar conformidade 671 sem REP-P/AEJ/assinatura | Alta | Alto (autuação, nulidade da prova de jornada) | Matriz de conformidade; só afirmar o comprovado |
| R4 | Marcações offline com relógio do cliente | Média | Alto | Registrar hora do servidor no sync + divergência sinalizada |
| R5 | **Edição de marcações** por admin/dono/gestor (política UPDATE existente no banco) e via `service_role` | **Alta** | Alto | Remover a política UPDATE ou trocá-la por retificação versionada; trigger de bloqueio; NSR persistido + hash (migration autorizada) |
| R13 | Aprovação de ajuste sem criar a marcação (RLS de INSERT) | Média | Alto | Código já trata o erro; aplicar `approve_adjustment` (docs/migrations-propostas) |
| R6 | Cálculo trabalhista incorreto (HE, noturno, DSR, intervalo) | Média | Alto (passivo) | Regras versionadas, CCT parametrizável, revisão de especialista, testes |
| R7 | Dois bancos/autenticações (Supabase × Argos Gestão) | Média | Médio | API assinada, mapeamento de IDs, um mestre por entidade |
| R8 | Edição simultânea Lovable × código | Média | Médio | Fluxo por branch, merge só aprovado, conferir `list_edits` |
| R9 | Migration destrutiva (já houve `DELETE FROM time_entries`) | Baixa | Muito alto | Proibir sem autorização; revisão e backup antes |
| R10 | Dados de saúde (atestados) tratados sem restrição | Média | Alto | Só período/código; perfil restrito; RIPD |
| R11 | Falta de testes/CI | Alta | Médio | Suíte por módulo + CI |
| R12 | Dependência de CCTs e do sistema de folha não fornecidos | Alta | Alto (bloqueia fases 5–9) | Coleta formal de insumos |
