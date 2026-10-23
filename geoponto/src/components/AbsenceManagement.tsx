import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, CalendarCheck, Users, Pencil } from "lucide-react";

interface AbsenceJustification {
  id: string;
  user_id: string;
  company_id: string | null;
  date: string;
  type: string;
  description: string;
  created_by: string | null;
  created_at: string;
}

interface Props {
  companyId: string | null;
  employees: { user_id: string; name: string }[];
}

const typeLabels: Record<string, string> = {
  folga: "Folga",
  feriado_nacional: "Feriado Nacional",
  feriado_estadual: "Feriado Estadual",
  feriado_municipal: "Feriado Municipal",
};

const typeColors: Record<string, string> = {
  folga: "bg-blue-100 text-blue-700",
  feriado_nacional: "bg-emerald-100 text-emerald-700",
  feriado_estadual: "bg-amber-100 text-amber-700",
  feriado_municipal: "bg-violet-100 text-violet-700",
};

const AbsenceManagement = ({ companyId, employees }: Props) => {
  const { user } = useAuth();
  const [justifications, setJustifications] = useState<AbsenceJustification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [applyToAll, setApplyToAll] = useState(false);
  const [date, setDate] = useState("");
  const [type, setType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchJustifications = async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("absence_justifications")
      .select("*")
      .eq("company_id", companyId)
      .order("date", { ascending: false });
    setJustifications((data as AbsenceJustification[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchJustifications();
  }, [companyId]);

  const profileMap = Object.fromEntries(employees.map((e) => [e.user_id, e.name]));

  const resetForm = () => {
    setSelectedUsers([]);
    setApplyToAll(false);
    setDate("");
    setType("");
    setDescription("");
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!date || !type) {
      toast.error("Preencha a data e o tipo.");
      return;
    }
    
    // Se não for edição e "Aplicar a todos" estiver OFF, valida seleção manual
    const targetUsers = applyToAll ? employees.map((e) => e.user_id) : selectedUsers;
    if (!editingId && targetUsers.length === 0) {
      toast.error("Selecione pelo menos um funcionário.");
      return;
    }
    
    // Se for edição, o usuário alvo é o que está no estado selectedUsers[0]
    if (editingId && selectedUsers.length === 0) {
      toast.error("Selecione um funcionário para este abono.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        // Update single record
        const { error } = await supabase
          .from("absence_justifications")
          .update({
            date,
            type: type as any,
            description,
            user_id: selectedUsers[0], // Usa o usuário selecionado na edição
          })
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Abono atualizado!");
      } else {
        // Insert for each user
        const records = targetUsers.map((uid) => ({
          user_id: uid,
          company_id: companyId!,
          date,
          type: type as any,
          description,
          created_by: user!.id,
        }));
        const { error } = await supabase.from("absence_justifications").insert(records);
        if (error) throw error;
        toast.success(`Abono registrado para ${targetUsers.length} funcionário(s)!`);
      }
      setShowDialog(false);
      resetForm();
      fetchJustifications();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja excluir este abono?")) return;
    const { error } = await supabase.from("absence_justifications").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir: " + error.message);
    } else {
      setJustifications((prev) => prev.filter((j) => j.id !== id));
      toast.success("Abono excluído!");
    }
  };

  const handleEdit = (j: AbsenceJustification) => {
    setEditingId(j.id);
    setDate(j.date);
    setType(j.type);
    setDescription(j.description);
    setSelectedUsers([j.user_id]);
    setApplyToAll(false);
    setShowDialog(true);
  };

  const toggleUser = (uid: string) => {
    setSelectedUsers((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Abono de Faltas</h2>
          <p className="text-sm text-muted-foreground">Folgas e feriados nacionais, estaduais e municipais</p>
        </div>
        <Button
          onClick={() => { resetForm(); setShowDialog(true); }}
          className="bg-primary text-primary-foreground"
        >
          <Plus className="mr-2 h-4 w-4" /> Novo Abono
        </Button>
      </div>

      {justifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarCheck className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum abono registrado.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {justifications.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-medium text-foreground whitespace-nowrap">
                        {profileMap[j.user_id] || "Desconhecido"}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {new Date(j.date + "T12:00:00").toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${typeColors[j.type] || "bg-muted text-muted-foreground"}`}>
                          {typeLabels[j.type] || j.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                        {j.description || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(j.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleEdit(j)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(j.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog for create/edit */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { setShowDialog(false); resetForm(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Abono" : "Novo Abono de Falta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Data</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Tipo</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="folga">Folga</SelectItem>
                  <SelectItem value="feriado_nacional">Feriado Nacional</SelectItem>
                  <SelectItem value="feriado_estadual">Feriado Estadual</SelectItem>
                  <SelectItem value="feriado_municipal">Feriado Municipal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Dia da Consciência Negra, Folga compensatória..."
                rows={2}
              />
            </div>

            {!editingId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">Funcionários</label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyToAll}
                      onChange={(e) => {
                        setApplyToAll(e.target.checked);
                        if (e.target.checked) setSelectedUsers(employees.map((emp) => emp.user_id));
                        else setSelectedUsers([]);
                      }}
                      className="rounded"
                    />
                    Todos
                  </label>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2 space-y-1">
                  {employees.map((emp) => (
                    <label
                      key={emp.user_id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(emp.user_id)}
                        onChange={() => toggleUser(emp.user_id)}
                        className="rounded"
                      />
                      {emp.name || "Sem nome"}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {editingId && (
              <div>
                <label className="text-sm font-medium text-foreground">Funcionário</label>
                <Select value={selectedUsers[0] || ""} onValueChange={(v) => setSelectedUsers([v])}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.user_id} value={emp.user_id}>
                        {emp.name || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingId ? "Salvar" : "Registrar Abono"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AbsenceManagement;
