import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  MapPin, UserPlus, Upload, Loader2, Phone, Building2, Users, CheckCircle2, Camera,
} from "lucide-react";

interface AddressData {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

const RequestRegistration = () => {
  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  // Data
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string; company_id: string }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      // SECURITY: usa RPCs públicas que devolvem apenas id/name — não expõe
      // CNPJ, plano, max_users nem outros dados sensíveis a visitantes anônimos.
      const [companiesRes, teamsRes] = await Promise.all([
        supabase.rpc("get_public_companies"),
        supabase.rpc("get_public_teams"),
      ]);
      if (companiesRes.data) setCompanies(companiesRes.data as { id: string; name: string }[]);
      if (teamsRes.data) setTeams(teamsRes.data as { id: string; name: string; company_id: string }[]);
    };
    fetchData();
  }, []);

  const filteredTeams = selectedCompany
    ? teams.filter((t) => t.company_id === selectedCompany)
    : teams;

  const handleCepChange = async (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    setCep(cleaned);
    if (cleaned.length === 8) {
      setCepLoading(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
        const data: AddressData & { erro?: boolean } = await res.json();
        if (!data.erro) {
          setStreet(data.logradouro || "");
          setNeighborhood(data.bairro || "");
          setCity(data.localidade || "");
          setState(data.uf || "");
        }
      } catch { /* ignore */ }
      finally { setCepLoading(false); }
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error("Preencha nome e e-mail.");
      return;
    }
    if (!selectedCompany) {
      toast.error("Selecione uma empresa.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("registration_requests").insert({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        company_id: selectedCompany || null,
        team_id: selectedTeam || null,
        avatar_url: avatarPreview || null,
        address_cep: cep || null,
        address_street: street || null,
        address_number: number || null,
        address_complement: complement || null,
        address_neighborhood: neighborhood || null,
        address_city: city || null,
        address_state: state || null,
        // SECURITY: nunca gravamos senha em texto puro. O funcionário define a
        // própria senha via "Esqueci minha senha" após a aprovação do gestor.
        password_temp: null,
      } as any);

      if (error) throw error;
      setSubmitted(true);
      toast.success("Solicitação enviada com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao enviar solicitação: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
          <Card className="border-0 shadow-2xl text-center">
            <CardContent className="py-12 space-y-4">
              <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
              <h2 className="text-xl font-bold text-foreground">Solicitação Enviada!</h2>
              <p className="text-sm text-muted-foreground">
                Sua solicitação de cadastro foi enviada para análise do gestor.
                Você será notificado por e-mail quando seu acesso for liberado.
                Depois da aprovação, use a opção <strong>"Esqueci minha senha"</strong> na
                tela de login para definir sua senha de acesso.
              </p>
              <Link to="/login">
                <Button variant="outline" className="mt-4">← Voltar ao Login</Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary p-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 text-2xl font-bold text-primary-foreground">
            <MapPin className="h-7 w-7" />
            GeoPonto
          </div>
          <p className="text-primary-foreground/70 text-sm">Solicitar Cadastro de Funcionário</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-primary" />
              Dados Pessoais
            </CardTitle>
            <CardDescription>Preencha seus dados para solicitar acesso ao sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Avatar - camera ou arquivo */}
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-dashed border-muted-foreground/30 bg-muted">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Camera className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="avatar-camera" className="cursor-pointer text-sm text-primary underline flex items-center gap-1">
                    <Camera className="h-3.5 w-3.5" /> Tirar foto
                  </Label>
                  <input id="avatar-camera" type="file" accept="image/*" capture="user" className="hidden" onChange={handleAvatarChange} />
                  <Label htmlFor="avatar-file" className="cursor-pointer text-sm text-muted-foreground hover:text-primary underline flex items-center gap-1">
                    <Upload className="h-3.5 w-3.5" /> Anexar arquivo
                  </Label>
                  <input id="avatar-file" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  <p className="text-xs text-muted-foreground">JPG, PNG até 5MB</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nome Completo *</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria da Silva" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail (Login) *</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@empresa.com" required />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-green-500" />
                  WhatsApp
                </Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(84) 99999-9999" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    Empresa *
                  </Label>
                  <Select value={selectedCompany} onValueChange={(val) => { setSelectedCompany(val); setSelectedTeam(""); }}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-primary" />
                    Equipe
                  </Label>
                  <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {filteredTeams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Address */}
              <div className="space-y-3 border-t pt-4">
                <Label className="flex items-center gap-1.5 text-sm font-semibold">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  Endereço
                </Label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cep">CEP</Label>
                    <div className="relative">
                      <Input id="cep" value={cep} onChange={(e) => handleCepChange(e.target.value)} placeholder="00000-000" maxLength={8} />
                      {cepLoading && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="street">Rua</Label>
                    <Input id="street" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rua..." />
                  </div>
                </div>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="number">Número</Label>
                    <Input id="number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="123" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="complement">Complemento</Label>
                    <Input id="complement" value={complement} onChange={(e) => setComplement(e.target.value)} placeholder="Apt 1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="neighborhood">Bairro</Label>
                    <Input id="neighborhood" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city">Cidade</Label>
                    <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state">UF</Label>
                    <Input id="state" value={state} onChange={(e) => setState(e.target.value)} placeholder="UF" maxLength={2} />
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar Solicitação
              </Button>
            </form>
          </CardContent>
        </Card>

        <Link to="/login" className="mt-4 block text-center text-sm text-primary-foreground/70 hover:text-primary-foreground underline">
          ← Voltar ao Login
        </Link>
      </motion.div>
    </div>
  );
};

export default RequestRegistration;
