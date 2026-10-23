import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Search,
  Users,
  UserCog,
  Mail,
  Shield,
  Filter,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  UserX,
  Eye,
  FileEdit,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";

interface Employee {
  user_id: string;
  name: string;
  email: string | null;
  company_id: string | null;
  team_id: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface Team {
  id: string;
  name: string;
}

interface UserRole {
  user_id: string;
  role: "owner" | "admin" | "manager" | "employee";
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gestor",
  employee: "Funcionário",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  manager: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  employee: "bg-muted text-muted-foreground",
};

interface EmployeeManagementProps {
  employees: Employee[];
  teams: Team[];
  onRefresh: () => void;
  onEditFullRegister?: (employee: Employee) => void;
}

const EmployeeManagement = ({ employees, teams, onRefresh, onEditFullRegister }: EmployeeManagementProps) => {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [filterTeam, setFilterTeam] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit dialog
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editTeam, setEditTeam] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // Detail dialog
  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    const { data } = await supabase.from("user_roles").select("user_id, role");
    if (data) setRoles(data as UserRole[]);
  };

  const getRole = (userId: string) => {
    const r = roles.find((r) => r.user_id === userId);
    return r?.role || "employee";
  };

  const getTeamName = (teamId: string | null) => {
    if (!teamId) return "Sem equipe";
    const team = teams.find((t) => t.id === teamId);
    return team?.name || "—";
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const filtered = employees.filter((emp) => {
    const matchSearch =
      !search ||
      emp.name?.toLowerCase().includes(search.toLowerCase()) ||
      emp.email?.toLowerCase().includes(search.toLowerCase());
    const matchTeam = filterTeam === "all" || emp.team_id === filterTeam || (filterTeam === "none" && !emp.team_id);
    const matchRole = filterRole === "all" || getRole(emp.user_id) === filterRole;
    const isMasterAdmin = emp.email === "badenpowelll@gmail.com";
    return matchSearch && matchTeam && matchRole && !isMasterAdmin;
  });

  const openEdit = (emp: Employee) => {
    setEditEmployee(emp);
    setEditName(emp.name || "");
    setEditEmail(emp.email || "");
    setEditPhone("");
    setEditTeam(emp.team_id || "none");
    setEditRole(getRole(emp.user_id));
    setEditPassword("");
    // Fetch phone
    supabase.from("profiles").select("phone").eq("user_id", emp.user_id).single().then(({ data }) => {
      if (data?.phone) setEditPhone(data.phone);
    });
  };

  const handleSaveEdit = async () => {
    if (!editEmployee) return;
    setSaving(true);

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          name: editName,
          email: editEmail || null,
          phone: editPhone || null,
          team_id: editTeam === "none" ? null : editTeam,
        })
        .eq("user_id", editEmployee.user_id);

      if (profileError) throw profileError;

      // Update role
      const currentRole = getRole(editEmployee.user_id);
      if (editRole !== currentRole) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .update({ role: editRole as "owner" | "admin" | "manager" | "employee" })
          .eq("user_id", editEmployee.user_id);
        if (roleError) throw roleError;

        // Log audit
        await supabase.from("audit_logs").insert({
          user_id: user!.id,
          action: "role_change",
          metadata: {
            target_user: editEmployee.user_id,
            from: currentRole,
            to: editRole,
          },
        });
      }

      // Update auth user (email/password) via edge function
      const needsAuthUpdate = (editEmail && editEmail !== editEmployee.email) || (editPassword && editPassword.length >= 6);
      if (needsAuthUpdate) {
        const { data: { session } } = await supabase.auth.getSession();
        const payload: Record<string, string> = { target_user_id: editEmployee.user_id };
        if (editEmail && editEmail !== editEmployee.email) payload.email = editEmail;
        if (editPassword && editPassword.length >= 6) payload.password = editPassword;

        const res = await supabase.functions.invoke("admin-update-user", { body: payload });
        if (res.error) throw new Error(res.error.message || "Erro ao atualizar credenciais");
      }

      toast.success("Funcionário atualizado com sucesso!");
      setEditEmployee(null);
      fetchRoles();
      onRefresh();
    } catch (err: any) {
      toast.error("Erro ao atualizar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFromCompany = async (emp: Employee) => {
    if (!confirm(`Deseja realmente remover ${emp.name || emp.email} da empresa?`)) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ company_id: null, team_id: null })
        .eq("user_id", emp.user_id);

      if (error) throw error;

      await supabase.from("audit_logs").insert({
        user_id: user!.id,
        action: "employee_removed",
        metadata: { target_user: emp.user_id, name: emp.name },
      });

      toast.success("Funcionário removido da empresa.");
      onRefresh();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const visibleEmployees = employees.filter((e) => e.email !== "badenpowelll@gmail.com");
  const stats = {
    total: visibleEmployees.length,
    admins: visibleEmployees.filter((e) => ["owner", "admin"].includes(getRole(e.user_id))).length,
    managers: visibleEmployees.filter((e) => getRole(e.user_id) === "manager").length,
    employees: visibleEmployees.filter((e) => getRole(e.user_id) === "employee").length,
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.admins}</p>
              <p className="text-xs text-muted-foreground">Admins</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <UserCog className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.managers}</p>
              <p className="text-xs text-muted-foreground">Gestores</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.employees}</p>
              <p className="text-xs text-muted-foreground">Funcionários</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="w-[160px]">
                <Filter className="mr-1 h-3.5 w-3.5" />
                <SelectValue placeholder="Equipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas equipes</SelectItem>
                <SelectItem value="none">Sem equipe</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[160px]">
                <Shield className="mr-1 h-3.5 w-3.5" />
                <SelectValue placeholder="Cargo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos cargos</SelectItem>
                <SelectItem value="owner">Proprietário</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="manager">Gestor</SelectItem>
                <SelectItem value="employee">Funcionário</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Employee Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {search || filterTeam !== "all" || filterRole !== "all"
                ? "Nenhum funcionário encontrado com os filtros aplicados."
                : "Nenhum funcionário cadastrado."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead className="hidden sm:table-cell">E-mail</TableHead>
                    <TableHead className="hidden md:table-cell">Equipe</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((emp) => {
                    const role = getRole(emp.user_id);
                    return (
                      <TableRow key={emp.user_id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {emp.avatar_url ? (
                                <img
                                  src={emp.avatar_url}
                                  alt={emp.name}
                                  className="h-full w-full rounded-full object-cover"
                                />
                              ) : (
                                getInitials(emp.name || "?")
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{emp.name || "Sem nome"}</p>
                              <p className="text-xs text-muted-foreground sm:hidden">{emp.email || "—"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-sm text-muted-foreground">{emp.email || "—"}</span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-sm text-muted-foreground">{getTeamName(emp.team_id)}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[role]}`}>
                            {ROLE_LABELS[role]}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setViewEmployee(emp)}>
                                <Eye className="mr-2 h-4 w-4" /> Ver detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(emp)}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar rápido
                              </DropdownMenuItem>
                              {onEditFullRegister && (
                                <DropdownMenuItem onClick={() => onEditFullRegister(emp)}>
                                  <FileEdit className="mr-2 h-4 w-4" /> Editar cadastro completo
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleRemoveFromCompany(emp)}
                                className="text-destructive focus:text-destructive"
                              >
                                <UserX className="mr-2 h-4 w-4" /> Remover da empresa
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Mostrando {filtered.length} de {employees.length} funcionário{employees.length !== 1 ? "s" : ""}
      </p>

      {/* Edit Dialog */}
      <Dialog open={!!editEmployee} onOpenChange={(open) => !open && setEditEmployee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Funcionário</DialogTitle>
            <DialogDescription>Altere os dados do funcionário abaixo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div className="space-y-2">
              <Label>Equipe</Label>
              <Select value={editTeam} onValueChange={setEditTeam}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem equipe</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Funcionário</SelectItem>
                  <SelectItem value="manager">Gestor</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="owner">Proprietário</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nova Senha de Acesso</Label>
              <Input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres (deixe vazio para manter)"
                minLength={6}
              />
              <p className="text-xs text-muted-foreground">Deixe em branco para não alterar a senha atual.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEmployee(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewEmployee} onOpenChange={(open) => !open && setViewEmployee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes do Funcionário</DialogTitle>
          </DialogHeader>
          {viewEmployee && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                  {viewEmployee.avatar_url ? (
                    <img src={viewEmployee.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    getInitials(viewEmployee.name || "?")
                  )}
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">{viewEmployee.name || "Sem nome"}</p>
                  <p className="text-sm text-muted-foreground">{viewEmployee.email || "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Cargo</p>
                  <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[getRole(viewEmployee.user_id)]}`}>
                    {ROLE_LABELS[getRole(viewEmployee.user_id)]}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Equipe</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{getTeamName(viewEmployee.team_id)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cadastrado em</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {new Date(viewEmployee.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setViewEmployee(null); openEdit(viewEmployee); }}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default EmployeeManagement;
