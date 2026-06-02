import { useMemo, useState } from 'react';
import { Session } from '@/api/helena';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, Search, Filter } from 'lucide-react';

interface CampaignFilterProps {
  sessions: Session[];
  selectedCampaign: string;
  onSelect: (campaign: string) => void;
}

const CampaignFilter = ({ sessions, selectedCampaign, onSelect }: CampaignFilterProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Only show campaigns that have sessions in the current (already date-filtered) dataset
  const campaigns = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach(s => {
      if (s.utmCampaign) {
        map.set(s.utmCampaign, (map.get(s.utmCampaign) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [sessions]);

  const totalWithUtm = useMemo(() => sessions.filter(s => s.utmCampaign).length, [sessions]);

  const filtered = useMemo(() => {
    if (!search) return campaigns;
    const q = search.toLowerCase();
    return campaigns.filter(c => c.name.toLowerCase().includes(q));
  }, [campaigns, search]);

  const label = selectedCampaign === '__all__'
    ? 'Todas as Campanhas'
    : selectedCampaign;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-card transition-colors hover:bg-muted/40">
          <Filter className="h-4 w-4 text-primary" />
          <span className="max-w-[250px] truncate">{label}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <div className="border-b border-border p-2">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar campanha..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
        </div>
        <ScrollArea className="max-h-[300px]">
          <div className="p-1">
            <button
              onClick={() => { onSelect('__all__'); setOpen(false); setSearch(''); }}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                selectedCampaign === '__all__'
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground hover:bg-muted/40'
              }`}
            >
              Todas as Campanhas
              <span className="text-xs tabular-nums text-muted-foreground">{totalWithUtm} leads</span>
            </button>
            {filtered.map(c => (
              <button
                key={c.name}
                onClick={() => { onSelect(c.name); setOpen(false); setSearch(''); }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                  selectedCampaign === c.name
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-muted/40'
                }`}
              >
                <span className="truncate mr-2">{c.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{c.count} leads</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nenhuma campanha encontrada</p>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default CampaignFilter;
