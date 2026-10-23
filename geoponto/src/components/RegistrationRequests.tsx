import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { UserCheck, UserX, Loader2, Clock, Mail, Phone, MapPin, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RegistrationRequest {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company_id: string | null;
  team_id: string | null;
  avatar_url: string | null;
  address_cep: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  status: string;
  created_at: string;
  password_temp: string | null;
}

const RegistrationRequests = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from("registration_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setRequests(data as RegistrationRequest[]);
    setLoading(false);
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleApprove = async (request: RegistrationRequest) => {
    setProcessingId(request.id);
    try {
      // SECURITY: senha aleatória sempre — o funcionário define a própria senha
      // pelo fluxo de "Esqueci minha senha" (e-mail) após a aprovação.
      const userPassword = Math.random().toString(36).slice(-10) + "A1!";

      const res = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: request.email,
          password: userPassword,
          name: request.name,
          company_id: request.company_id,
          team_id: request.team_id,
          phone: request.phone,
          avatar_url: request.avatar_url,
          address: {
            cep: request.address_cep,
            street: request.address_street,
            number: request.address_number,
            complement: request.address_complement,
            neighborhood: request.address_neighborhood,
            city: request.address_city,
            state: request.address_state,
          },
        },
      });

      if (res.error) throw new Error(res.error.message || "Erro ao criar usuário");
      const result = res.data;
      if (result?.error) throw new Error(result.error);

      await supabase.from("registration_requests").update({
        status: "approved",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        password_temp: null,
      } as any).eq("id", request.id);

      toast.success(`${request.name} aprovado! Oriente a usar "Esqueci minha senha" no login para definir a senha.`, { duration: 8000 });
      fetchRequests();
    } catch (err: any) {
      toast.error("Erro ao aprovar: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request: RegistrationRequest) => {
    setProcessingId(request.id);
    try {
      await supabase.from("registration_requests").update({
        status: "rejected",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", request.id);

      toast.success(`Solicitação de ${request.name} rejeitada.`);
      fetchRequests();
    } catch (err: any) {
      toast.error("Erro ao rejeitar: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (request: RegistrationRequest) => {
    if (!confirm(`Deseja excluir a solicitação de ${request.name}?`)) return;
    setProcessingId(request.id);
    try {
      const { error } = await supabase
        .from("registration_requests")
        .delete()
        .eq("id", request.id);
      if (error) throw error;
      toast.success("Solicitação excluída.");
      fetchRequests();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const processedRequests = requests.filter((r) => r.status !== "pending");

  const formatAddress = (r: RegistrationRequest) => {
    const parts = [r.address_street, r.address_number, r.address_complement, r.address_neighborhood].filter(Boolean);
    const cityState = [r.address_city, r.address_state].filter(Boolean).join(" - ");
    if (cityState) parts.push(cityState);
    if (r.address_cep) parts.push(`CEP: ${r.address_cep}`);
    return parts.join(", ") || null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">
        Solicitações de Cadastro
        {pendingRequests.length > 0 && (
          <Badge variant="destructive" className="ml-2">{pendingRequests.length} pendente(s)</Badge>
        )}
      </h2>

      {pendingRequests.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma solicitação pendente.
          </CardContent>
        </Card>
      )}

      {pendingRequests.map((req) => (
        <Card key={req.id} className="border-l-4 border-l-yellow-500">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {req.avatar_url ? (
                  <img src={req.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                    {req.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <CardTitle className="text-base">{req.name}</CardTitle>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(req.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Pendente</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-4">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> {req.email}
              </span>
              {req.phone && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 text-green-500" /> {req.phone}
                </span>
              )}
            </div>
            {formatAddress(req) && (
              <p className="flex items-start gap-1 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {formatAddress(req)}
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => handleApprove(req)}
                disabled={processingId === req.id}
                className="bg-green-600 hover:bg-green-700"
              >
                {processingId === req.id ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserCheck className="mr-1 h-3.5 w-3.5" />
                )}
                Aprovar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleReject(req)}
                disabled={processingId === req.id}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <UserX className="mr-1 h-3.5 w-3.5" />
                Rejeitar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(req)}
                disabled={processingId === req.id}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Excluir
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {processedRequests.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Histórico</h3>
          {processedRequests.map((req) => (
            <Card key={req.id} className="opacity-70">
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                    {req.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{req.name}</p>
                    <p className="text-xs text-muted-foreground">{req.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={req.status === "approved" ? "default" : "destructive"}>
                    {req.status === "approved" ? "Aprovado" : "Rejeitado"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(req)}
                    disabled={processingId === req.id}
                    className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default RegistrationRequests;
