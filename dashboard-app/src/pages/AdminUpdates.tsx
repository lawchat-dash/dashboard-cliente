import { motion } from 'framer-motion';
import { History, Tag, Sparkles, CheckCircle2 } from 'lucide-react';
import { APP_VERSION, IS_BETA, CHANGELOG } from '@/lib/version';

const fmtDate = (d: string) => {
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return d; }
};

const AdminUpdates = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#8ED393] to-[#15BF41] text-white shadow-sm">
              <History className="h-5 w-5" />
            </span>
            Relatório de Atualizações
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Histórico de tudo que foi modificado e publicado. A cada mudança, a versão sobe e entra aqui.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {IS_BETA && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--kpi-amber))]/40 bg-[hsl(var(--kpi-amber))]/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-[hsl(var(--kpi-amber))]">
              <Sparkles className="h-3.5 w-3.5" /> Beta
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold text-foreground">
            <Tag className="h-3.5 w-3.5 text-primary" /> v{APP_VERSION}
          </span>
        </div>
      </motion.div>

      {/* Como funciona o versionamento */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Como lemos a versão:</span>{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">MAIOR.MENOR.CORREÇÃO.BUILD</code> — ex.: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">1.00.0.0</code>.
        Mudanças pequenas sobem os últimos números; entregas grandes sobem os primeiros.
      </div>

      {/* Timeline */}
      <div className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-border">
        {CHANGELOG.map((entry, i) => (
          <motion.div
            key={entry.version}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative pl-10"
          >
            {/* dot */}
            <span className={`absolute left-0 top-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 ${i === 0 ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}>
              <Tag className="h-3.5 w-3.5" />
            </span>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-foreground">v{entry.version}</span>
                {i === 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">Atual</span>
                )}
                {entry.title && <span className="text-sm font-medium text-muted-foreground">· {entry.title}</span>}
                <span className="ml-auto text-xs text-muted-foreground/70">{fmtDate(entry.date)}</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {entry.changes.map((c, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--kpi-emerald))]" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default AdminUpdates;
