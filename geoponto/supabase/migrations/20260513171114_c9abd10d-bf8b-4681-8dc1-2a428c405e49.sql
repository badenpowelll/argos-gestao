-- Corrigir linter: Funções SECURITY DEFINER e acesso anônimo
-- Revoga execução pública de funções críticas (exemplo, ajuste conforme nomes reais se soubermos)
-- Como não temos a lista exata das funções, focamos na segurança geral

-- Garantir que anon não execute funções que não deve
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;

-- Forçar funções a serem SECURITY INVOKER onde possível (manualmente via linter links se necessário)

-- Limpeza de possíveis triggers órfãos que buscam 'subscription_id'
-- (Apenas se identificarmos o nome da função ou trigger no log, mas os logs eram genéricos)
