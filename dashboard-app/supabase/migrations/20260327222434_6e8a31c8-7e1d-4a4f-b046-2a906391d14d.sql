
-- Create notification_settings table
CREATE TABLE public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phone text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  report_time text NOT NULL DEFAULT '08:00',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read notification_settings" ON public.notification_settings FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert notification_settings" ON public.notification_settings FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update notification_settings" ON public.notification_settings FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete notification_settings" ON public.notification_settings FOR DELETE TO public USING (true);

-- Create zapi_config table
CREATE TABLE public.zapi_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  instance_id text NOT NULL DEFAULT '',
  instance_token text NOT NULL DEFAULT '',
  client_token text NOT NULL DEFAULT '',
  report_template text NOT NULL DEFAULT '📊 *Relatório Diário - {client_name}*
📅 {date}

📌 *Resumo do Funil:*
• Total de Leads: {total_leads}
• SDR: {sdr}
• Closer: {closer}
• Contrato: {contrato}
• Assinatura: {assinatura}
• ✅ Assinados: {assinado}
• ❌ Desqualificados: {desqualificado}
• 📈 Taxa de Conversão: {conversion_rate}%',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.zapi_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage zapi_config" ON public.zapi_config FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can read zapi_config" ON public.zapi_config FOR SELECT TO public USING (true);
