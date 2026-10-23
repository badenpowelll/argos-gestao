# Matriz de riscos

| ID | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | Marketing/uso como "ponto facial" sem reconhecimento real (A1/A2) | Alta | Alto (consumidor, trabalhista) | Corrigir texto OU implementar reconhecimento + prova de vida; não anunciar até lá |
| R2 | Foto/biometria exposta em bucket público (A3) | Média | Muito alto (LGPD art. 11, ANPD) | Verificar bucket em produção; torná-lo privado com URLs assinadas e política por dono/empresa (migration autorizada) |
| R3 | Declarar conformidade 671 sem REP-P/AEJ/assinatura | Alta | Alto (autuação, nulidade da prova de jornada) | Matriz de conformidade; só afirmar o comprovado |
| R4 | Marcações offline com relógio do cliente | Média | Alto | Registrar hora do servidor no sync + divergência sinalizada |
| R5 | Edição de marcações via `service_role`/banco | Baixa | Alto | Trigger de bloqueio UPDATE/DELETE + NSR persistido + hash |
| R6 | Cálculo trabalhista incorreto (HE, noturno, DSR, intervalo) | Média | Alto (passivo) | Regras versionadas, CCT parametrizável, revisão de especialista, testes |
| R7 | Dois bancos/autenticações (Supabase × Argos Gestão) | Média | Médio | API assinada, mapeamento de IDs, um mestre por entidade |
| R8 | Edição simultânea Lovable × código | Média | Médio | Fluxo por branch, merge só aprovado, conferir `list_edits` |
| R9 | Migration destrutiva (já houve `DELETE FROM time_entries`) | Baixa | Muito alto | Proibir sem autorização; revisão e backup antes |
| R10 | Dados de saúde (atestados) tratados sem restrição | Média | Alto | Só período/código; perfil restrito; RIPD |
| R11 | Falta de testes/CI | Alta | Médio | Suíte por módulo + CI |
| R12 | Dependência de CCTs e do sistema de folha não fornecidos | Alta | Alto (bloqueia fases 5–9) | Coleta formal de insumos |
