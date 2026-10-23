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

/**
 * Converte o status devolvido pelo Suporte Argos para os rótulos usados
 * localmente na tela /suporte ("Aberto" | "Em andamento" | "Resolvido").
 */
const mapStatus = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("resolv") || s.includes("conclu") || s.includes("fechad")) return "Resolvido";
  if (s.includes("andamento") || s.includes("progress") || s.includes("analis")) return "Em andamento";
  if (s.includes("abert") || s.includes("pendent") || s.includes("novo")) return "Aberto";
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const solicitacaoId = (body as Record<string, unknown> | null)?.solicitacao_id;
    if (typeof solicitacaoId !== "string" || !solicitacaoId.trim()) {
      return json({ error: "solicitacao_id é obrigatório" }, 400);
    }

    const argosUrl = Deno.env.get("ARGOS_SUPORTE_URL");
    const argosKey = Deno.env.get("ARGOS_API_KEY");
    if (!argosUrl || !argosKey) {
      return json({ error: "Integração Suporte Argos não configurada" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: solicitacao, error: fetchError } = await admin
      .from("solicitacoes_suporte")
      .select("id, usuario_id, protocolo_argos, resposta, status")
      .eq("id", solicitacaoId)
      .maybeSingle();

    if (fetchError) return json({ error: fetchError.message }, 500);
    if (!solicitacao) return json({ error: "Solicitação não encontrada" }, 404);
    if (solicitacao.usuario_id !== user.id) return json({ error: "Forbidden" }, 403);

    // Sem protocolo, não há como consultar o sistema central.
    if (!solicitacao.protocolo_argos) return json({ atualizado: false, motivo: "sem_protocolo" });

    // Troca apenas o último segmento do caminho por "status-chamado".
    const statusUrl = argosUrl.replace(/receber-chamado-externo\/?$/, "status-chamado");

    const argosResponse = await fetch(statusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: argosKey, protocolo: solicitacao.protocolo_argos }),
    });

    const text = await argosResponse.text();
    if (!argosResponse.ok) {
      console.error("Consulta de status ao Argos falhou", argosResponse.status, text);
      return json({ atualizado: false, status: argosResponse.status }, 502);
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      console.error("Resposta do Argos não é JSON válido", text.slice(0, 200));
      return json({ atualizado: false, motivo: "resposta_invalida" }, 502);
    }

    const ultimaResposta = typeof payload.ultima_resposta === "string"
      ? payload.ultima_resposta.trim()
      : "";

    if (!ultimaResposta || ultimaResposta === (solicitacao.resposta ?? "").trim()) {
      return json({ atualizado: false });
    }

    const novoStatus = mapStatus(payload.status);
    const patch: Record<string, unknown> = { resposta: ultimaResposta };
    if (novoStatus) patch.status = novoStatus;

    const { error: updateError } = await admin
      .from("solicitacoes_suporte")
      .update(patch)
      .eq("id", solicitacao.id);

    if (updateError) {
      console.error("Falha ao salvar resposta do Argos", updateError.message);
      return json({ atualizado: false, error: updateError.message }, 500);
    }

    return json({ atualizado: true, resposta: ultimaResposta, status: novoStatus ?? solicitacao.status });
  } catch (e) {
    console.error("verificar-resposta-suporte-argos falhou", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
