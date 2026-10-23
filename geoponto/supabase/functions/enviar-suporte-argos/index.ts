import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Valida a sessão do usuário autenticado que está chamando a função.
    const callerClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Corpo da requisição inválido" }, 400);
    }

    const {
      solicitacao_id,
      nome_solicitante,
      email_ou_matricula,
      assunto,
      descricao,
      prioridade,
    } = body as Record<string, unknown>;

    // Validação de entrada mínima (sem dependências externas).
    const errors: string[] = [];
    if (typeof solicitacao_id !== "string" || !solicitacao_id.trim()) {
      errors.push("solicitacao_id é obrigatório");
    }
    if (typeof descricao !== "string" || !descricao.trim()) {
      errors.push("descricao é obrigatória");
    }
    if (errors.length) return json({ error: errors.join("; ") }, 400);

    const argosUrl = Deno.env.get("ARGOS_SUPORTE_URL");
    const argosKey = Deno.env.get("ARGOS_API_KEY");
    if (!argosUrl || !argosKey) {
      return json({ error: "Integração Suporte Argos não configurada" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Confirma que a solicitação existe e pertence ao usuário autenticado.
    const { data: solicitacao, error: fetchError } = await admin
      .from("solicitacoes_suporte")
      .select("id, usuario_id, nome, email_ou_matricula, mensagem, modulo_origem")
      .eq("id", solicitacao_id as string)
      .maybeSingle();

    if (fetchError) return json({ error: fetchError.message }, 500);
    if (!solicitacao) return json({ error: "Solicitação não encontrada" }, 404);
    if (solicitacao.usuario_id !== user.id) return json({ error: "Forbidden" }, 403);

    const payload = {
      api_key: argosKey,
      nome_solicitante:
        (typeof nome_solicitante === "string" && nome_solicitante) ||
        solicitacao.nome ||
        "Usuário GeoPonto",
      email_ou_matricula:
        (typeof email_ou_matricula === "string" && email_ou_matricula) ||
        solicitacao.email_ou_matricula ||
        user.email ||
        "",
      assunto:
        (typeof assunto === "string" && assunto) ||
        `GeoPonto — ${solicitacao.modulo_origem || "Suporte"}`,
      descricao: descricao as string,
      ...(typeof prioridade === "string" && prioridade ? { prioridade } : {}),
    };

    const argosResponse = await fetch(argosUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const argosText = await argosResponse.text();

    if (!argosResponse.ok) {
      console.error("Suporte Argos respondeu com erro", argosResponse.status, argosText);
      return json(
        { sincronizado: false, status: argosResponse.status, detalhe: argosText },
        502,
      );
    }

    // O Argos devolve um protocolo que permite consultar o andamento depois.
    let protocolo: string | null = null;
    try {
      const parsed = JSON.parse(argosText) as Record<string, unknown>;
      const raw = parsed.protocolo ?? parsed.protocolo_argos;
      if (typeof raw === "string" && raw.trim()) protocolo = raw.trim();
      else if (typeof raw === "number") protocolo = String(raw);
    } catch {
      // Resposta não-JSON: segue apenas marcando como sincronizado.
    }

    const { error: updateError } = await admin
      .from("solicitacoes_suporte")
      .update({ sincronizado: true, ...(protocolo ? { protocolo_argos: protocolo } : {}) })
      .eq("id", solicitacao.id);

    if (updateError) {
      console.error("Falha ao marcar solicitação como sincronizada", updateError.message);
      return json({ sincronizado: false, error: updateError.message }, 500);
    }

    return json({ sincronizado: true });
  } catch (e) {
    console.error("enviar-suporte-argos falhou", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
