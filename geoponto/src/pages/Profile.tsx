import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import StatusBadge from "@/components/StatusBadge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { User, CalendarDays, Clock, Loader2, Shield, Save } from "lucide-react";
import { toast } from "sonner";

interface TimeEntry {
  id: string;
  timestamp: string;
  type: "in" | "out";
  status: "verified" | "outside_perimeter" | "flagged" | "pending";
  latitude: number | null;
  longitude: number | null;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gestor",
  employee: "Funcionário",
};

const Profile = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  // Admin: employee selector & role management
  const [isAdmin, setIsAdmin] = useState(false);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [currentRole, setCurrentRole] = useState<string>("");
  const [savingRole, setSavingRole] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      const [profileRes, entriesRes, roleRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).single(),
        supabase.from("time_entries").select("*").eq("user_id", user.id).order("timestamp", { ascending: false }),
        supabase.from("user_roles").select("role").eq("user_id", user.id).single(),
      ]);

      setProfile(profileRes.data);
      setEntries((entriesRes.data as TimeEntry[]) || []);

      const userRole = roleRes.data?.role;
      const admin = ["owner", "admin"].includes(userRole || "");
      setIsAdmin(admin);

      if (admin && profileRes.data?.company_id) {
        const { data: emps } = await supabase
          .from("profiles")
          .select("user_id, name, email")
          .eq("company_id", profileRes.data.company_id);
        setAllEmployees(emps || []);
      }

      setLoading(false);
    };

    fetchData();
  }, [user]);

  // When an employee is selected, fetch their role
  useEffect(() => {
    if (!selectedEmployeeId) {
      setCurrentRole("");
      setSelectedRole("");
      return;
    }
    const fetchRole = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", selectedEmployeeId)
        .single();
      const role = data?.role || "employee";
      setCurrentRole(role);
      setSelectedRole(role);
    };
    fetchRole();
  }, [selectedEmployeeId]);

  const handleSaveRole = async () => {
    if (!selectedEmployeeId || !selectedRole || selectedRole === currentRole) return;
    setSavingRole(true);
    try {
      await supabase.from("user_roles").delete().eq("user_id", selectedEmployeeId);
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: selectedEmployeeId, role: selectedRole as any });
      if (error) throw error;

      await supabase.from("audit_logs").insert({
        user_id: user!.id,
        action: "role_change",
        metadata: {
          target_user: selectedEmployeeId,
          from: currentRole,
          to: selectedRole,
        },
      });

      setCurrentRole(selectedRole);
      toast.success(`Perfil atualizado para ${ROLE_LABELS[selectedRole]}!`);
    } catch (err: any) {
      toast.error("Erro ao alterar perfil: " + err.message);
    } finally {
      setSavingRole(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Group entries by date
  const entriesByDate = entries.reduce<Record<string, TimeEntry[]>>((acc, entry) => {
    const dateKey = format(new Date(entry.timestamp), "yyyy-MM-dd");
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {});

  const datesWithEntries = Object.keys(entriesByDate).map((d) => new Date(d + "T12:00:00"));
  const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const selectedEntries = selectedDateKey ? (entriesByDate[selectedDateKey] || []) : [];

  const typeLabels: Record<string, string> = { in: "Entrada", out: "Saída" };
  const stepLabels = ["Entrada", "Saída Almoço", "Retorno Almoço", "Saída"];

  const selectedEmpName = allEmployees.find((e) => e.user_id === selectedEmployeeId)?.name;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Dados Pessoais - uses registration photo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-primary" />
            Dados Pessoais
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="relative">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="h-24 w-24 rounded-full object-cover border-2 border-primary/20" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                {(profile?.name || "?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
              </div>
            )}
          </div>
          <div className="text-center sm:text-left">
            <h1 className="text-xl font-bold text-foreground">{profile?.name || "Funcionário"}</h1>
            <p className="text-sm text-muted-foreground">{profile?.email || user?.email}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Total de registros: {entries.length} • Dias trabalhados: {Object.keys(entriesByDate).length}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Admin: Gerenciar Perfil de Funcionário */}
      {isAdmin && allEmployees.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" />
              Gerenciar Perfil de Funcionário
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-muted-foreground">Funcionário</label>
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o funcionário" />
                  </SelectTrigger>
                  <SelectContent>
                    {allEmployees.map((emp) => (
                      <SelectItem key={emp.user_id} value={emp.user_id}>
                        {emp.name || emp.email || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedEmployeeId && (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">Perfil / Cargo</label>
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">Funcionário (bater ponto)</SelectItem>
                        <SelectItem value="manager">Gestor (todas as permissões)</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="owner">Proprietário</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      onClick={handleSaveRole}
                      disabled={savingRole || !selectedRole}
                      className="w-full sm:w-auto"
                    >
                      {savingRole ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Salvar Perfil
                    </Button>
                  </div>
                </>
              )}
            </div>

            {selectedEmployeeId && currentRole && (
              <p className="text-xs text-muted-foreground">
                Perfil atual de <span className="font-semibold text-foreground">{selectedEmpName}</span>:{" "}
                <span className="font-semibold text-primary">{ROLE_LABELS[currentRole]}</span>
                {selectedRole !== currentRole && (
                  <span className="text-accent"> → {ROLE_LABELS[selectedRole]}</span>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Calendar + Day Entries in larger format */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-primary" />
            Calendário de Pontos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={ptBR}
                className={cn("p-4 pointer-events-auto rounded-lg border")}
                modifiers={{ hasEntry: datesWithEntries }}
                modifiersClassNames={{ hasEntry: "bg-primary/20 text-primary font-bold rounded-md" }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                {selectedDate
                  ? format(selectedDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                  : "Selecione uma data"}
              </h3>

              {selectedEntries.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum registro nesta data.</p>
              ) : (
                <div className="space-y-3">
                  {selectedEntries
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    .map((entry, idx) => (
                      <Card key={entry.id} className="border">
                        <CardContent className="flex items-center justify-between p-4">
                          <div className="flex items-center gap-3">
                            <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold", entry.type === "in" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600")}>
                              {entry.type === "in" ? "E" : "S"}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {stepLabels[idx] || typeLabels[entry.type] || entry.type}
                              </p>
                              <p className="text-xs text-muted-foreground">{format(new Date(entry.timestamp), "HH:mm:ss")}</p>
                            </div>
                          </div>
                          <StatusBadge status={entry.status} />
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Profile;
