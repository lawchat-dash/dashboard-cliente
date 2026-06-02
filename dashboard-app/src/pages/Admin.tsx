import { useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import AdminSidebar from '@/components/AdminSidebar';
import AdminClients from '@/pages/AdminClients';
import AdminOverview from '@/pages/AdminOverview';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminSettings from '@/pages/AdminSettings';
import AdminSync from '@/pages/AdminSync';
import LoadingScreen from '@/components/LoadingScreen';
import Index from '@/pages/Index';
import { useClient } from '@/hooks/useClient';

const Admin = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [loading, user, navigate]);

  if (loading) return <LoadingScreen />;
  if (!user) return null;

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-foreground">Acesso Negado</h2>
          <p className="text-muted-foreground">Você não tem permissão de administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex-1 overflow-y-auto h-screen">
        <div className="mx-auto max-w-[1600px] p-5 md:p-6">
          <Routes>
            <Route index element={<AdminOverview />} />
            <Route path="clients" element={<AdminClients />} />
            <Route path="dashboard/*" element={<AdminDashboard />} />
            <Route path="sync" element={<AdminSync />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="client/:slug/*" element={<ClientDashboardAdmin />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

const ClientDashboardAdmin = () => {
  const { slug } = useParams();
  const { client, loading } = useClient(slug);

  if (loading) return <LoadingScreen />;
  if (!client) return <p className="text-muted-foreground">Cliente não encontrado.</p>;

  return (
    <div>
      <div className="mb-4 rounded-lg bg-primary/5 p-3">
        <p className="text-sm text-muted-foreground">Visualizando dashboard de: <strong className="text-foreground">{client.name}</strong></p>
      </div>
      <Index clientId={client.id} clientName={client.name} features={client.features} basePath={`/admin/client/${slug}`} allowedNumbers={(client as any).allowed_numbers || []} allowedPanels={(client as any).panel_ids || []} />
    </div>
  );
};

export default Admin;
