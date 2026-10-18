import {useState} from 'react';
import {Button, DataTable, Dialog, Input, Select, useToast} from '../ds';
import {api} from '../api';
import {useAuth} from '../auth';
import {dateBR} from '../format';
import {ConfirmDialog, ErrorNote, Money, MoneyInput, PageHeader, useLoad} from '../ui';

interface Expense {id: string; category: string; description: string; amount_cents: number; competence: string; system_name: string | null; client_name: string | null}

export function ExpensesPage() {
  const {can} = useAuth();
  const {toast} = useToast();
  const {data, error, loading, reload} = useLoad(() => api.get<Expense[]>('/expenses'), []);
  const systems = useLoad(() => api.get<{id: string; name: string}[]>('/systems'), []);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [f, setF] = useState({category: 'Hospedagem', description: '', competence: new Date().toISOString().slice(0, 10), system_id: ''});
  const [amount, setAmount] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const finance = can('admin', 'financeiro');
  return (
    <div className="stack-lg">
      <PageHeader title="Despesas" subtitle="Custos que entram no resultado do painel" actions={finance && <Button onClick={() => setOpen(true)}>Nova despesa</Button>} />
      <ErrorNote error={error} />
      <DataTable<Expense> caption="Despesas" loading={loading} rows={data ?? []} getRowKey={(r) => r.id} emptyTitle="Nenhuma despesa registrada"
        columns={[{key: 'competence', header: 'Competência', render: (r) => dateBR(r.competence)}, {key: 'category', header: 'Categoria'}, {key: 'description', header: 'Descrição'},
          {key: 'system_name', header: 'Sistema', render: (r) => r.system_name ?? '—'}, {key: 'amount_cents', header: 'Valor', render: (r) => <Money cents={r.amount_cents} />},
          {key: 'x', header: '', render: (r) => (finance ? <Button size="sm" variant="outline" onClick={() => setDel(r.id)}>Excluir</Button> : null)}]} />
      <Dialog open={open} onClose={() => setOpen(false)} title="Nova despesa">
        <form className="dialog-body" onSubmit={async (e) => {
          e.preventDefault();
          try { await api.post('/expenses', {...f, system_id: f.system_id || null, amount_cents: amount}); toast({title: 'Despesa registrada', tone: 'success'}); setOpen(false); setAmount(null); setF({...f, description: ''}); reload(); } catch (x) { setErr((x as Error).message); }
        }}>
          <div className="form-grid">
            <Input label="Categoria" required value={f.category} onChange={(e) => setF({...f, category: e.target.value})} />
            <Input label="Descrição" required value={f.description} onChange={(e) => setF({...f, description: e.target.value})} />
            <MoneyInput label="Valor" required value={amount} onChange={setAmount} />
            <Input label="Competência" type="date" required value={f.competence} onChange={(e) => setF({...f, competence: e.target.value})} />
            <Select label="Sistema (opcional)" value={f.system_id} placeholder="(geral)" onChange={(e) => setF({...f, system_id: e.target.value})} options={(systems.data ?? []).map((s) => ({value: s.id, label: s.name}))} />
          </div>
          <p className="muted" style={{fontSize: '.85rem'}}>Não registre aqui a hospedagem já informada como “custo operacional mensal” do sistema, para não contar duas vezes.</p>
          <ErrorNote error={err} />
          <div className="dialog-actions"><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={!amount}>Salvar</Button></div>
        </form>
      </Dialog>
      <ConfirmDialog open={!!del} danger title="Excluir despesa" confirmLabel="Excluir" onClose={() => setDel(null)} onConfirm={async () => { await api.del(`/expenses/${del}`); setDel(null); reload(); }}>
        <p>A exclusão fica registrada na auditoria.</p>
      </ConfirmDialog>
    </div>
  );
}
