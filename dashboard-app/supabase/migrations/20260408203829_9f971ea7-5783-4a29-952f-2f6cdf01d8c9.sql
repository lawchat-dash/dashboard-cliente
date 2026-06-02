
-- Create notification status enum
CREATE TYPE public.crm_notification_status AS ENUM ('new', 'read', 'pending', 'resolved', 'urgent');

-- Create CRM agents table (per client)
CREATE TABLE public.crm_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'Atendimento',
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read crm_agents" ON public.crm_agents FOR SELECT USING (true);
CREATE POLICY "Anyone can insert crm_agents" ON public.crm_agents FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update crm_agents" ON public.crm_agents FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete crm_agents" ON public.crm_agents FOR DELETE USING (true);

-- Create CRM notifications table
CREATE TABLE public.crm_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status crm_notification_status NOT NULL DEFAULT 'new',
  source TEXT,
  metadata JSONB,
  assigned_agent_id UUID REFERENCES public.crm_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read crm_notifications" ON public.crm_notifications FOR SELECT USING (true);
CREATE POLICY "Anyone can insert crm_notifications" ON public.crm_notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update crm_notifications" ON public.crm_notifications FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete crm_notifications" ON public.crm_notifications FOR DELETE USING (true);

-- Create CRM conversations table
CREATE TABLE public.crm_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES public.crm_notifications(id) ON DELETE CASCADE,
  sender TEXT NOT NULL DEFAULT 'agent',
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read crm_conversations" ON public.crm_conversations FOR SELECT USING (true);
CREATE POLICY "Anyone can insert crm_conversations" ON public.crm_conversations FOR INSERT WITH CHECK (true);

-- Create CRM internal notes table
CREATE TABLE public.crm_internal_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES public.crm_notifications(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read crm_internal_notes" ON public.crm_internal_notes FOR SELECT USING (true);
CREATE POLICY "Anyone can insert crm_internal_notes" ON public.crm_internal_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete crm_internal_notes" ON public.crm_internal_notes FOR DELETE USING (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_notifications;
