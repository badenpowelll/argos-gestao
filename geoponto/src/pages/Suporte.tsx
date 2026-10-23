import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, Paperclip, Send, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hierarquia visual:
 *  1. Cabeçalho (contexto do módulo)
 *  2. Formulário de abertura (ação primária do usuário)
 *  3. Histórico do próprio usuário
 *  4. Painel administrativo (somente admin/owner)
 */

interface SupportRequest {
  id: string;
  usuario_id: string;
  nome: string;
  email_ou_matricula: string;
  modulo_origem: string;
  mensagem: string;
  anexo_url: string | null;
  status: string;
  resposta: string | null;
  sincronizado: boolean;
  protocolo_argos: string | null;
  created_at: string;
}

const STATUS_OPTIONS = ["Aberto", "Em andamento", "Resolvido"] as const;

const statusTone = (status: string) => {
  switch (status) {
    case "Resolvido":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "Em andamento":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    default:
      return "bg-primary/15 text-primary";
  }
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const Suporte = () => {
  const { user, role } = useAuth();
  const location = useLocation();
  const isAdmin = role === "admin" || role === "owner";

  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [anexo, setAnexo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [minhas, setMinhas] = useState<SupportRequest[]>([]);
  const [todas, setTodas] = useState<SupportRequest[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [verificandoId, setVerificandoId] = useState<string | null>(null);

  const identificacao = useMemo(() => user?.email ?? "", [user]);

  const carregar = useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from("solicitacoes_suporte")
        .select("*")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setMinhas((data ?? []) as SupportRequest[]);

      if (isAdmin) {
        const { data: all, error: allError } = await supabase
          .from("solicitacoes_suporte")
          .select("*")
          .order("created_at", { ascending: false });
        if (allError) throw allError;
        setTodas((all ?? []) as SupportRequest[]);
      }
    } catch (e) {
      console.error("Falha ao carregar solicitações de suporte", e);
      toast({
        title: "Não foi possível carregar os chamados",
        description: "Verifique sua conexão e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Consulta o Suporte Argos sobre um chamado específico.
   * Resiliente por design: qualquer falha (rede/serviço fora do ar) só vai ao
   * console — a tela nunca é bloqueada e a próxima checagem tenta de novo.
   */
  const verificarChamado = useCallback(
    async (id: string, manual = false) => {
      if (manual) setVerificandoId(id);
      try {
        const { data, error } = await supabase.functions.invoke("verificar-resposta-suporte-argos", {
          body: { solicitacao_id: id },
        });
        if (error) throw error;
        const atualizado = Boolean((data as { atualizado?: boolean } | null)?.atualizado);
        if (atualizado) await carregar();
        else if (manual) toast({ title: "Nenhuma novidade ainda", description: "O Suporte Argos ainda não respondeu." });
        return atualizado;
      } catch (err) {
        console.error("Falha ao verificar resposta do Suporte Argos", err);
        return false;
      } finally {
        if (manual) setVerificandoId(null);
      }
    },
    [carregar],
  );

  // Polling em segundo plano (15s) apenas para chamados aguardando resposta.
  useEffect(() => {
    const pendentes = minhas.filter((r) => r.protocolo_argos && !r.resposta);
    if (pendentes.length === 0) return;

    let cancelado = false;
    const tick = async () => {
      let mudou = false;
      for (const req of pendentes) {
        if (cancelado) return;
        const r = await verificarChamado(req.id);
        mudou = mudou || r;
        if (mudou) break; // carregar() já foi chamado dentro de verificarChamado
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 15000);
    return () => {
      cancelado = true;
      window.clearInterval(timer);
    };
    // Reavalia sempre que a lista muda (novo chamado ou resposta recebida).
  }, [minhas, verificarChamado]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!mensagem.trim()) {
      toast({ title: "Descreva o problema", variant: "destructive" });
      return;
    }

    setEnviando(true);
    try {
      let anexoUrl: string | null = null;

      if (anexo) {
        const ext = anexo.name.split(".").pop() ?? "bin";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("suporte-anexos")
          .upload(path, anexo, { upsert: false });
        if (uploadError) throw uploadError;
        anexoUrl = path;
      }

      const nome =
        (user.user_metadata?.name as string | undefined) || identificacao || "Usuário GeoPonto";
      const assuntoFinal = assunto.trim() || "Chamado GeoPonto";

      const { data, error } = await supabase
        .from("solicitacoes_suporte")
        .insert({
          usuario_id: user.id,
          nome,
          email_ou_matricula: identificacao,
          modulo_origem: location.pathname,
          mensagem: `${assuntoFinal}\n\n${mensagem.trim()}`,
          anexo_url: anexoUrl,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Encaminhamento ao Suporte Argos: assíncrono e não bloqueante.
      // Uma falha aqui não invalida o chamado salvo localmente.
      void supabase.functions
        .invoke("enviar-suporte-argos", {
          body: {
            solicitacao_id: data.id,
            nome_solicitante: nome,
            email_ou_matricula: identificacao,
            assunto: assuntoFinal,
            descricao: mensagem.trim(),
          },
        })
        .then(({ error: fnError }) => {
          if (fnError) console.error("Encaminhamento ao Suporte Argos falhou", fnError);
        })
        .catch((err) => console.error("Encaminhamento ao Suporte Argos falhou", err))
        .finally(() => void carregar());

      toast({
        title: "Chamado registrado",
        description: "Sua solicitação foi salva e encaminhada ao Suporte Argos.",
      });
      setAssunto("");
      setMensagem("");
      setAnexo(null);
      await carregar();
    } catch (err) {
      console.error("Falha ao abrir chamado", err);
      toast({
        title: "Não foi possível abrir o chamado",
        description: err instanceof Error ? err.message : "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  const atualizarChamado = async (id: string, patch: { status?: string; resposta?: string }) => {
    setSalvandoId(id);
    try {
      const { error } = await supabase.from("solicitacoes_suporte").update(patch).eq("id", id);
      if (error) throw error;
      toast({ title: "Chamado atualizado" });
      await carregar();
    } catch (err) {
      console.error("Falha ao atualizar chamado", err);
      toast({
        title: "Não foi possível atualizar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSalvandoId(null);
    }
  };

  const renderStatus = (req: SupportRequest) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge className={cn("border-0 font-semibold", statusTone(req.status))}>{req.status}</Badge>
      <Badge variant="outline" className="gap-1 text-xs font-normal">
        {req.sincronizado ? (
          <>
            <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Enviado ao Argos
          </>
        ) : (
          <>
            <Clock3 className="h-3 w-3" /> Aguardando envio
          </>
        )}
      </Badge>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <header className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LifeBuoy className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground md:text-2xl">Suporte</h1>
          <p className="text-sm text-muted-foreground">
            Abra um chamado. Ele fica registrado aqui e é encaminhado ao Suporte Argos.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo chamado</CardTitle>
          <CardDescription>Descreva o que aconteceu com o máximo de detalhes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="assunto">Assunto</Label>
              <Input
                id="assunto"
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                placeholder="Ex.: Erro ao registrar ponto"
                maxLength={140}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mensagem">Descrição *</Label>
              <Textarea
                id="mensagem"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Conte o que você estava fazendo e o que aconteceu."
                rows={5}
                required
                maxLength={4000}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="anexo" className="flex items-center gap-1.5">
                <Paperclip className="h-4 w-4" /> Anexo (opcional)
              </Label>
              <Input
                id="anexo"
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setAnexo(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button type="submit" disabled={enviando} className="min-h-11 w-full sm:w-auto">
              <Send className="mr-2 h-4 w-4" />
              {enviando ? "Enviando..." : "Abrir chamado"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Meus chamados</CardTitle>
            <CardDescription>{minhas.length} solicitação(ões)</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className={cn("h-4 w-4", carregando && "animate-spin")} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!carregando && minhas.length === 0 && (
            <p className="text-sm text-muted-foreground">Você ainda não abriu nenhum chamado.</p>
          )}
          {minhas.map((req) => (
            <div key={req.id} className="rounded-lg border p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                    {req.mensagem}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(req.created_at)} • {req.modulo_origem}
                  </p>
                </div>
                {renderStatus(req)}
              </div>
              {req.resposta && (
                <div className="mt-2 rounded-md bg-muted p-2 text-sm">
                  <span className="font-semibold">
                    {req.protocolo_argos ? "Respondido pelo Suporte Argos: " : "Resposta: "}
                  </span>
                  {req.resposta}
                </div>
              )}
              {/* Ação manual de fallback: o polling automático já roda a cada 15s. */}
              {!req.resposta && req.protocolo_argos && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8 px-2 text-xs text-muted-foreground"
                  disabled={verificandoId === req.id}
                  onClick={() => void verificarChamado(req.id, true)}
                >
                  <RefreshCw className={cn("mr-1.5 h-3 w-3", verificandoId === req.id && "animate-spin")} />
                  Verificar atualização
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Painel administrativo</CardTitle>
            <CardDescription>Todos os chamados abertos no sistema</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!carregando && todas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum chamado registrado.</p>
            )}
            {todas.map((req) => (
              <div key={req.id} className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {req.nome}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({req.email_ou_matricula})
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                      {req.mensagem}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(req.created_at)} • {req.modulo_origem}
                    </p>
                  </div>
                  {renderStatus(req)}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={req.status}
                    onValueChange={(value) => void atualizarChamado(req.id, { status: value })}
                  >
                    <SelectTrigger className="min-h-11 sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={respostas[req.id] ?? req.resposta ?? ""}
                    onChange={(e) =>
                      setRespostas((prev) => ({ ...prev, [req.id]: e.target.value }))
                    }
                    placeholder="Resposta ao solicitante"
                    rows={2}
                    className="flex-1"
                  />
                  <Button
                    variant="secondary"
                    className="min-h-11"
                    disabled={salvandoId === req.id}
                    onClick={() =>
                      void atualizarChamado(req.id, {
                        resposta: respostas[req.id] ?? req.resposta ?? "",
                      })
                    }
                  >
                    Responder
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Suporte;
