import { useState } from 'react';
import { useClients, Client } from '@/hooks/useClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Index from '@/pages/Index';
import LoadingScreen from '@/components/LoadingScreen';
import { RefreshCw } from 'lucide-react';

const AdminDashboard = () => {
  const { clients, loading } = useClients();
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [activeClientId, setActiveClientId] = useState<string>('');

  const selectedClient = clients.find(c => c.id === activeClientId);

  const handleApply = () => {
    setActiveClientId(selectedClientId);
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="space-y-4">
      {/* Client selector bar */}
      <Card className="flex items-center gap-4 p-4">
        <span className="text-sm font-medium text-muted-foreground">Visualizar conta:</span>
        <Select value={selectedClientId} onValueChange={setSelectedClientId}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Selecionar cliente..." />
          </SelectTrigger>
          <SelectContent>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleApply} disabled={!selectedClientId || selectedClientId === activeClientId} size="sm">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Filtrar
        </Button>
        {selectedClient && (
          <span className="text-xs text-muted-foreground">/d/{selectedClient.helena_company_id || selectedClient.slug}</span>
        )}
      </Card>

      {!activeClientId ? (
        <Card className="py-20 text-center text-muted-foreground">
          Selecione um cliente acima e clique em "Filtrar" para visualizar o dashboard.
        </Card>
      ) : (
        <div key={activeClientId} className="rounded-xl border border-border bg-background overflow-visible">
          <Index
            clientId={activeClientId}
            clientName={selectedClient?.name}
            features={selectedClient?.features}
            basePath="/admin/dashboard"
            embedded
            allowedNumbers={(selectedClient as any)?.allowed_numbers || []}
          />
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
