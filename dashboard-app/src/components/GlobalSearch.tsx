import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Search, User, FileText, StickyNote, Megaphone, CornerDownLeft } from 'lucide-react';

interface GlobalSearchProps {
  cards: Card[];
  sessions: Session[];
  basePath?: string;
  onSelectCard?: (card: Card) => void;
}

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function leadName(title: string): string {
  if (!title) return '—';
  const m = title.match(/👤\s*([^|]+)/);
  let s = (m ? m[1] : title.split(/[|]|\s[-–]\s/)[0] || title).replace(/[^\w\sÀ-ÿ.-]/g, '').trim();
  s = s.replace(/^(ia\s+cliente|cliente|ia)\s+/i, '').trim();
  if (s && s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|\s)([a-zà-ÿ])/g, (_, p, c) => p + c.toUpperCase());
  return s || '—';
}

const GlobalSearch = ({ cards, sessions, basePath = '', onSelectCard }: GlobalSearchProps) => {
  const navigate = useNavigate();
  const { classify } = useClassify();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // ⌘K / Ctrl+K abre; "/" também (quando não estiver digitando em input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === '/' && !open) {
        const tag = (e.target as HTMLElement)?.tagName;
        const editable = (e.target as HTMLElement)?.isContentEditable;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !editable) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // índice de busca (memoizado) — uma passada sobre os cards
  const index = useMemo(() => {
    return cards.filter(c => !c.archived).map(c => {
      const cAny = c as any;
      const name = c.contacts?.[0]?.name || leadName(c.title);
      const isContract = classify(c) === 'CONTRATO FECHADO';
      const parsed = cAny.contractParsed || null;
      const noteText: string = cAny.contractNote?.text || '';
      const caso = parsed?.caso || '';
      return {
        card: c,
        name,
        isContract,
        caso,
        step: c.stepTitle || '',
        responsible: c.responsibleUser?.name || '',
        hay: norm([name, c.title, c.stepTitle, c.responsibleUser?.name].filter(Boolean).join(' ')),
        casoHay: norm([name, caso].join(' ')),
        noteHay: norm(noteText),
        noteSnippet: (parsed?.resumo_caso || noteText || '').replace(/\s+/g, ' ').slice(0, 80),
      };
    });
  }, [cards, classify]);

  const campaigns = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach(s => { if (s.utmCampaign) set.add(s.utmCampaign); });
    return Array.from(set).map(name => ({ name, hay: norm(name) }));
  }, [sessions]);

  const q = norm(query.trim());
  const results = useMemo(() => {
    if (!q) {
      // estado vazio: alguns contratos recentes como atalho
      const recents = index.filter(i => i.isContract).slice(0, 5);
      return { leads: [], contratos: recents, anotacoes: [], campanhas: [], empty: true };
    }
    const leads = index.filter(i => i.hay.includes(q)).slice(0, 6);
    const contratos = index.filter(i => i.isContract && i.casoHay.includes(q)).slice(0, 6);
    const anotacoes = index.filter(i => i.isContract && i.noteHay && i.noteHay.includes(q)).slice(0, 5);
    const campanhas = campaigns.filter(c => c.hay.includes(q)).slice(0, 6);
    return { leads, contratos, anotacoes, campanhas, empty: false };
  }, [q, index, campaigns]);

  const close = () => { setOpen(false); setQuery(''); };

  const goCard = (card: Card) => {
    close();
    if (onSelectCard) onSelectCard(card);
  };
  const goCampaign = (name: string) => {
    close();
    navigate(`${basePath}/campanhas`);
  };

  const totalResults = results.leads.length + results.contratos.length + results.anotacoes.length + results.campanhas.length;

  return (
    <>
      {/* gatilho flutuante (atalho visível) */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 hidden md:flex items-center gap-2 rounded-full border border-border/60 bg-card/90 backdrop-blur px-4 py-2.5 text-xs text-muted-foreground shadow-lg hover:text-foreground hover:shadow-xl transition-all print:hidden"
        title="Busca global (⌘K)"
      >
        <Search className="h-3.5 w-3.5" />
        Buscar
        <kbd className="ml-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="overflow-hidden p-0 shadow-lg sm:max-w-xl gap-0">
          <DialogTitle className="sr-only">Busca global</DialogTitle>
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-12">
            <CommandInput
              placeholder="Buscar lead, contrato, anotação ou campanha..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[60vh]">
          {!results.empty && totalResults === 0 && (
            <CommandEmpty>Nada encontrado para “{query}”.</CommandEmpty>
          )}

          {results.empty && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              Digite para buscar em <strong className="text-foreground">leads</strong>, <strong className="text-foreground">contratos</strong>, <strong className="text-foreground">anotações</strong> e <strong className="text-foreground">campanhas</strong>.
            </div>
          )}

          {results.contratos.length > 0 && (
            <CommandGroup heading={results.empty ? 'Contratos recentes' : 'Contratos'}>
              {results.contratos.map(r => (
                <CommandItem key={`ct-${r.card.id}`} value={`ct-${r.card.id}`} onSelect={() => goCard(r.card)} className="gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{r.caso || 'Contrato fechado'}</p>
                  </div>
                  <CornerDownLeft className="h-3 w-3 text-muted-foreground/50" />
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.leads.length > 0 && (
            <CommandGroup heading="Leads">
              {results.leads.map(r => (
                <CommandItem key={`ld-${r.card.id}`} value={`ld-${r.card.id}`} onSelect={() => goCard(r.card)} className="gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{r.step}{r.responsible ? ` · ${r.responsible}` : ''}</p>
                  </div>
                  <CornerDownLeft className="h-3 w-3 text-muted-foreground/50" />
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.anotacoes.length > 0 && (
            <CommandGroup heading="Anotações">
              {results.anotacoes.map(r => (
                <CommandItem key={`an-${r.card.id}`} value={`an-${r.card.id}`} onSelect={() => goCard(r.card)} className="gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                    <StickyNote className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{r.noteSnippet}…</p>
                  </div>
                  <CornerDownLeft className="h-3 w-3 text-muted-foreground/50" />
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {results.campanhas.length > 0 && (
            <CommandGroup heading="Campanhas">
              {results.campanhas.map(c => (
                <CommandItem key={`cp-${c.name}`} value={`cp-${c.name}`} onSelect={() => goCampaign(c.name)} className="gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 shrink-0">
                    <Megaphone className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm text-foreground truncate flex-1">{c.name}</p>
                  <CornerDownLeft className="h-3 w-3 text-muted-foreground/50" />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GlobalSearch;
