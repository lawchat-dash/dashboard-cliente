import { Card } from '@/components/ui/card';
import { MessageSquare, Clock, UserCheck, Eye, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface CrmNotification {
  id: string;
  client_id: string;
  contact_name: string;
  contact_phone: string;
  message: string;
  status: 'new' | 'read' | 'pending' | 'resolved' | 'urgent';
  source: string | null;
  metadata: any;
  assigned_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: 'Nova', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  urgent: { label: 'Urgente', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  read: { label: 'Lida', className: 'bg-muted text-muted-foreground border-border' },
  pending: { label: 'Pendente', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  resolved: { label: 'Resolvida', className: 'bg-primary/15 text-primary border-primary/30' },
};

interface Props {
  notification: CrmNotification;
  agentName?: string;
  onClick: () => void;
}

export const CrmNotificationCard = ({ notification, agentName, onClick }: Props) => {
  const status = statusConfig[notification.status] || statusConfig.new;
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: false,
    locale: ptBR,
  });

  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer border border-border/40 bg-card/60 backdrop-blur-sm p-4 transition-all hover:bg-card/90 hover:border-border hover:shadow-card-hover rounded-xl ${
        notification.status === 'urgent' ? 'border-l-4 border-l-destructive' :
        notification.status === 'new' ? 'border-l-4 border-l-blue-500' : ''
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 ${
          notification.status === 'urgent' ? 'border-destructive text-destructive' :
          notification.status === 'new' ? 'border-blue-500 text-blue-400' :
          'border-muted-foreground/30 text-muted-foreground'
        }`}>
          <span className="text-xs font-bold">
            {notification.contact_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground truncate">{notification.contact_name}</h3>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="flex items-center gap-1 text-xs text-yellow-400">
              <Clock className="h-3 w-3" />
              {timeAgo} sem resposta
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            <span>{notification.message.substring(0, 60)}{notification.message.length > 60 ? '...' : ''}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {agentName && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <UserCheck className="h-3.5 w-3.5" />
              {agentName}
            </span>
          )}
          <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${status.className}`}>
            {notification.status === 'resolved' && <CheckCircle className="h-3 w-3" />}
            {status.label}
          </span>
        </div>
      </div>
    </Card>
  );
};
