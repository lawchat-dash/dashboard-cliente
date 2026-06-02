import { useParams } from 'react-router-dom';
import { useClient } from '@/hooks/useClient';
import Index from '@/pages/Index';
import LoadingScreen from '@/components/LoadingScreen';

const ClientDashboard = () => {
  const { slug } = useParams();
  const { client, loading } = useClient(slug);

  if (loading) return <LoadingScreen />;

  if (!client) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-foreground">Dashboard não encontrado</h2>
          <p className="text-muted-foreground">Verifique o link e tente novamente.</p>
        </div>
      </div>
    );
  }

  return <Index clientId={client.id} clientName={client.name} features={client.features} basePath={`/d/${slug}`} allowedNumbers={client.allowed_numbers || []} allowedPanels={(client as any).panel_ids || []} />;
};

export default ClientDashboard;
