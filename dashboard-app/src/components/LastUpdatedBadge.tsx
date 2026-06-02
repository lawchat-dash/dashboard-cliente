import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

function rel(d: Date): string {
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'agora mesmo';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

interface Props {
  date: Date | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}

// Selo "Atualizado há X min" — mostra a idade real dos dados na tela.
// Reanima o tempo relativo a cada 30s. Clicável → força releitura fresca.
// Verde = recente; âmbar = >2h (provável que o cron não rodou / está vendo cache).
const LastUpdatedBadge = ({ date, onRefresh, refreshing }: Props) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  if (!date) return null;
  const stale = Date.now() - date.getTime() > 2 * 3600000; // >2h
  const dot = stale ? 'bg-amber-500' : 'bg-emerald-500';
  const ping = stale ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <button
      onClick={onRefresh}
      title={`Dados de: ${date.toLocaleString('pt-BR')}\nClique para atualizar`}
      className="flex shrink-0 items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:bg-secondary hover:text-foreground print:hidden"
    >
      <span className="relative flex h-2 w-2">
        <span className={`absolute inline-flex h-full w-full rounded-full ${ping} opacity-75 animate-ping`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      <span>Atualizado {rel(date)}</span>
      <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
    </button>
  );
};

export default LastUpdatedBadge;
