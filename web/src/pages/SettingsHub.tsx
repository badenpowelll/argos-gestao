import {Link as RLink} from 'react-router-dom';
import {Card, Text} from '../ds';
import {useAuth} from '../auth';
import {PageHeader} from '../ui';

interface Entry {to: string; title: string; text: string; roles?: string[]}

const ENTRIES: Entry[] = [
  {to: '/admin', title: 'Usuários, auditoria e dados da empresa', text: 'Quem acessa, histórico de alterações e dados institucionais.', roles: ['admin', 'financeiro']},
  {to: '/sistemas', title: 'Sistemas entregues', text: 'Catálogo de softwares, links, domínios e custos de infraestrutura.'},
  {to: '/despesas', title: 'Despesas', text: 'Custos que entram no resultado.'},
  {to: '/relatorios', title: 'Relatórios', text: 'Recebimentos, inadimplência, receita por sistema — exportação em CSV e PDF.'},
  {to: '/pdv', title: 'Modo caixa (PDV)', text: 'Tela de recebimento rápido para dar baixa nas cobranças.'},
  {to: '/propostas', title: 'Precificação e propostas (avançado)', text: 'Calculadora, catálogo de custos, câmbio e tributos dentro do sistema. A precificação normal é feita no Claude e importada.'}
];

export function SettingsHubPage() {
  const {user} = useAuth();
  return (
    <div className="stack-lg">
      <PageHeader title="Configurações" subtitle="Itens de apoio. O dia a dia está em Importar proposta, Clientes, Propostas e contratos e Financeiro." />
      <div className="kpis">
        {ENTRIES.filter((e) => !e.roles || (user && e.roles.includes(user.role))).map((e) => (
          <Card key={e.to}><RLink to={e.to} className="ads-link" style={{fontWeight: 700, fontSize: '1.05rem'}}>{e.title}</RLink><Text muted size="sm">{e.text}</Text></Card>
        ))}
      </div>
    </div>
  );
}
