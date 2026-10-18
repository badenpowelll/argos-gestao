import {Navigate, Route, Routes} from 'react-router-dom';
import {useAuth} from './auth';
import {Loading} from './ui';
import {Shell} from './Shell';
import {LoginPage} from './pages/Login';
import {DashboardPage} from './pages/Dashboard';
import {ClientsPage, ClientDetailPage} from './pages/Clients';
import {SystemsPage} from './pages/Systems';
import {ContractsPage, ContractDetailPage} from './pages/Contracts';
import {ImportPage} from './pages/Import';
import {ChargesPage, PdvPage} from './pages/Receivables';
import {ReportsPage} from './pages/Reports';
import {ExpensesPage} from './pages/Expenses';
import {AdminPage} from './pages/Admin';

export function App() {
  const {user, ready} = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<DashboardPage />} />
        <Route path="pdv" element={<PdvPage />} />
        <Route path="cobrancas" element={<ChargesPage />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="clientes/:id" element={<ClientDetailPage />} />
        <Route path="contratos" element={<ContractsPage />} />
        <Route path="contratos/:id" element={<ContractDetailPage />} />
        <Route path="importar" element={<ImportPage />} />
        <Route path="sistemas" element={<SystemsPage />} />
        <Route path="despesas" element={<ExpensesPage />} />
        <Route path="relatorios" element={<ReportsPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
