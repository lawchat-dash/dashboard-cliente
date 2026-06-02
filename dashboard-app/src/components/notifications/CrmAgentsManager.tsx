import { useState, useEffect } from 'react';
import { supabase as supabaseClient } from '@/integrations/supabase/client';
const supabase = supabaseClient as any;
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, Pencil, Trash2, User } from 'lucide-react';

interface CrmAgent {
  id: string;
  client_id: string;
  name: string;
  email: string;
  role: string | null;
  avatar_url: string | null;
}

interface Props {
  clientId: string;
}

export const CrmAgentsManager = ({ clientId }: Props) => {
  const [agents, setAgents] = useState<CrmAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<CrmAgent | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'Atendimento', avatar_url: '' });
  const { toast } = useToast();

  const fetchAgents = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('crm_agents').select('*').eq('client_id', clientId).order('name');
    if (error) toast({ title: 'Erro ao carregar agentes', variant: 'destructive' });
    else setAgents((data as CrmAgent[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, [clientId]);

  const openCreate = () => {
    setEditingAgent(null);
    setForm({ name: '', email: '', role: 'Atendimento', avatar_url: '' });
    setDialogOpen(true);
  };

  const openEdit = (agent: CrmAgent) => {
    setEditingAgent(agent);
    setForm({ name: agent.name, email: agent.email, role: agent.role || '', avatar_url: agent.avatar_url || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast({ title: 'Nome e email são obrigatórios', variant: 'destructive' });
      return;
    }
    if (editingAgent) {
      const { error } = await supabase.from('crm_agents').update({
        name: form.name.trim(), email: form.email.trim(),
        role: form.role.trim() || null, avatar_url: form.avatar_url.trim() || null,
      }).eq('id', editingAgent.id);
      if (error) toast({ title: 'Erro ao atualizar', variant: 'destructive' });
      else toast({ title: 'Agente atualizado' });
    } else {
      const { error } = await supabase.from('crm_agents').insert({
        client_id: clientId, name: form.name.trim(), email: form.email.trim(),
        role: form.role.trim() || null, avatar_url: form.avatar_url.trim() || null,
      });
      if (error) toast({ title: 'Erro ao criar agente', description: error.message, variant: 'destructive' });
      else toast({ title: 'Agente criado' });
    }
    setDialogOpen(false);
    fetchAgents();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('crm_agents').delete().eq('id', id);
    if (error) toast({ title: 'Erro ao excluir', variant: 'destructive' });
    else { toast({ title: 'Agente removido' }); fetchAgents(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Equipe</h3>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Agente
        </Button>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users className="mb-4 h-12 w-12 opacity-30" />
          <p className="text-sm">Nenhum agente cadastrado</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="p-4 rounded-xl border border-border/40 bg-card/60">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary overflow-hidden">
                  {agent.avatar_url ? (
                    <img src={agent.avatar_url} alt={agent.name} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground truncate">{agent.name}</h4>
                  <p className="text-sm text-muted-foreground truncate">{agent.email}</p>
                  {agent.role && <p className="text-xs text-primary mt-0.5">{agent.role}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(agent)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(agent.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAgent ? 'Editar Agente' : 'Novo Agente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Email *" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Cargo</label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Atendimento">Atendimento</SelectItem>
                  <SelectItem value="Administrativo">Administrativo</SelectItem>
                  <SelectItem value="Super Administrativo">Super Administrativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="URL da foto (opcional)" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} />
            <Button onClick={handleSave} className="w-full">{editingAgent ? 'Salvar' : 'Criar Agente'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
