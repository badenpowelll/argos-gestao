import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import GeofenceMapPicker from "@/components/GeofenceMapPicker";
import {
  UserPlus,
  MapPin,
  Upload,
  CheckCircle2,
  Loader2,
  Users,
  Plus,
  Phone,
  Camera,
  Pencil,
} from "lucide-react";

interface AddressData {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}
interface EditingEmployee {
  user_id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  team_id: string | null;
  company_id: string | null;
  avatar_url: string | null;
  face_template?: any;
}

interface EmployeeRegisterProps {
  companyId?: string;
  companyName?: string;
  editingEmployee?: EditingEmployee | null;
  onEditDone?: () => void;
  onSuccess?: () => void;
}

const EmployeeRegister = ({ companyId: propCompanyId, companyName, editingEmployee: propEditingEmployee, onEditDone, onSuccess }: EmployeeRegisterProps = {}) => {
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [phone, setPhone] = useState("");

  // Company - auto set from prop
  const [selectedCompany] = useState(propCompanyId || "");

  // Team
  const [selectedTeam, setSelectedTeam] = useState("");
  const [teams, setTeams] = useState<{ id: string; name: string; company_id: string }[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [showNewTeam, setShowNewTeam] = useState(false);

  // Geofence
  const [geoLat, setGeoLat] = useState("");
  const [geoLng, setGeoLng] = useState("");
  const [geoRadius, setGeoRadius] = useState("100");
  const [geoNumber, setGeoNumber] = useState("");
  const [geoComplement, setGeoComplement] = useState("");

  // Inline employee selector
  const [employees, setEmployees] = useState<EditingEmployee[]>([]);
  const [internalEditing, setInternalEditing] = useState<EditingEmployee | null>(null);

  const editingEmployee = propEditingEmployee || internalEditing;

  // Load teams and employees
  useEffect(() => {
    const fetchData = async () => {
      const { data: teamsRes } = await supabase.from("teams").select("id, name, company_id").order("name");
      if (teamsRes) setTeams(teamsRes);

      if (propCompanyId) {
        const { data: emps } = await supabase
          .from("profiles")
          .select("user_id, name, email, phone, company_id, team_id, avatar_url, face_template")
          .eq("company_id", propCompanyId)
          .order("name");
        if (emps) setEmployees(emps as EditingEmployee[]);
      }
    };
    fetchData();
  }, [propCompanyId]);

  const clearForm = () => {
    setName(""); setEmail(""); setCep(""); setStreet(""); setNeighborhood("");
    setCity(""); setState(""); setNumber(""); setComplement(""); setGeoLat("");
    setGeoLng(""); setGeoRadius("100"); setGeoNumber(""); setGeoComplement("");
    setAvatarPreview(null); setAvatarFile(null); setPhone(""); setSelectedTeam("");
  };

  const handleSelectEmployee = (userId: string) => {
    if (userId === "__new__") {
      setInternalEditing(null);
      clearForm();
      return;
    }
    const emp = employees.find(e => e.user_id === userId);
    if (emp) setInternalEditing(emp);
  };


  useEffect(() => {
    if (!editingEmployee) return;
    setName(editingEmployee.name || "");
    setEmail(editingEmployee.email || "");
    setPhone(editingEmployee.phone || "");
    setSelectedTeam(editingEmployee.team_id || "");
    if (editingEmployee.avatar_url) setAvatarPreview(editingEmployee.avatar_url);

    const ft = editingEmployee.face_template;
    if (ft?.address) {
      setCep(ft.address.cep || "");
      setStreet(ft.address.street || "");
      setNumber(ft.address.number || "");
      setComplement(ft.address.complement || "");
      setNeighborhood(ft.address.neighborhood || "");
      setCity(ft.address.city || "");
      setState(ft.address.state || "");
    }

    // Load geofence
    if (editingEmployee.company_id) {
      supabase
        .from("geofences")
        .select("*")
        .eq("company_id", editingEmployee.company_id)
        .ilike("name", `%${editingEmployee.name}%`)
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setGeoLat(data[0].latitude.toString());
            setGeoLng(data[0].longitude.toString());
            setGeoRadius(data[0].radius.toString());
          }
        });
    }
  }, [editingEmployee]);

  const filteredTeams = propCompanyId
    ? teams.filter((t) => t.company_id === propCompanyId)
    : teams;

  const createTeam = async () => {
    if (!newTeamName.trim()) return;
    const companyForTeam = propCompanyId;
    if (!companyForTeam) {
      toast({ title: "Empresa não encontrada", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from("teams")
      .insert({ name: newTeamName.trim(), company_id: companyForTeam })
      .select("id, name, company_id")
      .single();
    if (error) {
      toast({ title: "Erro ao criar equipe", variant: "destructive" });
      return;
    }
    if (data) {
      setTeams((prev) => [...prev, data]);
      setSelectedTeam(data.id);
      setNewTeamName("");
      setShowNewTeam(false);
      toast({ title: "Equipe criada!" });
    }
  };

  // CEP auto-fill
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
        } else {
          toast({ title: "CEP não encontrado", variant: "destructive" });
        }
      } catch {
        toast({ title: "Erro ao buscar CEP", variant: "destructive" });
      } finally {
        setCepLoading(false);
      }
    }
  };

  // Avatar upload
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) {
      toast({ title: "Preencha nome e e-mail", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const companyId = propCompanyId;
      const isEditing = !!editingEmployee;

      if (isEditing) {
        // Update existing employee
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            name,
            email: email || null,
            phone: phone || null,
            team_id: selectedTeam || null,
            face_template: {
              photos_count: editingEmployee.face_template?.photos_count || 0,
              trained: editingEmployee.face_template?.trained || false,
              address: { cep, street, number, complement, neighborhood, city, state },
            },
          } as any)
          .eq("user_id", editingEmployee.user_id);

        if (profileError) throw profileError;

        // Update or create geofence
        if (geoLat && geoLng && companyId) {
          const { data: existingGeo } = await supabase
            .from("geofences")
            .select("id")
            .eq("company_id", companyId)
            .ilike("name", `%${editingEmployee.name}%`)
            .limit(1);

          if (existingGeo && existingGeo.length > 0) {
            await supabase.from("geofences").update({
              name: `Local de ${name}`,
              latitude: parseFloat(geoLat),
              longitude: parseFloat(geoLng),
              radius: parseInt(geoRadius) || 100,
            }).eq("id", existingGeo[0].id);
          } else {
            await supabase.from("geofences").insert({
              company_id: companyId,
              name: `Local de ${name}`,
              latitude: parseFloat(geoLat),
              longitude: parseFloat(geoLng),
              radius: parseInt(geoRadius) || 100,
            });
          }
        }

        toast({ title: "Funcionário atualizado com sucesso!" });
        // Refresh employees list
        if (propCompanyId) {
          const { data: emps } = await supabase
            .from("profiles")
            .select("user_id, name, email, phone, company_id, team_id, avatar_url, face_template")
            .eq("company_id", propCompanyId)
            .order("name");
          if (emps) setEmployees(emps as EditingEmployee[]);
        }
        if (propEditingEmployee) {
          onEditDone?.();
        } else {
          clearForm();
          setInternalEditing(null);
        }
      } else {
        // Create new employee
        const { data: newUser, error: authError } = await supabase.auth.signUp({
          email,
          password: Math.random().toString(36).slice(-10) + "A1!",
          options: { data: { name } },
        });

        if (authError) throw authError;
        const newUserId = newUser.user?.id;
        if (!newUserId) throw new Error("Falha ao criar usuário");

        await supabase
          .from("profiles")
          .update({
            company_id: companyId || null,
            name,
            phone: phone || null,
            team_id: selectedTeam || null,
            face_template: {
              photos_count: 0,
              trained: false,
              address: { cep, street, number, complement, neighborhood, city, state },
            },
          } as any)
          .eq("user_id", newUserId);

        if (geoLat && geoLng && companyId) {
          await supabase.from("geofences").insert({
            company_id: companyId,
            name: `Local de ${name}`,
            latitude: parseFloat(geoLat),
            longitude: parseFloat(geoLng),
            radius: parseInt(geoRadius) || 100,
          });
        }

        toast({ title: "Funcionário cadastrado com sucesso!" });

        // Reset form
        clearForm();
        onSuccess?.();
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!editingEmployee;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {isEditing ? "Editar Funcionário" : "Cadastrar Funcionário"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEditing ? "Atualize os dados do colaborador" : "Registre um novo colaborador com local de trabalho"}
        </p>

        {/* Employee selector */}
        {!propEditingEmployee && employees.length > 0 && (
          <div className="mt-3 space-y-2">
            <Label className="flex items-center gap-1.5">
              <Pencil className="h-3.5 w-3.5 text-primary" />
              Editar funcionário existente
            </Label>
            <Select
              value={internalEditing?.user_id || "__new__"}
              onValueChange={handleSelectEmployee}
            >
              <SelectTrigger>
                <SelectValue placeholder="Novo cadastro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">➕ Novo cadastro</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.user_id} value={emp.user_id}>
                    {emp.name} {emp.email ? `(${emp.email})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isEditing && propEditingEmployee && (
          <Button variant="outline" size="sm" className="mt-2" onClick={onEditDone}>
            ← Voltar para novo cadastro
          </Button>
        )}
        {companyName && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
            <span className="text-sm font-medium text-foreground">Empresa: {companyName}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Dados Pessoais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-primary" />
              Dados Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-dashed border-muted-foreground/30 bg-muted">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Label htmlFor="avatar" className="cursor-pointer inline-flex items-center gap-1.5 text-sm text-primary underline">
                    <Upload className="h-3.5 w-3.5" />
                    Anexar foto
                  </Label>
                  <input id="avatar" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  <Label htmlFor="avatar-camera" className="cursor-pointer inline-flex items-center gap-1.5 text-sm text-primary underline">
                    <Camera className="h-3.5 w-3.5" />
                    Tirar foto
                  </Label>
                  <input id="avatar-camera" type="file" accept="image/*" capture="user" className="hidden" onChange={handleAvatarChange} />
                </div>
                <p className="text-xs text-muted-foreground">JPG, PNG até 5MB</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo *</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria da Silva" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@empresa.com" required />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-green-500" />
                  WhatsApp
                </Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(84) 99999-9999" />
              </div>
            </div>

            {/* Team selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" />
                Equipe
              </Label>
              <div className="flex gap-2">
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione uma equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={() => setShowNewTeam(!showNewTeam)} title="Criar nova equipe">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {showNewTeam && (
                <div className="flex gap-2 mt-2">
                  <Input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Nome da nova equipe" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createTeam())} />
                  <Button type="button" size="sm" onClick={createTeam} disabled={!newTeamName.trim()}>Criar</Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Endereço */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-primary" />
              Endereço
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <div className="relative">
                  <Input id="cep" value={cep} onChange={(e) => handleCepChange(e.target.value)} placeholder="00000-000" maxLength={8} />
                  {cepLoading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="street">Rua</Label>
                <Input id="street" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Rua..." />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="number">Número</Label>
                <Input id="number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="123" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="complement">Complemento</Label>
                <Input id="complement" value={complement} onChange={(e) => setComplement(e.target.value)} placeholder="Apt 1" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="neighborhood">Bairro</Label>
                <Input id="neighborhood" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">UF</Label>
                <Input id="state" value={state} onChange={(e) => setState(e.target.value)} placeholder="UF" maxLength={2} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Local de Trabalho (Geofence) */}
        <GeofenceMapPicker
          latitude={geoLat}
          longitude={geoLng}
          radius={geoRadius}
          addressNumber={geoNumber}
          addressComplement={geoComplement}
          onLatChange={setGeoLat}
          onLngChange={setGeoLng}
          onRadiusChange={setGeoRadius}
          onAddressNumberChange={setGeoNumber}
          onAddressComplementChange={setGeoComplement}
        />

        {/* Submit */}
        <Button type="submit" className="w-full rounded-lg py-6 text-base" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
          {isEditing ? "Salvar Alterações" : "Cadastrar Funcionário"}
        </Button>
      </form>
    </div>
  );
};

export default EmployeeRegister;
