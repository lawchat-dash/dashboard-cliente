import { Columns2, X, LayoutDashboard, Megaphone, KanbanSquare, ClipboardCheck, Radio, FileText, PhoneCall, Bell, Eye, Check, Activity, GitCompareArrows } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ClientFeatures } from '@/hooks/useClient';
import { useState } from 'react';

export const SPLIT_PAGES = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, featureKey: null },
  { key: 'campanhas', label: 'Campanhas', icon: Megaphone, featureKey: 'campanhas' },
  { key: 'pipeline', label: 'Pipeline', icon: KanbanSquare, featureKey: 'pipeline' },
  { key: 'auditoria', label: 'Auditoria', icon: ClipboardCheck, featureKey: 'auditoria' },
  { key: 'ao-vivo', label: 'Ao Vivo', icon: Radio, featureKey: 'ao_vivo' },
  { key: 'contratos', label: 'Contratos', icon: FileText, featureKey: 'contratos' },
  { key: 'evolucao', label: 'Evolução', icon: Activity, featureKey: 'evolucao' },
  { key: 'comparar', label: 'Comparar', icon: GitCompareArrows, featureKey: 'comparar' },
  { key: 'follow-up', label: 'Follow-up', icon: PhoneCall, featureKey: 'follow_up' },
  { key: 'notificacoes', label: 'Notificações', icon: Bell, featureKey: 'notificacoes' },
  { key: 'supervisao', label: 'Supervisão', icon: Eye, featureKey: null },
];

interface SplitScreenSidebarItemProps {
  features?: ClientFeatures;
  splitPages: string[];
  onConfirm: (pages: string[]) => void;
  onClose: () => void;
  collapsed?: boolean;
}

const SplitScreenSidebarItem = ({ features, splitPages, onConfirm, onClose, collapsed = false }: SplitScreenSidebarItemProps) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const availablePages = SPLIT_PAGES.filter(p => {
    if (!p.featureKey) return true;
    if (!features) return true;
    return (features as any)[p.featureKey] !== false;
  });

  const togglePage = (key: string) => {
    setSelected(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= 3) return prev;
      return [...prev, key];
    });
  };

  const handleConfirm = () => {
    if (selected.length >= 2) {
      onConfirm(selected);
      setOpen(false);
      setSelected([]);
    }
  };

  // Active split mode — show close button
  if (splitPages.length > 0) {
    const labels = splitPages.map(k => SPLIT_PAGES.find(p => p.key === k)?.label).filter(Boolean).join(' + ');
    return (
      <button
        onClick={onClose}
        className={`group flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 hover:bg-destructive/10 ${
          collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
        } text-primary bg-primary/10`}
        title={collapsed ? `Fechar: ${labels}` : undefined}
      >
        <span className="relative">
          <X className="h-[18px] w-[18px] text-destructive group-hover:scale-110 transition-transform" />
        </span>
        {!collapsed && (
          <span className="whitespace-nowrap text-foreground text-xs truncate">
            <span className="text-muted-foreground">Split:</span>{' '}
            <span className="font-semibold">{labels}</span>
          </span>
        )}
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSelected([]); }}>
      <PopoverTrigger asChild>
        <button
          className={`group flex items-center gap-3 rounded-xl text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
          }`}
          title={collapsed ? 'Dividir Tela' : undefined}
        >
          <Columns2 className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">Dividir Tela</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-60 p-3">
        <p className="text-xs font-medium text-muted-foreground pb-1">Selecione 2 ou 3 abas para dividir:</p>
        <p className="text-[10px] text-muted-foreground/70 pb-2">
          {selected.length}/3 selecionadas (mín. 2)
        </p>
        <div className="flex flex-col gap-0.5">
          {availablePages.map(page => {
            const Icon = page.icon;
            const isSelected = selected.includes(page.key);
            return (
              <button
                key={page.key}
                onClick={() => togglePage(page.key)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors text-left ${
                  isSelected
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-accent text-foreground'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="flex-1">{page.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
        <button
          onClick={handleConfirm}
          disabled={selected.length < 2}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium transition-colors hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Columns2 className="h-4 w-4" />
          Dividir Tela ({selected.length})
        </button>
      </PopoverContent>
    </Popover>
  );
};

export default SplitScreenSidebarItem;
