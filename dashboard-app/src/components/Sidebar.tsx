import { useState, useEffect } from 'react';
import { BarChart3, Megaphone, PanelLeftClose, PanelLeftOpen, Kanban, ClipboardCheck, Menu, X, MessageCircle, FileText, PhoneCall, Sun, Moon, Bell, Shield, Activity, GitCompareArrows } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { ClientFeatures } from '@/hooks/useClient';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import logoImg from '@/assets/Logo_lawchat.png';
import NotificationSettings from '@/components/NotificationSettings';
import { useTheme } from '@/hooks/useTheme';
import SplitScreenSidebarItem from '@/components/SplitScreenButton';

interface SidebarProps {
  features?: ClientFeatures;
  basePath?: string;
  clientId?: string;
  lastUpdated?: Date | null;
  currentUserName?: string | null;
  currentUserProfile?: string | null;
  splitPages?: string[];
  onSplitConfirm?: (pages: string[]) => void;
  onSplitClose?: () => void;
}

const allNavItems = [
  { title: 'Dashboard', url: '/', icon: BarChart3, featureKey: 'dashboard' as const },
  { title: 'Campanhas', url: '/campanhas', icon: Megaphone, featureKey: 'campanhas' as const },
  { title: 'Pipeline', url: '/pipeline', icon: Kanban, featureKey: 'pipeline' as const },
  { title: 'Auditoria', url: '/auditoria', icon: ClipboardCheck, featureKey: 'auditoria' as const },
  { title: 'Ao Vivo', url: '/ao-vivo', icon: MessageCircle, featureKey: 'ao_vivo' as const },
  { title: 'Contratos', url: '/contratos', icon: FileText, featureKey: 'contratos' as const },
  { title: 'Evolução', url: '/evolucao', icon: Activity, featureKey: 'evolucao' as const },
  { title: 'Comparar', url: '/comparar', icon: GitCompareArrows, featureKey: 'comparar' as const },
  { title: 'Follow-up', url: '/follow-up', icon: PhoneCall, featureKey: 'follow_up' as const },
  { title: 'Central de Notificações', url: '/notificacoes', icon: Bell, featureKey: 'notificacoes' as const },
  { title: 'Supervisão', url: '/supervisao', icon: Shield, featureKey: 'supervisao' as const },
];

const STORAGE_KEY = 'sidebar-collapsed';

const Sidebar = ({ features, basePath = '', clientId, lastUpdated, currentUserName, currentUserProfile, splitPages = [], onSplitConfirm, onSplitClose }: SidebarProps) => {
  const isMobile = useIsMobile();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
  }, [collapsed]);

  const navItems = features
    ? allNavItems.filter(item => features[item.featureKey] !== false)
    : allNavItems;

  const userInitials = currentUserName
    ? currentUserName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : null;

  // User badge component
  const UserBadge = ({ compact = false }: { compact?: boolean }) => {
    if (!currentUserName) return null;
    return (
      <div className={`flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 ${compact ? 'justify-center p-2' : 'px-3 py-2'}`}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-[11px] font-bold">
          {userInitials}
        </div>
        {!compact && (
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{currentUserName}</p>
            {currentUserProfile && (
              <p className="text-[10px] text-muted-foreground">{currentUserProfile}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  // Mobile: hamburger → sheet drawer
  if (isMobile) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between bg-sidebar px-4 py-3 print:hidden border-b border-sidebar-border">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="flex items-center justify-center rounded-xl p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-sidebar border-r border-sidebar-border">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-5 py-5">
                  {currentUserName && <UserBadge />}
                  <SheetClose asChild>
                    <button className="rounded-lg p-1 text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </SheetClose>
                </div>

                <div className="px-5 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Navegação</span>
                </div>
                <nav className="flex flex-col gap-0.5 px-3 flex-1">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.url}
                      to={basePath + item.url}
                      end={item.url === '/'}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-primary/15 text-primary font-semibold"
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className="relative">
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        {item.featureKey === 'ao_vivo' && (
                          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
                        )}
                      </span>
                      <span>{item.title}</span>
                    </NavLink>
                  ))}
                </nav>
                {onSplitConfirm && onSplitClose && (
                  <div className="px-3 mt-1">
                    <div className="border-t border-sidebar-border pt-2">
                      <SplitScreenSidebarItem features={features} splitPages={splitPages} onConfirm={(pages) => { onSplitConfirm(pages); setMobileOpen(false); }} onClose={() => { onSplitClose(); setMobileOpen(false); }} />
                    </div>
                  </div>
                )}
                {clientId && (
                  <div className="border-t border-sidebar-border p-3">
                    <NotificationSettings clientId={clientId} />
                  </div>
                )}
                <div className="border-t border-sidebar-border p-3">
                  <button
                    onClick={toggleTheme}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
                  >
                    {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                    <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <span className="text-sm font-bold text-sidebar-primary">Menu</span>
          <div className="w-8" />
        </div>
        <div className="h-[52px] shrink-0 print:hidden" />
      </>
    );
  }

  // Desktop: collapsible sidebar with design system (estilo SDR Flow)
  return (
    <aside
      className={`sticky top-0 flex h-screen flex-col bg-card/40 backdrop-blur-xl transition-all duration-300 print:hidden border-r border-border/60 ${
        collapsed ? 'w-[72px]' : 'w-[240px]'
      }`}
    >
      {/* Brand header — usa logo correta por tema, sem gradient box */}
      <div className={`flex items-center pt-5 pb-4 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
        {collapsed ? (
          <img src="/lawchat-logo.png" alt="LawChat" className="h-9 w-9" />
        ) : (
          <img
            src={theme === 'dark' ? '/lawchat-logo-dark-bg.png' : '/lawchat-logo-light-bg.png'}
            alt="LawChat"
            className="h-10 object-contain"
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

      {/* User badge */}
      {!collapsed && currentUserName && (
        <div className="px-3 mb-3">
          <UserBadge compact={false} />
        </div>
      )}
      {collapsed && currentUserName && (
        <div className="px-2 mb-3 flex justify-center">
          <UserBadge compact={true} />
        </div>
      )}

      {/* Section label */}
      {!collapsed && (
        <div className="px-5 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
            Navegação
          </span>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex w-full flex-1 flex-col gap-1 px-3 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={basePath + item.url}
            end={item.url === '/'}
            className={`group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 ${
              collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
            } text-muted-foreground hover:text-foreground hover:bg-muted/60`}
            activeClassName="active-nav !text-[#15BF41] dark:!text-[#8ED393] shadow-sm font-semibold [&_.active-bar]:!block"
            title={collapsed ? item.title : undefined}
          >
            {/* Active indicator bar (cor lawchat) */}
            <span className="active-bar hidden absolute left-0 top-1/2 -translate-y-1/2 h-7 w-1 rounded-r-full" style={{ background: 'linear-gradient(180deg, #8ED393, #15BF41)', boxShadow: '0 0 10px rgba(21,191,65,0.6)' }} />

            <span className="icon-wrap flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-transparent group-hover:bg-muted/80 transition-all duration-200">
              <item.icon className="h-[15px] w-[15px]" />
              {item.featureKey === 'ao_vivo' && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </span>

            {!collapsed && <span className="whitespace-nowrap">{item.title}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Split Screen */}
      {onSplitConfirm && onSplitClose && (
        <div className="px-2 mt-1">
          <div className="border-t border-sidebar-border pt-2">
            <SplitScreenSidebarItem features={features} splitPages={splitPages} onConfirm={onSplitConfirm} onClose={onSplitClose} collapsed={collapsed} />
          </div>
        </div>
      )}

      {/* Bottom section */}
      <div className="mt-auto flex flex-col gap-0.5 w-full border-t border-sidebar-border px-2 py-3">
        {clientId && (
          <NotificationSettings clientId={clientId} collapsed={collapsed} />
        )}
        <button
          onClick={toggleTheme}
          className={`flex items-center gap-3 rounded-xl text-sm text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
          }`}
          title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
        >
          {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          {!collapsed && <span className="font-medium">{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>}
        </button>
        <button
          onClick={() => setCollapsed((c: boolean) => !c)}
          className={`flex items-center gap-3 rounded-xl text-sm text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
          }`}
          title={collapsed ? 'Expandir menu' : 'Minimizar menu'}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!collapsed && <span className="font-medium">Recolher</span>}
        </button>
        {lastUpdated && !collapsed && (
          <div className="px-3 py-1.5">
            <p className="text-[10px] text-muted-foreground">
              Atualizado {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
