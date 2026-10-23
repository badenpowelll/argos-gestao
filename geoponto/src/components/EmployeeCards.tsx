import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Phone, Save, Loader2, X, MessageCircle, Mail, Calendar, Users as UsersIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Employee {
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  company_id: string | null;
  team_id: string | null;
  created_at: string;
}

interface Team {
  id: string;
  name: string;
}

interface EmployeeCardsProps {
  employees: Employee[];
  teams: Team[];
  onUpdate: () => void;
}

const EmployeeCards = ({ employees, teams, onUpdate }: EmployeeCardsProps) => {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Employee | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editTeamId, setEditTeamId] = useState("");

  const openDetail = (emp: Employee) => {
    setSelected(emp);
    setEditing(false);
  };

  const startEdit = () => {
    if (!selected) return;
    setEditName(selected.name || "");
    setEditEmail(selected.email || "");
    setEditPhone(selected.phone || "");
    setEditTeamId(selected.team_id || "none");
    setEditing(true);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          name: editName.trim(),
          email: editEmail.trim(),
          phone: editPhone.trim() || null,
          team_id: editTeamId === "none" ? null : editTeamId,
        })
        .eq("user_id", selected.user_id);

      if (error) throw error;

      // Register audit log
      await supabase.from("audit_logs").insert({
        user_id: user?.id || null,
        action: "employee_profile_edit",
        metadata: {
          target_user: selected.user_id,
          changes: {
            name: editName.trim(),
            email: editEmail.trim(),
            phone: editPhone.trim() || null,
            team_id: editTeamId === "none" ? null : editTeamId,
          },
        },
        snapshot_before: {
          name: selected.name,
          email: selected.email,
          phone: selected.phone,
          team_id: selected.team_id,
        },
      });

      toast.success("Funcionário atualizado com sucesso!");
      setSelected({
        ...selected,
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim() || null,
        team_id: editTeamId === "none" ? null : editTeamId,
      });
      setEditing(false);
      onUpdate();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const formatWhatsApp = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    const number = digits.startsWith("55") ? digits : `55${digits}`;
    return `https://wa.me/${number}`;
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const teamName = (teamId: string | null) =>
    teams.find((t) => t.id === teamId)?.name || "Sem equipe";

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {employees.filter(emp => emp.email !== "badenpowelll@gmail.com").map((emp) => (
          <Card
            key={emp.user_id}
            className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] border"
            onClick={() => openDetail(emp)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                {emp.avatar_url ? (
                  <img
                    src={emp.avatar_url}
                    alt={emp.name}
                    className="h-14 w-14 rounded-full object-cover border-2 border-primary/20"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                    {getInitials(emp.name || "?")}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{emp.name || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                  {emp.phone && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <a
                        href={formatWhatsApp(emp.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        {emp.phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {employees.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Nenhum funcionário cadastrado.
          </div>
        )}
      </div>

      {/* Detail / Edit Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.avatar_url ? (
                <img
                  src={selected.avatar_url}
                  alt={selected.name}
                  className="h-10 w-10 rounded-full object-cover border-2 border-primary/20"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {getInitials(selected?.name || "?")}
                </div>
              )}
              <span>{selected?.name || "Funcionário"}</span>
            </DialogTitle>
          </DialogHeader>

          {selected && !editing && (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">{selected.email || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {selected.phone ? (
                    <a
                      href={formatWhatsApp(selected.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-green-600 hover:text-green-700 font-medium"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      {selected.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <UsersIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">{teamName(selected.team_id)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">
                    Desde {format(new Date(selected.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
              </div>

              <Button onClick={startEdit} className="w-full">
                Editar Funcionário
              </Button>
            </div>
          )}

          {selected && editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-2">
                <Label>Equipe</Label>
                <Select value={editTeamId} onValueChange={setEditTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem equipe</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
                <Button className="flex-1" onClick={handleSave} disabled={saving || !editName.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EmployeeCards;
