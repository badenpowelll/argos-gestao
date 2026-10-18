import {useEffect, useState} from 'react';
import {NavLink, Outlet, useLocation} from 'react-router-dom';
import {Button, Drawer, IconButton, applyTheme, getStoredTheme, type Theme} from './ds';
import {useAuth} from './auth';
import {label} from './format';

const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  users: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
  file: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6zM14 3v6h6M8 13h8M8 17h5',
  upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3zM9 8h6M9 12h6',
  cash: 'M2 6h20v12H2zM12 15a3 3 0 100-6 3 3 0 000 6zM6 10v4M18 10v4',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  wallet: 'M3 7a2 2 0 012-2h13v4M3 7v10a2 2 0 002 2h15V9H5a2 2 0 01-2-2zM16 14h.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9'
};
export const Icon = ({name}: {name: string}) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name] ?? ''} />
  </svg>
);

const NAV: {to: string; text: string; icon: string; roles?: string[]}[] = [
  {to: '/', text: 'Painel', icon: 'home'},
  {to: '/propostas', text: 'Propostas', icon: 'file'},
  {to: '/precificacao', text: 'Precificação', icon: 'wallet'},
  {to: '/pdv', text: 'PDV / Receber', icon: 'cash'},
  {to: '/cobrancas', text: 'Contas a receber', icon: 'receipt'},
  {to: '/clientes', text: 'Clientes', icon: 'users'},
  {to: '/contratos', text: 'Contratos', icon: 'file'},
  {to: '/importar', text: 'Importar contrato', icon: 'upload'},
  {to: '/sistemas', text: 'Sistemas', icon: 'box'},
  {to: '/despesas', text: 'Despesas', icon: 'wallet'},
  {to: '/relatorios', text: 'Relatórios', icon: 'chart'},
  {to: '/admin', text: 'Administração', icon: 'shield', roles: ['admin', 'financeiro']}
];

function Brand() {
  // Regra de marca: sem versão branca do logotipo, ele fica sobre placa branca (nunca recolorido/invertido).
  return (
    <div className="brand">
      <div className="brand__plate"><img src="/argos-logo.png" alt="Argos Soluções" /></div>
      <span className="brand__product">Gestão 360°</span>
    </div>
  );
}

function Nav({onNavigate}: {onNavigate?: () => void}) {
  const {user, can} = useAuth();
  return (
    <nav aria-label="Menu principal" className="nav">
      {NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role))).map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={onNavigate} className={({isActive}) => `nav__item${isActive ? ' is-active' : ''}`}>
          <Icon name={n.icon} /> <span>{n.text}</span>
        </NavLink>
      ))}
      {can('admin') && null}
    </nav>
  );
}

export function Shell() {
  const {user, logout} = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(getStoredTheme());
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => { document.getElementById('main')?.focus(); }, [loc.pathname]);

  return (
    <div className="shell">
      <a href="#main" className="skip-link">Ir para o conteúdo</a>
      <aside className="sidebar">
        <Brand />
        <Nav />
        <div className="sidebar__foot">
          <p className="sidebar__user">{user?.name}<br /><small>{label(user?.role)}</small></p>
          <Button variant="outline" size="sm" className="sidebar__btn" onClick={() => void logout()}>Sair</Button>
        </div>
      </aside>

      <div className="content">
        <div className="topbar">
          <IconButton label="Abrir menu" icon={<Icon name="menu" />} variant="outline" onClick={() => setOpen(true)} className="topbar__menu" />
          <img src="/argos-simbolo.png" alt="" width={32} height={32} className="topbar__logo" />
          <strong className="topbar__title">Argos Gestão 360°</strong>
          <span className="topbar__spacer" />
          <label className="theme-pick">
            <span className="ads-sr-only">Tema</span>
            <select className="ads-input" value={theme} onChange={(e) => { const t = e.target.value as Theme; setTheme(t); applyTheme(t); }}>
              <option value="system">Tema do sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </select>
          </label>
        </div>
        <main id="main" tabIndex={-1} className="main"><Outlet /></main>
        <footer className="footer">Argos Soluções · Onde dados se tornam decisão.</footer>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} title="Menu" side="start">
        <div className="drawer-nav">
          <Nav onNavigate={() => setOpen(false)} />
          <p className="sidebar__user">{user?.name} · {label(user?.role)}</p>
          <Button variant="outline" onClick={() => void logout()}>Sair</Button>
        </div>
      </Drawer>
    </div>
  );
}
