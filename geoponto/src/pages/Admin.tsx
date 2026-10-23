import { useEffect, useState, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FaceImage from "@/components/FaceImage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import StatusBadge from "@/components/StatusBadge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Users,
  Settings,
  MapPin,
  Shield,
  ChevronRight,
  Plus,
  Loader2,
  UserPlus,
  X,
  Building2,
  Search,
  FileEdit,
  FileText,
  CheckCircle2,
  XCircle,
  UserCheck,
  Pencil,
  Trash2,
  ExternalLink,
  Mail,
  Phone,
  User,
  ScanFace,
  Clock,
  UsersRound,
  ClipboardList,
  BarChart3,
  Inbox,
  UserCog,
  Scan,
  CalendarCheck,
  Camera,
} from "lucide-react";
import EmployeeRegister from "./EmployeeRegister";
import EmployeeManagement from "@/components/EmployeeManagement";
import EmployeeReport from "@/components/EmployeeReport";
import RegistrationRequests from "@/components/RegistrationRequests";
import EmployeeCards from "@/components/EmployeeCards";
import AbsenceManagement from "@/components/AbsenceManagement";
import MonthlyClosingPanel from "@/components/MonthlyClosing";
import Portaria671Panel from "@/components/Portaria671Panel";
const Profile = lazy(() => import("./Profile"));
const FaceAnalysis = lazy(() => import("./FaceAnalysis"));

interface CNPJSocio {
  nome: string;
  qual: string;
}

interface CNPJData {
  nome: string;
  fantasia: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  cnpj: string;
  status: string;
  socios: CNPJSocio[];
}

const Admin = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"menu" | "team" | "company" | "audit" | "register" | "adjustments" | "reports" | "requests" | "profile" | "facial" | "employees" | "absences" | "closing" | "portaria">("menu");
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [geofences, setGeofences] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [pendingAdjustments, setPendingAdjustments] = useState<any[]>([]);
  const [adjProfiles, setAdjProfiles] = useState<Record<string, { name: string; email: string }>>({}); 
  const [allTimeEntries, setAllTimeEntries] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [savingTeam, setSavingTeam] = useState(false);
  const [validatingEntryId, setValidatingEntryId] = useState<string | null>(null);

  // Team editing
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editingFullEmployee, setEditingFullEmployee] = useState<any>(null);

  // Rejection dialog state
  const [rejectingAdjId, setRejectingAdjId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Company state
  const [companyName, setCompanyName] = useState("");
  const [companyCnpj, setCompanyCnpj] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [cnpjInput, setCnpjInput] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjData, setCnpjData] = useState<CNPJData | null>(null);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      const [profilesRes, geofencesRes, auditRes, teamsRes, adjRes, timeEntriesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, name, email, company_id, team_id, avatar_url, created_at, phone"),
        supabase.from("geofences").select("*"),
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("teams").select("*").order("name"),
        supabase.from("adjustments").select("*").order("created_at", { ascending: false }),
        supabase.from("time_entries").select("*").order("timestamp", { ascending: false }).limit(200),
      ]);

      setEmployees(profilesRes.data || []);
      setGeofences(geofencesRes.data || []);
      setAuditLogs(auditRes.data || []);
      setPendingAdjustments(adjRes.data || []);
      setAllTimeEntries(timeEntriesRes.data || []);

      const pMap: Record<string, { name: string; email: string }> = {};
      (profilesRes.data || []).forEach((p: any) => { pMap[p.user_id] = { name: p.name || "Sem nome", email: p.email || "" }; });
      setAdjProfiles(pMap);
      setTeams(teamsRes.data || []);

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (profile?.company_id) {
        setCompanyId(profile.company_id);
        const { data: company } = await supabase
          .from("companies")
          .select("name, cnpj")
          .eq("id", profile.company_id)
          .single();
        if (company) {
          setCompanyName(company.name || "");
          setCompanyCnpj(company.cnpj || "");
        }
      }

      setLoading(false);
    };

    fetchData();
  }, [user]);

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  };

  const handleCnpjSearch = async () => {
    const digits = cnpjInput.replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos.");
      return;
    }
    setCnpjLoading(true);
    setCnpjData(null);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) throw new Error("CNPJ não encontrado");
      const data = await res.json();
      const result: CNPJData = {
        nome: data.razao_social || "",
        fantasia: data.nome_fantasia || "",
        logradouro: data.logradouro || "",
        numero: data.numero || "",
        complemento: data.complemento || "",
        bairro: data.bairro || "",
        municipio: data.municipio || "",
        uf: data.uf || "",
        cep: data.cep || "",
        telefone: data.ddd_telefone_1 || "",
        email: data.email || "",
        cnpj: digits,
        status: data.descricao_situacao_cadastral || "",
        socios: (data.qsa || []).map((s: any) => ({
          nome: s.nome_socio || s.nome || "",
          qual: s.qualificacao_socio || s.qual || "",
        })),
      };
      setCnpjData(result);
      setCompanyAddress(`${result.logradouro}, ${result.numero} ${result.complemento} - ${result.bairro}, ${result.municipio}/${result.uf}`);
      setCompanyPhone(result.telefone);
      setCompanyEmail(result.email);
      toast.success("Dados da empresa encontrados!");
    } catch {
      toast.error("Não foi possível buscar o CNPJ. Verifique e tente novamente.");
    } finally {
      setCnpjLoading(false);
    }
  };

  const handleSaveCompany = async () => {
    if (!cnpjData) return;
    setSavingCompany(true);
    const name = cnpjData.fantasia || cnpjData.nome;
    const cnpj = cnpjData.cnpj;

    try {
      if (companyId) {
        const { error } = await supabase
          .from("companies")
          .update({ name, cnpj })
          .eq("id", companyId);
        if (error) throw error;
        setCompanyName(name);
        setCompanyCnpj(cnpj);
        toast.success("Empresa atualizada com sucesso!");
      } else {
        const { data: newCompany, error: insertError } = await supabase
          .from("companies")
          .insert({ name, cnpj })
          .select()
          .single();
        if (insertError) throw insertError;

        const { error: profileError } = await supabase
          .from("profiles")
          .update({ company_id: newCompany.id })
          .eq("user_id", user!.id);
        if (profileError) throw profileError;

        setCompanyId(newCompany.id);
        setCompanyName(name);
        setCompanyCnpj(cnpj);
        toast.success("Empresa cadastrada e vinculada com sucesso!");
      }
      setCnpjData(null);
      setCnpjInput("");
    } catch (err: any) {
      toast.error("Erro ao salvar empresa: " + err.message);
    }
    setSavingCompany(false);
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setSavingTeam(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user!.id)
      .single();

    if (!profile?.company_id) {
      toast.error("Empresa não encontrada.");
      setSavingTeam(false);
      return;
    }

    const { data, error } = await supabase
      .from("teams")
      .insert({ name: newTeamName.trim(), company_id: profile.company_id })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao criar equipe: " + error.message);
    } else {
      setTeams((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTeamName("");
      setShowNewTeam(false);
      toast.success("Equipe criada com sucesso!");
    }
    setSavingTeam(false);
  };

  const handleEditTeam = async (teamId: string) => {
    if (!editTeamName.trim()) return;
    const { error } = await supabase.from("teams").update({ name: editTeamName.trim() }).eq("id", teamId);
    if (error) {
      toast.error("Erro ao editar equipe: " + error.message);
    } else {
      setTeams((prev) => prev.map((t) => t.id === teamId ? { ...t, name: editTeamName.trim() } : t));
      setEditingTeamId(null);
      toast.success("Equipe atualizada!");
    }
  };

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (!confirm(`Deseja excluir a equipe "${teamName}"?`)) return;
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    if (error) {
      toast.error("Erro ao excluir equipe: " + error.message);
    } else {
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
      toast.success("Equipe excluída!");
    }
  };

  const handleValidateTimeEntry = async (entryId: string, newStatus: "verified" | "flagged" | "outside_perimeter") => {
    try {
      const { error } = await supabase
        .from("time_entries")
        .update({ status: newStatus })
        .eq("id", entryId);

      if (error) throw error;

      setAllTimeEntries((prev) =>
        prev.map((entry) => (entry.id === entryId ? { ...entry, status: newStatus } : entry))
      );
      toast.success(newStatus === "verified" ? "Irregularidade validada como OK!" : "Registro mantido como irregular.");
      setValidatingEntryId(null);
    } catch (err: any) {
      toast.error("Erro ao validar registro: " + err.message);
    }
  };

  const pendingAdjustmentsCount = pendingAdjustments.filter(a => a.status === "pending").length;

  // Pendentes primeiro e do mais antigo para o mais novo (backlog visível no topo);
  // aprovados/rejeitados ficam depois, os mais recentes primeiro, como histórico.
  const sortedAdjustments = [...pendingAdjustments].sort((a, b) => {
    const aPending = a.status === "pending";
    const bPending = b.status === "pending";
    if (aPending !== bPending) return aPending ? -1 : 1;
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    return aPending ? aTime - bTime : bTime - aTime;
  });

  const daysSince = (dateStr: string) => {
    const created = new Date(dateStr).getTime();
    if (Number.isNaN(created)) return 0;
    return Math.max(0, Math.floor((Date.now() - created) / 86400000));
  };

  const tabs = [
    { key: "company" as const, label: "Empresa", icon: Building2, color: "text-blue-600", bgColor: "bg-blue-50", description: "Dados cadastrais da empresa" },
    { key: "employees" as const, label: "Funcionários", icon: UsersRound, color: "text-emerald-600", bgColor: "bg-emerald-50", description: "Gerenciamento de colaboradores" },
    { key: "team" as const, label: "Equipes", icon: Users, color: "text-violet-600", bgColor: "bg-violet-50", description: "Organização por times e grupos" },
    { key: "register" as const, label: "Cadastrar", icon: UserPlus, color: "text-amber-500", bgColor: "bg-amber-50", description: "Adicionar novo funcionário" },
    { key: "audit" as const, label: "Auditoria", icon: ClipboardList, color: "text-rose-500", bgColor: "bg-rose-50", description: "Auditoria do sistema e saúde do banco de dados" },
    { 
      key: "adjustments" as const, 
      label: pendingAdjustmentsCount > 0 ? `Ajustes (${pendingAdjustmentsCount})` : "Ajustes", 
      icon: FileEdit, 
      color: pendingAdjustmentsCount > 0 ? "text-destructive animate-alert-blink font-black" : "text-cyan-600",
      bgColor: "bg-cyan-50",
      description: "Aprovação de correções de ponto"
    },
    { key: "reports" as const, label: "Relatórios", icon: BarChart3, color: "text-orange-500", bgColor: "bg-orange-50", description: "Visualização e exportação de dados" },
    { key: "requests" as const, label: "Solicitações", icon: Inbox, color: "text-pink-500", bgColor: "bg-pink-50", description: "Pedidos de alteração e solicitações" },
    { key: "closing" as const, label: "Fechamento", icon: CalendarCheck, color: "text-indigo-600", bgColor: "bg-indigo-50", description: "Apuração mensal e exportação para folha" },
    { key: "portaria" as const, label: "Portaria 671", icon: Shield, color: "text-slate-600", bgColor: "bg-slate-50", description: "AFD, NSR e integridade dos registros" },
    { key: "absences" as const, label: "Abonos", icon: CalendarCheck, color: "text-lime-600", bgColor: "bg-lime-50", description: "Justificativas de faltas e atestados" },
    { key: "profile" as const, label: "Perfil", icon: UserCog, color: "text-teal-600", bgColor: "bg-teal-50", description: "Configurações da sua conta" },
    { key: "facial" as const, label: "Análise Facial", icon: Scan, color: "text-indigo-500", bgColor: "bg-indigo-50", description: "Revise e valide as imagens faciais dos registros de ponto — todos os funcionários" },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {activeTab !== "menu" && (
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => setActiveTab("menu")}
              className="rounded-full h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="font-bold text-foreground tracking-tight">Administração</h1>
            <p className="text-sm text-muted-foreground">Gestão completa da empresa</p>
          </div>
        </div>
        <Button className="w-full sm:w-auto bg-primary text-primary-foreground rounded-lg" onClick={() => setActiveTab("register")}>
          <UserPlus className="mr-2 h-4 w-4" /> Novo Funcionário
        </Button>
      </div>

      {/* Main Menu Cards */}
      {activeTab === "menu" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tabs.map((tab) => (
            <motion.div
              key={tab.key}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab(tab.key)}
              className="cursor-pointer"
            >
              <Card className="h-full border-none shadow-md hover:shadow-lg transition-all duration-300 bg-card overflow-hidden group">
                <CardContent className="p-0">
                  <div className="flex items-center p-6 gap-4">
                    <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${tab.bgColor} transition-colors group-hover:scale-110 duration-300`}>
                      <tab.icon className={`h-8 w-8 ${tab.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-foreground truncate">{tab.label}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-1">{tab.description}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                  </div>
                  <div className={`h-1.5 w-full bg-gradient-to-r ${tab.color.replace('text-', 'from-').replace('-600', '-500').replace('-500', '-400')} to-transparent opacity-30`} />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Responsive Tabs Navigation (Only visible when not in main menu) */}
      {activeTab !== "menu" && (
        <div className="relative">
          <div className="flex gap-1 rounded-xl bg-muted p-1 overflow-x-auto no-scrollbar scroll-smooth">
            <button
              onClick={() => setActiveTab("menu")}
              className="flex flex-shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-card/50"
            >
              <Building2 className="h-4 w-4" />
              <span>Início</span>
            </button>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-card text-foreground shadow-sm ring-1 ring-black/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                }`}
              >
                <tab.icon className={`h-4 w-4 ${activeTab === tab.key ? tab.color : ""}`} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Company tab */}
      {activeTab === "company" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Dados da Empresa</h2>

          {companyName && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-card-foreground">{companyName}</p>
                    {companyCnpj && (
                      <p className="text-sm text-muted-foreground">
                        CNPJ: {formatCnpj(companyCnpj)}
                      </p>
                    )}
                  </div>
                </div>
                {companyAddress && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{companyAddress}</span>
                  </div>
                )}
                {companyEmail && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span>{companyEmail}</span>
                  </div>
                )}
                {companyPhone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span>{companyPhone}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4 text-primary" />
                {companyName ? "Atualizar Empresa pelo CNPJ" : "Cadastrar Empresa pelo CNPJ"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={cnpjInput}
                  onChange={(e) => setCnpjInput(formatCnpj(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  className="flex-1"
                />
                <Button onClick={handleCnpjSearch} disabled={cnpjLoading}>
                  {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                  {cnpjLoading ? "Buscando..." : "Buscar"}
                </Button>
              </div>

              {cnpjData && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-lg border border-border bg-muted/50 p-4">
                  <h3 className="font-semibold text-foreground">Dados encontrados</h3>
                  <div className="grid gap-2 text-sm">
                    <div><span className="font-medium text-muted-foreground">Razão Social:</span> <span className="text-foreground">{cnpjData.nome}</span></div>
                    {cnpjData.fantasia && <div><span className="font-medium text-muted-foreground">Nome Fantasia:</span> <span className="text-foreground">{cnpjData.fantasia}</span></div>}
                    <div><span className="font-medium text-muted-foreground">CNPJ:</span> <span className="text-foreground">{formatCnpj(cnpjData.cnpj)}</span></div>
                    <div><span className="font-medium text-muted-foreground">Endereço:</span> <span className="text-foreground">{cnpjData.logradouro}, {cnpjData.numero} {cnpjData.complemento} - {cnpjData.bairro}, {cnpjData.municipio}/{cnpjData.uf}</span></div>
                    {cnpjData.telefone && <div><span className="font-medium text-muted-foreground">Telefone:</span> <span className="text-foreground">{cnpjData.telefone}</span></div>}
                    {cnpjData.email && <div><span className="font-medium text-muted-foreground">E-mail:</span> <span className="text-foreground">{cnpjData.email}</span></div>}
                    {cnpjData.socios.length > 0 && (
                      <div className="mt-2">
                        <span className="font-medium text-muted-foreground">Sócios:</span>
                        <ul className="mt-1 space-y-1 pl-4">
                          {cnpjData.socios.map((socio, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-foreground">
                              <Users className="h-3 w-3 text-primary shrink-0" />
                              <span>{socio.nome}</span>
                              {socio.qual && <span className="text-xs text-muted-foreground">({socio.qual})</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <Button onClick={handleSaveCompany} disabled={savingCompany} className="mt-2">
                    {savingCompany ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Building2 className="h-4 w-4 mr-2" />}
                    {companyName ? "Atualizar Empresa" : "Salvar Empresa"}
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Team tab */}
      {activeTab === "team" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Equipes</h2>
            <Button size="sm" onClick={() => setShowNewTeam(true)} className="bg-primary text-primary-foreground">
              <Plus className="mr-1 h-4 w-4" /> Nova Equipe
            </Button>
          </div>

          {showNewTeam && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Input
                  placeholder="Nome da equipe"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTeam()}
                  className="flex-1"
                  autoFocus
                />
                <Button size="sm" onClick={handleCreateTeam} disabled={savingTeam || !newTeamName.trim()}>
                  {savingTeam ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowNewTeam(false); setNewTeamName(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {teams.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((team) => {
                const memberCount = employees.filter((e) => e.team_id === team.id).length;
                const isEditing = editingTeamId === team.id;
                return (
                  <Card key={team.id} className="transition-shadow hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent-foreground">
                            <Users className="h-5 w-5" />
                          </div>
                          {isEditing ? (
                            <div className="flex gap-2 flex-1">
                              <Input
                                value={editTeamName}
                                onChange={(e) => setEditTeamName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleEditTeam(team.id)}
                                className="h-8 text-sm"
                                autoFocus
                              />
                              <Button size="sm" className="h-8" onClick={() => handleEditTeam(team.id)}>OK</Button>
                              <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingTeamId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <p className="text-sm font-semibold text-card-foreground">{team.name}</p>
                              <p className="text-xs text-muted-foreground">{memberCount} membro{memberCount !== 1 ? "s" : ""}</p>
                            </div>
                          )}
                        </div>
                        {!isEditing && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditingTeamId(team.id); setEditTeamName(team.name); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteTeam(team.id, team.name)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <h2 className="text-lg font-semibold text-foreground pt-4">Funcionários</h2>
          <EmployeeManagement
            employees={employees}
            teams={teams}
            onRefresh={() => {
              const fetchData = async () => {
                const [profilesRes, teamsRes] = await Promise.all([
                  supabase.from("profiles").select("user_id, name, email, company_id, team_id, avatar_url, created_at"),
                  supabase.from("teams").select("*").order("name"),
                ]);
                setEmployees(profilesRes.data || []);
                setTeams(teamsRes.data || []);
              };
              fetchData();
            }}
            onEditFullRegister={(emp) => {
              // Load face_template for the employee then switch to register tab
              supabase.from("profiles").select("face_template, phone").eq("user_id", emp.user_id).single().then(({ data }) => {
                setEditingFullEmployee({
                  ...emp,
                  face_template: data?.face_template,
                  phone: data?.phone,
                });
                setActiveTab("register");
              });
            }}
          />
        </motion.div>
      )}

      {/* Audit tab */}
      {activeTab === "audit" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Auditoria — Registros de Acesso</h2>
          <p className="text-sm text-muted-foreground">Informações detalhadas de cada acesso ao sistema</p>

          {/* Audit Logs (system actions) */}
          {auditLogs.length > 0 && (
            <Card className="border-none shadow-sm overflow-hidden bg-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50 bg-muted/20">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Logs de Ações Administrativas
                </CardTitle>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Saúde do BD</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-[94%]" />
                      </div>
                      <span className="text-xs font-black text-emerald-600">94%</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Responsável</TableHead>
                        <TableHead>Ação</TableHead>
                        <TableHead>Detalhes</TableHead>
                        <TableHead>Data/Hora</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log: any) => {
                        const who = adjProfiles[log.user_id] || { name: "Sistema", email: "" };
                        const actionLabels: Record<string, string> = {
                          role_change: "Alteração de perfil",
                          employee_profile_edit: "Edição de funcionário",
                          adjustment_approved: "Ajuste aprovado",
                          adjustment_rejected: "Ajuste rejeitado",
                        };
                        const meta = log.metadata || {};
                        let details = "";
                        if (log.action === "role_change") {
                          const targetName = adjProfiles[meta.target_user]?.name || meta.target_user;
                          details = `${targetName}: ${meta.from || "—"} → ${meta.to || "—"}`;
                        } else if (log.action === "employee_profile_edit") {
                          const targetName = adjProfiles[meta.target_user]?.name || meta.target_user;
                          details = `Editou: ${targetName}`;
                        } else {
                          details = JSON.stringify(meta).slice(0, 80);
                        }
                        return (
                          <TableRow key={log.id}>
                            <TableCell className="font-medium text-foreground whitespace-nowrap">{who.name}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                                {actionLabels[log.action] || log.action}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{details}</TableCell>
                            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                              {new Date(log.created_at).toLocaleDateString("pt-BR")}{" "}
                              {new Date(log.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Time Entries (access records) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Registros de Ponto
              </CardTitle>
            </CardHeader>
            {allTimeEntries.length === 0 ? (
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nenhum registro de acesso encontrado.
              </CardContent>
            ) : (
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Funcionário</TableHead>
                        <TableHead>E-mail</TableHead>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Localização</TableHead>
                        <TableHead>Precisão</TableHead>
                        <TableHead>Foto</TableHead>
                        <TableHead>Confiança</TableHead>
                        <TableHead>Humor</TableHead>
                        <TableHead>Dispositivo</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>Sincronização</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allTimeEntries.map((entry: any) => {
                        const ts = new Date(entry.timestamp);
                        const empInfo = adjProfiles[entry.user_id] || { name: "Desconhecido", email: "" };
                        const faceScore = entry.face_score != null ? `${(entry.face_score * 100).toFixed(0)}%` : "—";
                        const hasLocation = entry.latitude && entry.longitude;
                        const googleMapsUrl = hasLocation
                          ? `https://www.google.com/maps?q=${entry.latitude},${entry.longitude}`
                          : null;
                        const moodEmojis: Record<number, string> = { 1: "😢", 2: "😞", 3: "😐", 4: "🙂", 5: "😄" };
                        const syncLabels: Record<string, { label: string; cls: string }> = {
                          synced: { label: "Sincronizado", cls: "bg-emerald-100 text-emerald-700" },
                          pending: { label: "Pendente", cls: "bg-amber-100 text-amber-700" },
                          failed: { label: "Falhou", cls: "bg-rose-100 text-rose-700" },
                        };
                        const syncInfo = syncLabels[entry.sync_status] || { label: entry.sync_status, cls: "bg-muted text-muted-foreground" };

                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium text-foreground whitespace-nowrap">{empInfo.name}</TableCell>
                            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{empInfo.email || "—"}</TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              {ts.toLocaleDateString("pt-BR")} {ts.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                entry.type === "in" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                              }`}>
                                {entry.type === "in" ? "Entrada" : "Saída"}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {hasLocation ? (
                                <a
                                  href={googleMapsUrl!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  {Number(entry.latitude).toFixed(5)}, {Number(entry.longitude).toFixed(5)}
                                </a>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {entry.accuracy ? `±${Number(entry.accuracy).toFixed(0)}m` : "—"}
                            </TableCell>
                            <TableCell>
                              {entry.face_image_url ? (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <div className="h-8 w-8 cursor-pointer overflow-hidden rounded-md border border-border bg-muted">
                                      <FaceImage src={entry.face_image_url} alt="Face" className="h-full w-full object-cover transition-transform hover:scale-110" />
                                    </div>
                                  </DialogTrigger>
                                  <DialogContent className="max-w-sm">
                                    <DialogHeader>
                                      <DialogTitle>Foto do Registro — {empInfo.name}</DialogTitle>
                                    </DialogHeader>
                                    <div className="aspect-square overflow-hidden rounded-xl border-2 border-primary/20">
                                      <FaceImage src={entry.face_image_url} alt="Face Full" className="h-full w-full object-cover" />
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                      <span>{ts.toLocaleDateString("pt-BR")} às {ts.toLocaleTimeString("pt-BR")}</span>
                                      <StatusBadge status={entry.status} />
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground/30">
                                  <Camera className="h-4 w-4" />
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {entry.face_score != null ? (
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  entry.face_score >= 0.9 ? "bg-emerald-100 text-emerald-700" :
                                  entry.face_score >= 0.7 ? "bg-amber-100 text-amber-700" :
                                  "bg-rose-100 text-rose-700"
                                }`}>
                                  {faceScore}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-center">
                              {entry.mood_score ? (
                                <span title={`Nível ${entry.mood_score}`}>
                                  {moodEmojis[entry.mood_score] || entry.mood_score}
                                </span>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs font-mono whitespace-nowrap">
                              {entry.device_id ? entry.device_id.slice(0, 12) + "…" : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs font-mono whitespace-nowrap">
                              {entry.ip_address || "—"}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${syncInfo.cls}`}>
                                {syncInfo.label}
                              </span>
                            </TableCell>
                             <TableCell>
                              <div className="flex items-center gap-2">
                                <StatusBadge status={entry.status} />
                                {(entry.status === "flagged" || entry.status === "outside_perimeter") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px] border-amber-300 text-amber-700 hover:bg-amber-50"
                                    onClick={() => setValidatingEntryId(entry.id)}
                                  >
                                    Validar
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            )}
          </Card>
        </motion.div>
      )}

      {/* Register tab */}
      {activeTab === "register" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {companyId && companyName ? (
            <EmployeeRegister
              companyId={companyId}
              companyName={companyName}
              editingEmployee={editingFullEmployee}
              onEditDone={() => {
                setEditingFullEmployee(null);
                setActiveTab("employees");
                // Refresh employees
                supabase.from("profiles").select("user_id, name, email, company_id, team_id, avatar_url, created_at, phone").then(({ data }) => {
                  setEmployees(data || []);
                });
              }}
              onSuccess={() => {
                // Refresh employees after new registration
                supabase.from("profiles").select("user_id, name, email, company_id, team_id, avatar_url, created_at, phone").then(({ data }) => {
                  setEmployees(data || []);
                });
              }}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Cadastre uma empresa primeiro na aba <strong>Empresa</strong> para poder registrar funcionários.
                </p>
                <Button onClick={() => setActiveTab("company")} className="mt-2">
                  <Building2 className="h-4 w-4 mr-2" /> Ir para Empresa
                </Button>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* Adjustments tab */}
      {activeTab === "adjustments" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Solicitações de Ajuste de Ponto</h2>
          <p className="text-sm text-muted-foreground">
            Pendentes aparecem primeiro, do mais antigo para o mais novo. Os destacados aguardam há 15 dias ou mais.
          </p>
          {pendingAdjustments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma solicitação de ajuste.
              </CardContent>
            </Card>
          ) : (
            sortedAdjustments.map((adj) => {
              const daysWaiting = adj.status === "pending" ? daysSince(adj.created_at) : 0;
              const isOverdue = adj.status === "pending" && daysWaiting >= 15;
              const stepLabels: Record<string, string> = {
                entrada: "Entrada",
                saida_almoco: "Saída Almoço",
                retorno_almoco: "Retorno Almoço",
                saida: "Saída",
              };
              const statusColors: Record<string, string> = {
                pending: "text-amber-600 bg-amber-100",
                approved: "text-emerald-700 bg-emerald-100",
                rejected: "text-rose-700 bg-rose-100",
              };
              const handleApprove = async () => {
                const { error } = await supabase
                  .from("adjustments")
                  .update({ status: "approved", approved_by: user!.id })
                  .eq("id", adj.id);
                if (error) {
                  toast.error("Erro ao aprovar: " + error.message);
                } else {
                  const dateStr = adj.date;
                  const timeStr = adj.proposed_time || "08:00:00";
                  const timestamp = `${dateStr}T${timeStr}`;
                  const punchType = adj.punch_step === "entrada" || adj.punch_step === "retorno_almoco" ? "in" : "out";
                  await supabase.from("time_entries").insert({
                    user_id: adj.user_id,
                    company_id: adj.company_id,
                    type: punchType as "in" | "out",
                    timestamp,
                    status: "verified",
                    sync_status: "synced",
                  });
                  setPendingAdjustments((prev) =>
                    prev.map((a) => (a.id === adj.id ? { ...a, status: "approved" } : a))
                  );
                  // Auditoria: registra quem aprovou e o snapshot do ajuste.
                  await supabase.from("audit_logs").insert({
                    user_id: user!.id,
                    company_id: adj.company_id,
                    action: "adjustment_approved",
                    metadata: {
                      adjustment_id: adj.id,
                      target_user_id: adj.user_id,
                      date: adj.date,
                      punch_step: adj.punch_step,
                      proposed_time: adj.proposed_time,
                    },
                    snapshot_before: { status: "pending" },
                    snapshot_after: { status: "approved", approved_by: user!.id },
                  });
                  toast.success("Ajuste aprovado e ponto registrado!");
                }
              };
              const handleReject = () => {
                setRejectingAdjId(adj.id);
                setRejectionReason("");
              };

              return (
                <Card key={adj.id} className={isOverdue ? "border-amber-300" : undefined}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {(adjProfiles[adj.user_id]?.name || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-card-foreground">{adjProfiles[adj.user_id]?.name || "Desconhecido"}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(adj.date).toLocaleDateString("pt-BR")} — {stepLabels[adj.punch_step] || adj.punch_step} às {adj.proposed_time?.slice(0, 5) || "—"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">Motivo: {adj.reason}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[adj.status] || ""}`}>
                          {adj.status === "pending" ? "Pendente" : adj.status === "approved" ? "Aprovado" : "Rejeitado"}
                        </span>
                        {isOverdue && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200"
                            title={`Solicitação enviada em ${new Date(adj.created_at).toLocaleDateString("pt-BR")}`}
                          >
                            <Clock className="h-3 w-3" /> Aguardando há {daysWaiting} dias
                          </span>
                        )}
                        {adj.status === "pending" && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50" onClick={handleApprove}>
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                            </Button>
                            <Button size="sm" variant="outline" className="text-rose-600 border-rose-300 hover:bg-rose-50" onClick={handleReject}>
                              <XCircle className="h-4 w-4 mr-1" /> Rejeitar
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </motion.div>
      )}

      {/* Reports tab */}
      {activeTab === "reports" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <EmployeeReport companyId={companyId} companyName={companyName} companyCnpj={companyCnpj} />
        </motion.div>
      )}

      {/* Registration Requests tab */}
      {activeTab === "requests" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <RegistrationRequests />
        </motion.div>
      )}

      {/* Profile tab */}
      {activeTab === "profile" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <Profile />
          </Suspense>
        </motion.div>
      )}

      {/* Face Analysis tab */}
      {activeTab === "facial" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <FaceAnalysis />
          </Suspense>
        </motion.div>
      )}

      {/* Employees tab */}
      {activeTab === "employees" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <EmployeeCards
            employees={employees}
            teams={teams}
            onUpdate={async () => {
              const { data: profilesRes } = await supabase.from("profiles").select("user_id, name, email, company_id, team_id, avatar_url, created_at, phone");
              setEmployees(profilesRes || []);
            }}
          />
        </motion.div>
      )}
      {/* Absences tab */}
      {activeTab === "absences" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <AbsenceManagement companyId={companyId} employees={employees} />
        </motion.div>
      )}
      {activeTab === "closing" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <MonthlyClosingPanel companyId={companyId} employees={employees} />
        </motion.div>
      )}
      {activeTab === "portaria" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Portaria671Panel companyId={companyId} companyName={companyName} companyCnpj={companyCnpj} employees={employees} />
        </motion.div>
      )}
      {/* Rejection Reason Dialog */}
      <Dialog open={!!rejectingAdjId} onOpenChange={(open) => { if (!open) setRejectingAdjId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo da Rejeição</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Informe o motivo da rejeição do ajuste..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingAdjId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!rejectionReason.trim()}
              onClick={async () => {
                if (!rejectingAdjId) return;
                const { error } = await supabase
                  .from("adjustments")
                  .update({
                    status: "rejected" as const,
                    approved_by: user!.id,
                    rejection_reason: rejectionReason.trim(),
                  })
                  .eq("id", rejectingAdjId);
                if (error) {
                  toast.error("Erro ao rejeitar: " + error.message);
                } else {
                  setPendingAdjustments((prev) =>
                    prev.map((a) => (a.id === rejectingAdjId ? { ...a, status: "rejected" } : a))
                  );
                  // Auditoria: registra rejeição com o motivo informado pelo gestor.
                  const rejected = pendingAdjustments.find((a) => a.id === rejectingAdjId);
                  await supabase.from("audit_logs").insert({
                    user_id: user!.id,
                    company_id: rejected?.company_id ?? null,
                    action: "adjustment_rejected",
                    metadata: {
                      adjustment_id: rejectingAdjId,
                      target_user_id: rejected?.user_id,
                      rejection_reason: rejectionReason.trim(),
                    },
                    snapshot_before: { status: "pending" },
                    snapshot_after: {
                      status: "rejected",
                      approved_by: user!.id,
                      rejection_reason: rejectionReason.trim(),
                    },
                  });
                  toast.success("Ajuste rejeitado.");
                }
                setRejectingAdjId(null);
                setRejectionReason("");
              }}
            >
              Confirmar Rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Validation Dialog for Irregularities */}
      <Dialog open={!!validatingEntryId} onOpenChange={(open) => !open && setValidatingEntryId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Validar Irregularidade</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Este registro foi marcado como irregular pelo sistema. Deseja validar este acesso e marcá-lo como verificado?
            </p>
            {allTimeEntries.find(e => e.id === validatingEntryId) && (
                <div className="rounded-lg bg-muted p-4 text-sm space-y-2 border-l-4 border-amber-500">
                  <p><strong>Funcionário:</strong> {adjProfiles[allTimeEntries.find(e => e.id === validatingEntryId).user_id]?.name}</p>
                  <p><strong>Data/Hora:</strong> {new Date(allTimeEntries.find(e => e.id === validatingEntryId).timestamp).toLocaleString("pt-BR")}</p>
                  <p><strong>Tipo:</strong> {allTimeEntries.find(e => e.id === validatingEntryId).type === "in" ? "Entrada" : "Saída"}</p>
                  <div className="pt-2 border-t border-muted-foreground/20">
                    <p className="text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1.5">
                      Status Atual: {allTimeEntries.find(e => e.id === validatingEntryId).status === "flagged" ? "Sinalizado (Falha Facial)" : "Fora do Perímetro"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                      {allTimeEntries.find(e => e.id === validatingEntryId).status === "flagged" 
                        ? "O sistema não conseguiu confirmar a identidade do funcionário através do foto com verificação de enquadramento no momento da batida."
                        : "O funcionário registrou o ponto fora da área permitida (geocerca) configurada para o local de trabalho."}
                    </p>
                  </div>
                </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setValidatingEntryId(null)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => setValidatingEntryId(null)}
              className="flex-1"
            >
              Manter Irregular
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => validatingEntryId && handleValidateTimeEntry(validatingEntryId, "verified")}
            >
              Aprovar / Validar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
