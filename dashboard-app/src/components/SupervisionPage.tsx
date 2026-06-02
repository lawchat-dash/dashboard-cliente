import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ActionLog {
  id: string;
  actor_name: string;
  action_type: string;
  lead_ids: string[];
  details: any;
  created_at: string;
}

const SUPERVISION_PASSWORD = '141218';

const ACTION_TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  assign: { label: 'Atribuiu responsável', emoji: '👤' },
  unassign: { label: 'Removeu responsável', emoji: '🚫' },
  evaluate: { label: 'Alterou avaliação', emoji: '📊' },
  resolve: { label: 'Resolveu lead', emoji: '✅' },
  auto_assign: { label: 'Auto-atribuição', emoji: '🤖' },
};

interface Props {
  clientId?: string;
}

const SupervisionPage = ({ clientId }: Props) => {
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase.from('notification_action_logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (clientId) query = query.eq('client_id', clientId);
    const { data } = await query;
    setActionLogs((data as ActionLog[] | null) || []);
    setLoading(false);
  };

  const handleAccess = () => {
    if (passwordInput === SUPERVISION_PASSWORD) {
      setUnlocked(true);
      setPasswordError(false);
      fetchLogs();
    } else {
      setPasswordError(true);
    }
  };

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Shield className="h-14 w-14 text-muted-foreground/40" />
        <h2 className="text-base font-semibold text-foreground">Supervisão</h2>
        <p className="text-xs text-muted-foreground">Digite a senha para acessar o painel de supervisão</p>
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
            onKeyDown={(e) => e.key === 'Enter' && handleAccess()}
            className={`w-44 rounded-lg border px-3 py-2 text-xs bg-background text-foreground ${passwordError ? 'border-destructive' : 'border-border'}`}
            placeholder="Senha..."
          />
          <Button size="sm" onClick={handleAccess} className="rounded-lg text-xs h-8">Entrar</Button>
        </div>
        {passwordError && <p className="text-[11px] text-destructive">Senha incorreta</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Supervisão</h2>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="rounded-lg text-xs h-7">
          <RefreshCw className={`mr-1.5 h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">Últimas 200 ações registradas no sistema</p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : actionLogs.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-12">Nenhuma ação registrada</p>
      ) : (
        <div className="space-y-1.5 max-h-[75vh] overflow-y-auto">
          {actionLogs.map((log) => {
            const info = ACTION_TYPE_LABELS[log.action_type] || { label: log.action_type, emoji: '📌' };
            return (
              <div key={log.id} className="rounded-lg border border-border/50 bg-card/50 px-3 py-2.5 flex items-start gap-2.5">
                <span className="text-sm shrink-0">{info.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-medium text-foreground">{log.actor_name}</span>
                    <span className="text-muted-foreground"> — {info.label}</span>
                  </p>
                  {log.details?.assigned_to && <p className="text-[11px] text-muted-foreground">→ {log.details.assigned_to}</p>}
                  {log.details?.evaluation_stage && <p className="text-[11px] text-muted-foreground">→ {log.details.evaluation_stage}</p>}
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })} · {log.lead_ids?.length || 0} lead(s)
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SupervisionPage;
