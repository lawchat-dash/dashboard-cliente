import { useState, useEffect } from 'react';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
const supabase = supabaseClient as any;
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Send, StickyNote, Settings, MessageSquare, Trash2, Phone, UserCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { CrmNotification } from './CrmNotificationCard';

interface CrmAgent {
  id: string;
  name: string;
  email: string;
  role: string | null;
}

interface CrmConversation {
  id: string;
  notification_id: string;
  sender: string;
  message: string;
  created_at: string;
}

interface CrmInternalNote {
  id: string;
  notification_id: string;
  content: string;
  author: string | null;
  created_at: string;
}

interface Props {
  notification: CrmNotification;
  open: boolean;
  onClose: () => void;
  clientId: string;
}

export const CrmConversationDialog = ({ notification, open, onClose, clientId }: Props) => {
  const [conversations, setConversations] = useState<CrmConversation[]>([]);
  const [notes, setNotes] = useState<CrmInternalNote[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [newNote, setNewNote] = useState('');
  const [status, setStatus] = useState(notification.status);
  const [agents, setAgents] = useState<CrmAgent[]>([]);
  const [assignedAgentId, setAssignedAgentId] = useState<string>(notification.assigned_agent_id || '');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    const [convRes, notesRes, agentsRes] = await Promise.all([
      supabase.from('crm_conversations').select('*').eq('notification_id', notification.id).order('created_at'),
      supabase.from('crm_internal_notes').select('*').eq('notification_id', notification.id).order('created_at', { ascending: false }),
      supabase.from('crm_agents').select('*').eq('client_id', clientId).order('name'),
    ]);
    setConversations((convRes.data as CrmConversation[]) || []);
    setNotes((notesRes.data as CrmInternalNote[]) || []);
    setAgents((agentsRes.data as CrmAgent[]) || []);
  };

  useEffect(() => {
    if (open) {
      fetchData();
      setStatus(notification.status);
      setAssignedAgentId(notification.assigned_agent_id || '');
    }
  }, [open, notification.id]);

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus as CrmNotification['status']);
    const { error } = await supabase
      .from('crm_notifications')
      .update({ status: newStatus as any })
      .eq('id', notification.id);
    if (error) toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
    else toast({ title: 'Status atualizado' });
  };

  const handleAssignAgent = async (agentId: string) => {
    const value = agentId === 'unassigned' ? null : agentId;
    setAssignedAgentId(value || '');
    const { error } = await supabase
      .from('crm_notifications')
      .update({ assigned_agent_id: value })
      .eq('id', notification.id);
    if (error) toast({ title: 'Erro ao atribuir agente', variant: 'destructive' });
    else toast({ title: value ? 'Agente atribuído' : 'Agente removido' });
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('crm_conversations').insert({
      notification_id: notification.id,
      sender: 'agent',
      message: newMessage.trim(),
    });
    if (error) toast({ title: 'Erro ao enviar mensagem', variant: 'destructive' });
    else { setNewMessage(''); fetchData(); toast({ title: 'Mensagem registrada' }); }
    setSaving(false);
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('crm_internal_notes').insert({
      notification_id: notification.id,
      content: newNote.trim(),
    });
    if (error) toast({ title: 'Erro ao adicionar nota', variant: 'destructive' });
    else { setNewNote(''); fetchData(); toast({ title: 'Nota adicionada' }); }
    setSaving(false);
  };

  const handleDeleteNote = async (noteId: string) => {
    const { error } = await supabase.from('crm_internal_notes').delete().eq('id', noteId);
    if (error) toast({ title: 'Erro ao excluir nota', variant: 'destructive' });
    else fetchData();
  };

  const statusOptions = [
    { value: 'new', label: 'Nova', color: 'text-blue-400' },
    { value: 'urgent', label: 'Urgente', color: 'text-destructive' },
    { value: 'read', label: 'Lida', color: 'text-muted-foreground' },
    { value: 'pending', label: 'Pendente', color: 'text-yellow-400' },
    { value: 'resolved', label: 'Resolvida', color: 'text-primary' },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            {notification.contact_name}
            <span className="text-sm font-normal text-muted-foreground">
              {notification.contact_phone}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-4 pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Status:</span>
            <Select value={status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-36 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className={opt.color}>{opt.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Responsável:</span>
            <Select value={assignedAgentId || 'unassigned'} onValueChange={handleAssignAgent}>
              <SelectTrigger className="w-44 h-8">
                <SelectValue placeholder="Não atribuído" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Não atribuído</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="conversation" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full">
            <TabsTrigger value="conversation" className="flex-1 gap-1.5">
              <MessageSquare className="h-4 w-4" />
              Conversa
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1 gap-1.5">
              <StickyNote className="h-4 w-4" />
              Notas ({notes.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="conversation" className="flex-1 overflow-hidden flex flex-col mt-2">
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
              <div className="rounded-xl bg-accent/50 p-3">
                <p className="text-xs font-medium text-accent-foreground/70 mb-1">Mensagem original</p>
                <p className="text-sm text-foreground">{notification.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`rounded-xl p-3 max-w-[80%] ${
                    conv.sender === 'agent'
                      ? 'ml-auto bg-primary/10 border border-primary/20'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {conv.sender === 'agent' ? 'Você' : notification.contact_name}
                  </p>
                  <p className="text-sm text-foreground">{conv.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(conv.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Textarea
                placeholder="Escrever resposta..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="resize-none"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
                }}
              />
              <Button onClick={handleSendMessage} disabled={saving || !newMessage.trim()} size="icon" className="shrink-0 self-end">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="notes" className="flex-1 overflow-hidden flex flex-col mt-2">
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-3">
              {notes.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma nota interna</p>
              )}
              {notes.map((note) => (
                <div key={note.id} className="group rounded-xl bg-muted/50 border border-border p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-foreground">{note.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {note.author || 'Sistema'} · {formatDistanceToNow(new Date(note.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => handleDeleteNote(note.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Textarea
                placeholder="Adicionar nota interna..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="resize-none"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(); }
                }}
              />
              <Button onClick={handleAddNote} disabled={saving || !newNote.trim()} size="icon" className="shrink-0 self-end" variant="secondary">
                <StickyNote className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
