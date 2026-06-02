import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, LayoutDashboard, LogOut, PanelLeftOpen, PanelLeftClose, BarChart3, Settings, Sun, Moon, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

const navItems = [
  { title: 'Resumo',         url: '/admin',           icon: BarChart3,       exact: true },
  { title: 'Clientes',       url: '/admin/clients',   icon: Users },
  { title: 'Dashboard',      url: '/admin/dashboard', icon: LayoutDashboard },
  { title: 'Sincronização',  url: '/admin/sync',      icon: RefreshCw },
  { title: 'Configurações',  url: '/admin/settings',  icon: Settings },
];

const AdminSidebar = () => {
  const location = useLocation();
  const { signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`sticky top-0 flex h-screen flex-col bg-card/40 backdrop-blur-xl transition-all duration-300 print:hidden border-r border-border/60 ${
        collapsed ? 'w-[68px]' : 'w-[230px]'
      }`}
    >
      {/* Logo / brand row — usa logo correta por tema */}
      <div className={`flex items-center px-4 pt-5 pb-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {collapsed ? (
          <img src="/lawchat-logo.png" alt="LawChat" className="h-8 w-8" />
        ) : (
          <img
            src={theme === 'dark' ? '/lawchat-logo-dark-bg.png' : '/lawchat-logo-light-bg.png'}
            alt="LawChat"
            className="h-9 object-contain"
          />
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Recolher"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Section label */}
      {!collapsed && (
        <div className="px-5 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
            Gerenciamento
          </span>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-1 px-3">
        {navItems.map(item => {
          const isActive = (item as any).exact
            ? location.pathname === item.url
            : location.pathname === item.url || location.pathname.startsWith(item.url + '/');

          return (
            <Link
              key={item.url}
              to={item.url}
              className={`group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
              } ${
                isActive
                  ? 'text-[#15BF41] dark:text-[#8ED393] shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
              style={isActive ? { background: 'linear-gradient(90deg, rgba(142,211,147,0.16), rgba(21,191,65,0.05))' } : undefined}
              title={collapsed ? item.title : undefined}
            >
              {/* Active indicator bar (cor lawchat) */}
              {isActive && (
                <motion.div
                  layoutId="admin-active-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-1 rounded-r-full"
                  style={{ background: 'linear-gradient(180deg, #8ED393, #15BF41)', boxShadow: '0 0 10px rgba(21,191,65,0.6)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}

              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'text-white shadow-md'
                    : 'bg-transparent text-muted-foreground group-hover:bg-muted/80 group-hover:text-foreground'
                }`}
                style={isActive ? { background: 'linear-gradient(135deg, #8ED393, #15BF41)', boxShadow: '0 4px 10px -2px rgba(21,191,65,0.4)' } : undefined}
              >
                <item.icon className="h-[15px] w-[15px]" />
              </div>

              {!collapsed && (
                <span className={`transition-all ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {item.title}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto flex flex-col gap-1 border-t border-border/60 px-3 py-3">
        <button
          onClick={toggleTheme}
          className={`group flex items-center gap-3 rounded-xl text-sm text-muted-foreground transition-all duration-200 hover:bg-muted/60 hover:text-foreground ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
          }`}
          title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-transparent group-hover:bg-muted/80 transition-all">
            {theme === 'dark' ? <Sun className="h-[15px] w-[15px]" /> : <Moon className="h-[15px] w-[15px]" />}
          </div>
          {!collapsed && <span className="font-medium">{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>}
        </button>

        <button
          onClick={() => setCollapsed(c => !c)}
          className={`group flex items-center gap-3 rounded-xl text-sm text-muted-foreground transition-all duration-200 hover:bg-muted/60 hover:text-foreground ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
          }`}
          title={collapsed ? 'Expandir' : 'Recolher'}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-transparent group-hover:bg-muted/80 transition-all">
            {collapsed ? <PanelLeftOpen className="h-[15px] w-[15px]" /> : <PanelLeftClose className="h-[15px] w-[15px]" />}
          </div>
          {!collapsed && <span className="font-medium">Recolher</span>}
        </button>

        <button
          onClick={signOut}
          className={`group flex items-center gap-3 rounded-xl text-sm text-muted-foreground transition-all duration-200 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
          }`}
          title="Sair"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-transparent group-hover:bg-red-100 dark:group-hover:bg-red-500/20 transition-all">
            <LogOut className="h-[15px] w-[15px]" />
          </div>
          {!collapsed && <span className="font-medium">Sair</span>}
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
