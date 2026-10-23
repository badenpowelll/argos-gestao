# Teste das migrations propostas em banco descartável

Nunca rode isto no banco real. Use um Postgres local vazio:

```bash
createdb teste
psql -d teste -v ON_ERROR_STOP=1 -f stub.sql                       # papéis, enums e tabelas mínimas (stubs)
psql -d teste -v ON_ERROR_STOP=1 -f ../001_aprovacao_de_ajustes_e_gestor.sql
psql -d teste -v ON_ERROR_STOP=1 -f ../002_fechamento_mensal.sql
psql -d teste -A -t -f cenarios.sql                                # 22 cenários: permissões, estados, bloqueio, retificação
```

Resultado esperado: cada linha marca `OK` ou o erro de regra esperado (ver o texto do cenário).
O `stub.sql` imita só o necessário do Supabase (`auth.uid()` lido de `app.uid`); não substitui testar no ambiente real.
