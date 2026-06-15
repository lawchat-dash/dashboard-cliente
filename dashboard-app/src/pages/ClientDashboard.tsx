import { useParams } from 'react-router-dom';
import { ShieldAlert, Mail } from 'lucide-react';
import { useClient } from '@/hooks/useClient';
import Index from '@/pages/Index';
import LoadingScreen from '@/components/LoadingScreen';

const ClientDashboard = () => {
  const { slug } = useParams();
  const { client, loading } = useClient(slug);

  if (loading) return <LoadingScreen />;

  // Sem cliente cadastrado/ativo para este link → tela de acesso não liberado.
  // NÃO mostra erro técnico nem vaza dado nenhum; apenas orienta a falar com o suporte.
  if (!client) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
          <img
            src="/lawchat-logo-light-bg.png"
            alt="LawChat"
            className="mx-auto mb-6 h-9 w-auto object-contain dark:hidden"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--kpi-amber))]/10">
            <ShieldAlert className="h-8 w-8 text-[hsl(var(--kpi-amber))]" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Acesso não liberado</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Seu painel ainda não está disponível. Entre em contato com o suporte para liberar o acesso a este dashboard.
          </p>
          <a
            href="mailto:contatolawchat@gmail.com?subject=Liberação%20de%20acesso%20ao%20Dashboard"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Mail className="h-4 w-4" /> Falar com o suporte
          </a>
          <p className="mt-4 text-xs text-muted-foreground/70">LawChat — Dashboard Comercial</p>
        </div>
      </div>
    );
  }

  return <Index clientId={client.id} clientName={client.name} features={client.features} basePath={`/d/${slug}`} allowedNumbers={client.allowed_numbers || []} allowedPanels={(client as any).panel_ids || []} />;
};

export default ClientDashboard;
