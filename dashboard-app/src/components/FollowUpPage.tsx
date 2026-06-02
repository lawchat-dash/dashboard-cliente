import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card as HelenaCard, Session } from '@/api/helena';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Activity, BarChart3, Clock, MessageCircle, Mail, Search,
  Users, TrendingUp, Zap, Target, Eye, ChevronDown,
  ArrowRight, AlertTriangle, CheckCircle2, Send, RefreshCw,
  Timer, Sparkles, ArrowUpRight, Loader2, FileText, XCircle,
  CalendarClock, LayoutGrid, Hash, TrendingDown, ExternalLink, UserX, Ghost
} from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ptBR } from 'date-fns/locale';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell
} from 'recharts';

// ─── Types matching webhook payload ───
interface FollowUpPageProps {
  cards: HelenaCard[];
  sessions: Session[];
  clientId?: string;
  features?: { templates_api?: boolean };
  dateStart?: string;
  dateEnd?: string;
}

interface SnapshotKpis {
  hoje_total: number;
  amanha_agendados: number;
  taxa_resposta_pct: number;
  media_por_lead: number;
  fecharam_contrato: number;
  tempo_medio_resposta_segundos: number | null;
}

interface SnapshotFunil {
  enviados: number;
  responderam: number;
  avancaram: number;
  fecharam_contrato: number;
}

interface VolumeDiario {
  dia: string;
  total_enviados: number;
  responderam: number;
  avancaram: number;
}

interface Cadencia {
  cadence_step: number;
  cadence_name: string;
  total_disparos: number;
  responderam: number;
  taxa_resposta_pct: number;
  tempo_medio_horas: number | null;
}

interface HeatmapCell {
  dia_semana: number;
  hora: number;
  total_respostas: number;
}

interface TimelineEvent {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  card_id: string | null;
  department: string | null;
  agente?: string | null;
  cadence_name: string;
  cadence_step: number;
  channel: string;
  message_preview: string | null;
  template_name: string | null;
  template_error: string | null;
  template_status: string | null;
  status: string;
  sent_at: string;
  responded_at: string | null;
  response_time_seconds: number | null;
  lead_advanced: boolean;
  lead_closed_contract: boolean;
  notes: string | null;
}

interface LeadData {
  card_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  department: string | null;
  agente?: string | null;
  total_disparos: number;
  responderam: number;
  ultima_etapa: number;
  primeiro_disparo: string;
  ultimo_disparo: string;
  ultima_resposta: string | null;
  lead_advanced: boolean;
  lead_closed_contract: boolean;
  tempo_medio_resposta_horas: number | null;
}

interface TemplateData {
  template_name: string;
  template_status: string;
  template_error: string | null;
  template_content: string | null;
  total_enviados: number;
  responderam: number;
  taxa_resposta_pct: number;
  tempo_medio_horas: number | null;
}

interface SnapshotData {
  kpis: SnapshotKpis;
  funil: SnapshotFunil;
  volume_diario: VolumeDiario[];
  cadencias: Cadencia[];
  heatmap: HeatmapCell[];
  timeline: TimelineEvent[];
  por_lead: LeadData[];
  templates: TemplateData[];
}

type KpiDrillDown = 'today' | 'tomorrow' | 'responded' | 'leads' | 'contracts' | null;

const STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  sent: { label: 'Enviado', color: 'hsl(var(--kpi-blue))', emoji: '📤' },
  delivered: { label: 'Entregue', color: 'hsl(var(--kpi-cyan))', emoji: '✅' },
  read: { label: 'Lido', color: 'hsl(var(--kpi-amber))', emoji: '👀' },
  responded: { label: 'Respondido', color: 'hsl(var(--kpi-emerald))', emoji: '💬' },
  failed: { label: 'Falhou', color: 'hsl(var(--destructive))', emoji: '❌' },
};

const DEPT_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  sdr: { label: 'SDR', color: 'hsl(var(--kpi-blue))', emoji: '📞' },
  closer: { label: 'Closer', color: 'hsl(var(--kpi-violet))', emoji: '🛒' },
  contrato: { label: 'Contrato', color: 'hsl(var(--kpi-amber))', emoji: '📄' },
};

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function formatCadenceName(name: string): string {
  return name.replace('followup_', '').replace('_', ' ').replace('hora', 'hora').replace('horas', 'horas');
}

function formatResponseTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  const hours = (seconds / 3600).toFixed(1);
  return `${hours}h`;
}

function formatTemplateDept(name: string): { dept: string; cleanName: string } {
  const match = name.match(/^\[([^\]]+)\]\s*(.+)$/);
  const raw = match ? match[2] : name;
  // Remove leading underscores from template name
  const cleanName = raw.replace(/^_+/, '');
  if (match) return { dept: match[1], cleanName };
  return { dept: '', cleanName };
}

// ─── Mock data based on the briefing ───
const MOCK_SNAPSHOT: SnapshotData = {
  kpis: {
    hoje_total: 32,
    amanha_agendados: 12,
    taxa_resposta_pct: 48.5,
    media_por_lead: 1.5,
    fecharam_contrato: 2,
    tempo_medio_resposta_segundos: 245412,
  },
  funil: {
    enviados: 268,
    responderam: 130,
    avancaram: 52,
    fecharam_contrato: 2,
  },
  volume_diario: [
    { dia: '2026-03-21T03:00:00.000Z', total_enviados: 21, responderam: 21, avancaram: 11 },
    { dia: '2026-03-22T03:00:00.000Z', total_enviados: 45, responderam: 31, avancaram: 8 },
    { dia: '2026-03-23T03:00:00.000Z', total_enviados: 70, responderam: 50, avancaram: 19 },
    { dia: '2026-03-24T03:00:00.000Z', total_enviados: 36, responderam: 26, avancaram: 11 },
    { dia: '2026-03-25T03:00:00.000Z', total_enviados: 28, responderam: 14, avancaram: 5 },
    { dia: '2026-03-26T03:00:00.000Z', total_enviados: 38, responderam: 22, avancaram: 9 },
    { dia: '2026-03-27T03:00:00.000Z', total_enviados: 42, responderam: 28, avancaram: 14 },
    { dia: '2026-03-28T03:00:00.000Z', total_enviados: 32, responderam: 2, avancaram: 13 },
  ],
  cadencias: [
    { cadence_step: 1, cadence_name: 'followup_1_hora', total_disparos: 73, responderam: 65, taxa_resposta_pct: 89.0, tempo_medio_horas: 69.9 },
    { cadence_step: 2, cadence_name: 'followup_5_horas', total_disparos: 52, responderam: 44, taxa_resposta_pct: 84.6, tempo_medio_horas: 63.2 },
    { cadence_step: 3, cadence_name: 'followup_24_horas', total_disparos: 6, responderam: 6, taxa_resposta_pct: 100.0, tempo_medio_horas: 90.8 },
    { cadence_step: 4, cadence_name: 'followup_72_horas', total_disparos: 26, responderam: 15, taxa_resposta_pct: 57.7, tempo_medio_horas: 66.2 },
    { cadence_step: 5, cadence_name: 'followup_168_horas', total_disparos: 70, responderam: 0, taxa_resposta_pct: 0.0, tempo_medio_horas: null },
    { cadence_step: 6, cadence_name: 'followup_360_horas', total_disparos: 41, responderam: 0, taxa_resposta_pct: 0.0, tempo_medio_horas: null },
  ],
  heatmap: [
    { dia_semana: 1, hora: 9, total_respostas: 12 },
    { dia_semana: 1, hora: 10, total_respostas: 18 },
    { dia_semana: 1, hora: 14, total_respostas: 8 },
    { dia_semana: 1, hora: 15, total_respostas: 6 },
    { dia_semana: 2, hora: 8, total_respostas: 8 },
    { dia_semana: 2, hora: 9, total_respostas: 14 },
    { dia_semana: 2, hora: 11, total_respostas: 10 },
    { dia_semana: 2, hora: 14, total_respostas: 7 },
    { dia_semana: 3, hora: 9, total_respostas: 11 },
    { dia_semana: 3, hora: 10, total_respostas: 16 },
    { dia_semana: 3, hora: 15, total_respostas: 9 },
    { dia_semana: 4, hora: 5, total_respostas: 13 },
    { dia_semana: 4, hora: 9, total_respostas: 15 },
    { dia_semana: 4, hora: 10, total_respostas: 20 },
    { dia_semana: 4, hora: 14, total_respostas: 11 },
    { dia_semana: 5, hora: 5, total_respostas: 39 },
    { dia_semana: 5, hora: 9, total_respostas: 22 },
    { dia_semana: 5, hora: 10, total_respostas: 17 },
    { dia_semana: 5, hora: 14, total_respostas: 12 },
    { dia_semana: 5, hora: 16, total_respostas: 5 },
    { dia_semana: 6, hora: 9, total_respostas: 8 },
    { dia_semana: 6, hora: 10, total_respostas: 6 },
  ],
  timeline: [
    { id: '1', contact_name: 'Maah Zanette', contact_phone: '5569992101036', card_id: 'dba1c971', department: 'sdr', cadence_name: 'followup_72_horas', cadence_step: 4, channel: 'whatsapp', message_preview: 'Oi, Maah! Tudo bem?', template_name: '[SDR]_Mensagem01_3dias_Lawchat', template_error: null, template_status: 'sent', status: 'sent', sent_at: '2026-03-28T19:02:23.929Z', responded_at: null, response_time_seconds: null, lead_advanced: false, lead_closed_contract: false, notes: null },
    { id: '2', contact_name: 'Carlos Eduardo Silva', contact_phone: '5511987654321', card_id: 'abc123', department: 'sdr', cadence_name: 'followup_1_hora', cadence_step: 1, channel: 'whatsapp', message_preview: 'Olá Carlos!', template_name: '[SDR]_Mensagem01_1hora_Lawchat', template_error: null, template_status: 'sent', status: 'responded', sent_at: '2026-03-28T18:45:00.000Z', responded_at: '2026-03-28T19:15:00.000Z', response_time_seconds: 1800, lead_advanced: true, lead_closed_contract: false, notes: null },
    { id: '3', contact_name: 'Ana Paula Ferreira', contact_phone: '5521998877665', card_id: 'def456', department: 'closer', cadence_name: 'followup_5_horas', cadence_step: 2, channel: 'whatsapp', message_preview: 'Ana, boa tarde!', template_name: '[CLOSER]_Mensagem01_5horas_Lawchat', template_error: null, template_status: 'sent', status: 'responded', sent_at: '2026-03-28T17:30:00.000Z', responded_at: '2026-03-28T18:05:00.000Z', response_time_seconds: 2100, lead_advanced: true, lead_closed_contract: false, notes: null },
    { id: '4', contact_name: 'Roberto Santos', contact_phone: '5531991234567', card_id: 'ghi789', department: 'contrato', cadence_name: 'followup_24_horas', cadence_step: 3, channel: 'whatsapp', message_preview: 'Roberto, bom dia!', template_name: '[CONTRATO]_Mensagem01_24horas_Lawchat', template_error: null, template_status: 'sent', status: 'responded', sent_at: '2026-03-27T15:00:00.000Z', responded_at: '2026-03-28T08:30:00.000Z', response_time_seconds: 63000, lead_advanced: true, lead_closed_contract: true, notes: null },
    { id: '5', contact_name: 'Juliana Martins', contact_phone: '5541987655432', card_id: 'jkl012', department: 'sdr', cadence_name: 'followup_168_horas', cadence_step: 5, channel: 'whatsapp', message_preview: 'Juliana, faz uma semana!', template_name: '[SDR]_Mensagem01_7dias_Lawchat', template_error: null, template_status: 'sent', status: 'sent', sent_at: '2026-03-28T14:00:00.000Z', responded_at: null, response_time_seconds: null, lead_advanced: false, lead_closed_contract: false, notes: null },
    { id: '6', contact_name: 'Pedro Henrique Lima', contact_phone: '5561998765432', card_id: 'mno345', department: 'sdr', cadence_name: 'followup_1_hora', cadence_step: 1, channel: 'whatsapp', message_preview: 'Pedro, tudo bem?', template_name: null, template_error: null, template_status: null, status: 'responded', sent_at: '2026-03-28T16:20:00.000Z', responded_at: '2026-03-28T16:35:00.000Z', response_time_seconds: 900, lead_advanced: false, lead_closed_contract: false, notes: null },
    { id: '7', contact_name: 'Fernanda Costa', contact_phone: '5511996543210', card_id: 'pqr678', department: 'closer', cadence_name: 'followup_72_horas', cadence_step: 4, channel: 'whatsapp', message_preview: 'Fernanda, não esqueci de você!', template_name: '[CLOSER]_Mensagem01_3dias_Lawchat', template_error: null, template_status: 'sent', status: 'sent', sent_at: '2026-03-28T13:00:00.000Z', responded_at: null, response_time_seconds: null, lead_advanced: false, lead_closed_contract: false, notes: null },
    { id: '8', contact_name: 'Lucas Oliveira', contact_phone: '5571994321876', card_id: 'stu901', department: 'sdr', cadence_name: 'followup_5_horas', cadence_step: 2, channel: 'whatsapp', message_preview: 'Lucas, voltando aqui!', template_name: '[SDR]_Mensagem02_5horas_Lawchat', template_error: null, template_status: 'sent', status: 'responded', sent_at: '2026-03-28T11:00:00.000Z', responded_at: '2026-03-28T12:15:00.000Z', response_time_seconds: 4500, lead_advanced: true, lead_closed_contract: false, notes: null },
  ],
  por_lead: [
    { card_id: '859db9cb', contact_name: 'Mayra Lima da Silva Leopoldino', contact_phone: '5512992506264', department: 'sdr', total_disparos: 5, responderam: 5, ultima_etapa: 2, primeiro_disparo: '2026-03-27T13:02:32.069Z', ultimo_disparo: '2026-03-27T22:32:44.761Z', ultima_resposta: '2026-03-28T08:02:14.000Z', lead_advanced: true, lead_closed_contract: false, tempo_medio_resposta_horas: 14.6 },
    { card_id: 'abc123', contact_name: 'Carlos Eduardo Silva', contact_phone: '5511987654321', department: 'sdr', total_disparos: 3, responderam: 3, ultima_etapa: 3, primeiro_disparo: '2026-03-25T10:00:00.000Z', ultimo_disparo: '2026-03-28T18:45:00.000Z', ultima_resposta: '2026-03-28T19:15:00.000Z', lead_advanced: true, lead_closed_contract: false, tempo_medio_resposta_horas: 2.1 },
    { card_id: 'def456', contact_name: 'Ana Paula Ferreira', contact_phone: '5521998877665', department: 'closer', total_disparos: 4, responderam: 4, ultima_etapa: 4, primeiro_disparo: '2026-03-22T09:00:00.000Z', ultimo_disparo: '2026-03-28T17:30:00.000Z', ultima_resposta: '2026-03-28T18:05:00.000Z', lead_advanced: true, lead_closed_contract: false, tempo_medio_resposta_horas: 5.3 },
    { card_id: 'ghi789', contact_name: 'Roberto Santos', contact_phone: '5531991234567', department: 'contrato', total_disparos: 6, responderam: 6, ultima_etapa: 6, primeiro_disparo: '2026-03-20T14:00:00.000Z', ultimo_disparo: '2026-03-27T15:00:00.000Z', ultima_resposta: '2026-03-28T08:30:00.000Z', lead_advanced: true, lead_closed_contract: true, tempo_medio_resposta_horas: 17.5 },
    { card_id: 'jkl012', contact_name: 'Juliana Martins', contact_phone: '5541987655432', department: 'sdr', total_disparos: 5, responderam: 0, ultima_etapa: 5, primeiro_disparo: '2026-03-21T11:00:00.000Z', ultimo_disparo: '2026-03-28T14:00:00.000Z', ultima_resposta: null, lead_advanced: false, lead_closed_contract: false, tempo_medio_resposta_horas: null },
    { card_id: 'mno345', contact_name: 'Pedro Henrique Lima', contact_phone: '5561998765432', department: 'sdr', total_disparos: 1, responderam: 1, ultima_etapa: 1, primeiro_disparo: '2026-03-28T16:20:00.000Z', ultimo_disparo: '2026-03-28T16:20:00.000Z', ultima_resposta: '2026-03-28T16:35:00.000Z', lead_advanced: false, lead_closed_contract: false, tempo_medio_resposta_horas: 0.25 },
    { card_id: 'pqr678', contact_name: 'Fernanda Costa', contact_phone: '5511996543210', department: 'closer', total_disparos: 4, responderam: 2, ultima_etapa: 4, primeiro_disparo: '2026-03-22T10:00:00.000Z', ultimo_disparo: '2026-03-28T13:00:00.000Z', ultima_resposta: '2026-03-26T09:00:00.000Z', lead_advanced: false, lead_closed_contract: false, tempo_medio_resposta_horas: 48.2 },
    { card_id: 'stu901', contact_name: 'Lucas Oliveira', contact_phone: '5571994321876', department: 'sdr', total_disparos: 2, responderam: 2, ultima_etapa: 2, primeiro_disparo: '2026-03-28T11:00:00.000Z', ultimo_disparo: '2026-03-28T11:00:00.000Z', ultima_resposta: '2026-03-28T12:15:00.000Z', lead_advanced: true, lead_closed_contract: false, tempo_medio_resposta_horas: 1.25 },
    { card_id: 'vwx234', contact_name: 'Mariana Alves', contact_phone: '5581993456789', department: 'contrato', total_disparos: 7, responderam: 7, ultima_etapa: 7, primeiro_disparo: '2026-03-18T08:00:00.000Z', ultimo_disparo: '2026-03-26T10:00:00.000Z', ultima_resposta: '2026-03-26T14:00:00.000Z', lead_advanced: true, lead_closed_contract: true, tempo_medio_resposta_horas: 8.4 },
  ],
  templates: [
    { template_name: '[SDR]_Mensagem01_15dias_Lawchat', template_status: 'approved', template_error: null, template_content: 'sdr_msg01_15d_lc', total_enviados: 38, responderam: 12, taxa_resposta_pct: 31.6, tempo_medio_horas: 4.2 },
    { template_name: '[SDR]_Mensagem02_15dias_Lawchat', template_status: 'approved', template_error: null, template_content: 'sdr_msg02_15d_lc', total_enviados: 31, responderam: 9, taxa_resposta_pct: 29.0, tempo_medio_horas: 6.8 },
    { template_name: '[SDR]_Mensagem03_15dias_Lawchat', template_status: 'approved', template_error: null, template_content: 'sdr_msg03_15d_lc', total_enviados: 25, responderam: 5, taxa_resposta_pct: 20.0, tempo_medio_horas: 8.1 },
    { template_name: '[SDR]_Mensagem04_15dias_Lawchat', template_status: 'paused', template_error: 'Template pausado pela Meta: qualidade baixa', template_content: 'sdr_msg04_15d_lc', total_enviados: 18, responderam: 2, taxa_resposta_pct: 11.1, tempo_medio_horas: 12.3 },
    { template_name: '[CLOSER]_Mensagem01_7dias_Lawchat', template_status: 'approved', template_error: null, template_content: 'closer_msg01_7d_lc', total_enviados: 22, responderam: 14, taxa_resposta_pct: 63.6, tempo_medio_horas: 2.1 },
    { template_name: '[CLOSER]_Mensagem02_7dias_Lawchat', template_status: 'approved', template_error: null, template_content: 'closer_msg02_7d_lc', total_enviados: 15, responderam: 8, taxa_resposta_pct: 53.3, tempo_medio_horas: 3.5 },
    { template_name: '[CONTRATO]_Mensagem01_3dias_Lawchat', template_status: 'approved', template_error: null, template_content: 'contrato_msg01_3d_lc', total_enviados: 10, responderam: 8, taxa_resposta_pct: 80.0, tempo_medio_horas: 1.4 },
    { template_name: '[CONTRATO]_Mensagem02_3dias_Lawchat', template_status: 'error', template_error: 'Limite de envio diário atingido pela Meta', template_content: 'contrato_msg02_3d_lc', total_enviados: 5, responderam: 3, taxa_resposta_pct: 60.0, tempo_medio_horas: 2.8 },
  ],
};

const FollowUpPage = ({ cards, sessions, clientId, features }: FollowUpPageProps) => {
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'live' | 'templates' | 'distribution' | 'leads' | 'heatmap' | 'saturation' | 'graveyard' | 'preview'>('overview');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<number>(7);
  const [kpiDrillDown, setKpiDrillDown] = useState<KpiDrillDown>(null);
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const [minAmostra, setMinAmostra] = useState<number>(5);
  const [agenteFilter, setAgenteFilter] = useState<string>('all');
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [leadSearch, setLeadSearch] = useState('');
  const [graveyardGroupBy, setGraveyardGroupBy] = useState<'none' | 'etapa' | 'dept'>('none');
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<string>('all');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [graveyardSearch, setGraveyardSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateStatusFilter, setTemplateStatusFilter] = useState<string>('all');
  const [chartLayout, setChartLayout] = useState<'horizontal' | 'vertical'>('horizontal');
  const [colWidths, setColWidths] = useState<number[]>([40, 80, 180, 140, 80, 70, 80, 100, 90]);

  const loadSnapshot = useCallback(async (isRefresh = false) => {
    if (!clientId) {
      setSnapshot(null);
      setGeradoEm(null);
      setLoading(false);
      return;
    }
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/ai-followup-webhook?client_id=${clientId}&periodo_dias=${periodFilter}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      const json = await res.json();
      if (json.ok && json.snapshot?.data) {
        setSnapshot(json.snapshot.data as SnapshotData);
        setGeradoEm(json.snapshot.gerado_em);
      } else {
        setSnapshot(null);
        setGeradoEm(null);
      }
    } catch (e) {
      console.error('Error loading followup snapshot:', e);
      setSnapshot(null);
      setGeradoEm(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientId, periodFilter]);

  const hasLoadedOnce = React.useRef(false);
  useEffect(() => {
    if (hasLoadedOnce.current) {
      loadSnapshot(true);
    } else {
      loadSnapshot();
      hasLoadedOnce.current = true;
    }
  }, [loadSnapshot]);

  // ─── Derived: filter timeline/leads by agente ───
  const normalizeAgente = (agente: string | null | undefined, department: string | null | undefined): string => {
    // Prioriza o campo agente
    if (agente) {
      const a = agente.trim().toLowerCase();
      if (a === 'sdr') return 'sdr';
      if (a === 'closer') return 'closer';
      if (a === 'contrato') return 'contrato';
      return a;
    }
    // Fallback para department
    if (!department) return '';
    const d = department.replace(/[^\w\sÀ-ÿ]/g, '').trim().toLowerCase();
    if (d.includes('sdr')) return 'sdr';
    if (d.includes('closer') || d.includes('comercial')) return 'closer';
    if (d.includes('contrato')) return 'contrato';
    return d;
  };

  const filteredTimeline = useMemo(() => {
    if (!snapshot?.timeline) return [];
    if (deptFilter === 'all') return snapshot.timeline;
    return snapshot.timeline.filter(e => normalizeAgente(e.agente, e.department) === deptFilter);
  }, [snapshot?.timeline, deptFilter]);

  const filteredLeads = useMemo(() => {
    if (!snapshot?.por_lead) return [];
    if (deptFilter === 'all') return snapshot.por_lead;
    return snapshot.por_lead.filter(l => normalizeAgente(l.agente, l.department) === deptFilter);
  }, [snapshot?.por_lead, deptFilter]);

  const filteredTemplates = useMemo(() => {
    if (!snapshot?.templates) return [];
    if (deptFilter === 'all') return snapshot.templates;
    return snapshot.templates.filter(t => {
      const { dept } = formatTemplateDept(t.template_name);
      return dept.toLowerCase() === deptFilter;
    });
  }, [snapshot?.templates, deptFilter]);

  const filteredCadencias = useMemo(() => {
    if (!snapshot?.cadencias) return [];
    return snapshot.cadencias;
  }, [snapshot?.cadencias]);

  // ─── Drilldown leads ───
  const drillDownLeads = useMemo(() => {
    if (!kpiDrillDown || !snapshot) return [];
    let leads = filteredLeads;
    // Also filter by agente if selected
    if (agenteFilter !== 'all') {
      leads = leads.filter(l => {
        const a = l.agente?.replace(/[^\w\sÀ-ÿ]/g, '').trim();
        return a === agenteFilter;
      });
    }
    switch (kpiDrillDown) {
      case 'today':
      case 'tomorrow':
      case 'leads':
        return leads;
      case 'responded':
        return leads.filter(l => l.responderam > 0);
      case 'contracts':
        return leads.filter(l => l.lead_closed_contract);
      default:
        return leads;
    }
  }, [kpiDrillDown, snapshot, filteredLeads, agenteFilter]);

  // ─── Heatmap grid ───
  const heatmapGrid = useMemo(() => {
    if (!snapshot?.heatmap) return { grid: Array(7).fill(null).map(() => Array(24).fill(0)), max: 0 };
    const grid = Array(7).fill(null).map(() => Array(24).fill(0));
    let max = 0;
    snapshot.heatmap.forEach(cell => {
      if (cell.dia_semana >= 0 && cell.dia_semana < 7 && cell.hora >= 0 && cell.hora < 24) {
        grid[cell.dia_semana][cell.hora] = cell.total_respostas;
        if (cell.total_respostas > max) max = cell.total_respostas;
      }
    });
    return { grid, max };
  }, [snapshot?.heatmap]);

  // ─── Volume chart data ───
  const volumeChartData = useMemo(() => {
    if (!snapshot?.volume_diario) return [];
    return snapshot.volume_diario.map(v => ({
      dia: format(new Date(v.dia), 'dd/MM'),
      total_enviados: v.total_enviados,
      responderam: v.responderam,
      avancaram: v.avancaram,
    }));
  }, [snapshot?.volume_diario]);

  // ─── Cadence step labels from actual data ───
  const cadenceNameByStep = useMemo(() => {
    const map = new Map<number, string>();
    if (snapshot?.cadencias) {
      snapshot.cadencias.forEach(c => {
        if (!map.has(c.cadence_step)) {
          map.set(c.cadence_step, formatCadenceName(c.cadence_name));
        }
      });
    }
    return map;
  }, [snapshot?.cadencias]);

  const getCadenceLabel = useCallback((step: number): string => {
    return cadenceNameByStep.get(step) || `Etapa ${step}`;
  }, [cadenceNameByStep]);

  const CADENCE_STEP_LABELS: Record<number, string> = {
    1: 'Follow-up 1 Hora',
    2: 'Follow-up 5 Horas',
    3: 'Follow-up 24 Horas',
    4: 'Follow-up 72 Horas',
    5: 'Follow-up 7 Dias',
    6: 'Follow-up 15 Dias',
    7: 'Follow-up 30 Dias',
  };

  // ─── Saturation curve data with statistical scoring ───
  const saturationData = useMemo(() => {
    if (!snapshot?.cadencias) return [];

    // Build from existing cadencias
    const cadMap = new Map<number, typeof snapshot.cadencias[0]>();
    snapshot.cadencias.forEach(c => cadMap.set(c.cadence_step, c));

    // Always show all 7 steps
    const totalSteps = Math.max(7, ...snapshot.cadencias.map(c => c.cadence_step));
    const steps = [];
    for (let i = 1; i <= totalSteps; i++) {
      const c = cadMap.get(i);
      const taxa = c ? c.taxa_resposta_pct : 0;
      const disparos = c ? c.total_disparos : 0;
      const responderam = c ? c.responderam : 0;
      const score = disparos > 0 ? taxa * Math.log(disparos + 1) : 0;
      const stepLabel = CADENCE_STEP_LABELS[i] || `Follow-up etapa ${i}`;
      steps.push({
        step: stepLabel,
        name: c ? formatCadenceName(c.cadence_name) : stepLabel,
        disparos,
        responderam,
        taxa,
        score: Math.round(score * 100) / 100,
        dropOff: disparos > 0 ? Math.round(((disparos - responderam) / disparos) * 100) : 0,
        belowMin: false,
      });
    }
    return steps;
  }, [snapshot?.cadencias]);

  // ─── Graveyard leads (completed all cadences, never responded) ───
  const graveyardLeads = useMemo(() => {
    if (!snapshot?.por_lead) return [];
    const maxStep = snapshot.cadencias?.length || 7;
    return filteredLeads.filter(l =>
      l.responderam === 0 && l.total_disparos >= 2
    );
  }, [snapshot?.por_lead, snapshot?.cadencias, filteredLeads]);

  // ─── Preview: find session for card to get chat URL ───
  // Only works when sessions have a matching card_id AND a real session id
  const getPreviewUrl = useCallback((cardId: string | null, phone?: string | null): string | null => {
    // Try matching by card_id first
    if (cardId) {
      const session = sessions.find(s => s.cardId === cardId);
      if (session?.id) return `https://advmidia.wts.chat/chat2/sessions/${session.id}/preview`;
    }
    // Fallback: match by contact_phone
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      const session = sessions.find(s => {
        const sp = (s.contactPhone || '').replace(/\D/g, '');
        return sp && (sp === cleanPhone || sp.endsWith(cleanPhone.slice(-10)) || cleanPhone.endsWith(sp.slice(-10)));
      });
      if (session?.id) return `https://advmidia.wts.chat/chat2/sessions/${session.id}/preview`;
    }
    return null;
  }, [sessions]);

  const previewLeadData = previewCardId ? filteredLeads.find(l => l.card_id === previewCardId) : null;
  const activePreviewUrl = previewCardId ? getPreviewUrl(previewCardId, previewLeadData?.contact_phone) : null;

  // ─── Navigate to Conversas tab ───
  const goToConversas = useCallback((cardId: string | null) => {
    setPreviewCardId(cardId);
    setActiveTab('preview');
  }, []);

  // ─── Unique agents list ───
  const uniqueAgentes = useMemo(() => {
    if (!snapshot?.timeline) return [];
    const agentes = new Set<string>();
    snapshot.timeline.forEach(e => {
      const a = e.agente?.replace(/[^\w\sÀ-ÿ]/g, '').trim();
      if (a) agentes.add(a);
    });
    return Array.from(agentes).sort();
  }, [snapshot?.timeline]);

  // ─── Filtered funnel by agent ───
  const filteredFunil = useMemo(() => {
    if (!snapshot) return { enviados: 0, responderam: 0, avancaram: 0, fecharam_contrato: 0 };

    // Use filteredLeads (already filtered by deptFilter) for accurate per-lead dedup
    const leadsToUse = agenteFilter === 'all'
      ? filteredLeads
      : filteredLeads.filter(l => {
          const a = l.agente?.replace(/[^\w\sÀ-ÿ]/g, '').trim();
          return a === agenteFilter;
        });

    // Total enviados = sum of all leads' total_disparos (not timeline length which is capped at 50)
    const enviados = leadsToUse.reduce((sum, l) => sum + l.total_disparos, 0);

    // Dedup leads: avançaram and contrato should count unique leads, not events
    const responderam = leadsToUse.filter(l => l.responderam > 0).length;
    const avancaram = leadsToUse.filter(l => l.lead_advanced).length;
    const fecharam = leadsToUse.filter(l => l.lead_closed_contract).length;

    // Avançaram can never exceed responderam
    return {
      enviados,
      responderam,
      avancaram: Math.min(avancaram, responderam),
      fecharam_contrato: Math.min(fecharam, avancaram, responderam),
    };
  }, [snapshot, agenteFilter, filteredLeads]);

  // ─── Template events lookup (uses full por_lead data + timeline) ───
  const templateEvents = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    // First add from timeline
    if (snapshot?.timeline) {
      snapshot.timeline.forEach(e => {
        if (!e.template_name) return;
        if (!map.has(e.template_name)) map.set(e.template_name, []);
        map.get(e.template_name)!.push(e);
      });
    }
    // Also add from por_lead (has more complete data beyond first 50 timeline items)
    if (snapshot?.por_lead) {
      Object.values(snapshot.por_lead).forEach((lead: any) => {
        if (!Array.isArray(lead.eventos)) return;
        lead.eventos.forEach((e: any) => {
          if (!e.template_name) return;
          const existing = map.get(e.template_name);
          const alreadyHas = existing?.some(ex => ex.id === e.id);
          if (!alreadyHas) {
            if (!map.has(e.template_name)) map.set(e.template_name, []);
            map.get(e.template_name)!.push(e);
          }
        });
      });
    }
    return map;
  }, [snapshot?.timeline, snapshot?.por_lead]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Bot className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm">Nenhum dado de follow-up recebido ainda.</p>
        <button onClick={() => loadSnapshot()} className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <RefreshCw className="h-4 w-4 inline mr-2" />Tentar novamente
        </button>
      </div>
    );
  }

  const kpis = snapshot.kpis;
  const funil = snapshot.funil;

  return (
    <div className="space-y-5">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Monitor de Follow-up IA</h2>
            <p className="text-xs text-muted-foreground">
              {geradoEm ? `Atualizado em ${format(new Date(geradoEm), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}` : 'Acompanhe as cadências automáticas'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Department filter */}
          <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg">
            {['all', 'sdr', 'closer', 'contrato'].map(d => (
              <button
                key={d}
                onClick={() => setDeptFilter(d)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  deptFilter === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {d === 'all' ? 'Todos' : DEPT_CONFIG[d]?.label || d}
              </button>
            ))}
          </div>

          {/* Period filter */}
          <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg">
            {[{ v: 1, l: '24h' }, { v: 7, l: '7d' }, { v: 30, l: '30d' }].map(p => (
              <button
                key={p.v}
                onClick={() => setPeriodFilter(p.v)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  periodFilter === p.v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.l}
              </button>
            ))}
          </div>

          <button onClick={() => loadSnapshot(true)} className="p-2 rounded-lg bg-muted hover:bg-accent transition-colors">
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {([
          { label: 'Hoje', value: kpis.hoje_total, icon: Zap, color: 'text-[hsl(var(--kpi-amber))]', bg: 'bg-[hsl(var(--kpi-amber))]/10', sub: 'follow-ups hoje', drill: 'today' as KpiDrillDown },
          { label: 'Total', value: filteredFunil.enviados, icon: Send, color: 'text-[hsl(var(--kpi-blue))]', bg: 'bg-[hsl(var(--kpi-blue))]/10', sub: `follow-ups no período (${periodFilter}d)`, drill: 'today' as KpiDrillDown },
          { label: 'Amanhã', value: kpis.amanha_agendados, icon: CalendarClock, color: 'text-[hsl(var(--kpi-cyan))]', bg: 'bg-[hsl(var(--kpi-cyan))]/10', sub: 'agendados', drill: 'tomorrow' as KpiDrillDown },
          { label: 'Taxa Resposta', value: `${filteredFunil.enviados > 0 ? ((filteredFunil.responderam / filteredFunil.enviados) * 100).toFixed(1) : 0}%`, icon: MessageCircle, color: 'text-[hsl(var(--kpi-emerald))]', bg: 'bg-[hsl(var(--kpi-emerald))]/10', sub: `${filteredFunil.responderam} de ${filteredFunil.enviados}`, drill: 'responded' as KpiDrillDown },
          { label: 'Média por Lead', value: kpis.media_por_lead, icon: Hash, color: 'text-[hsl(var(--kpi-amber))]', bg: 'bg-[hsl(var(--kpi-amber))]/10', sub: 'disparos por lead', drill: 'leads' as KpiDrillDown },
          { label: 'Contratos', value: filteredFunil.fecharam_contrato, icon: CheckCircle2, color: 'text-[hsl(var(--kpi-emerald))]', bg: 'bg-[hsl(var(--kpi-emerald))]/10', sub: 'leads fecharam', drill: 'contracts' as KpiDrillDown },
          { label: 'Tempo Resposta', value: formatResponseTime(kpis.tempo_medio_resposta_segundos), icon: Timer, color: 'text-[hsl(var(--kpi-violet))]', bg: 'bg-[hsl(var(--kpi-violet))]/10', sub: 'tempo médio', drill: null as KpiDrillDown },
        ]).map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => kpi.drill && setKpiDrillDown(kpiDrillDown === kpi.drill ? null : kpi.drill)}
            className={`rounded-xl border bg-card p-3.5 shadow-sm transition-colors ${
              kpi.drill ? 'cursor-pointer hover:bg-muted/40' : ''
            } ${kpiDrillDown === kpi.drill ? 'border-primary ring-1 ring-primary/30' : 'border-border'}`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${kpi.bg}`}>
                <kpi.icon className={`h-3.5 w-3.5 ${kpi.color}`} />
              </div>
              {kpi.drill ? (
                <Eye className={`h-3 w-3 ${kpiDrillDown === kpi.drill ? 'text-primary' : 'text-muted-foreground/30'}`} />
              ) : (
                <Sparkles className="h-3 w-3 text-muted-foreground/30" />
              )}
            </div>
            <p className="text-xl font-bold text-foreground">{kpi.value}</p>
            <p className="text-[10px] text-muted-foreground font-medium">{kpi.label}</p>
            <p className="text-[9px] text-muted-foreground/70">{kpi.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* ─── KPI Drilldown ─── */}
      <AnimatePresence>
        {kpiDrillDown && drillDownLeads.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-primary/20 bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  {kpiDrillDown === 'today' && 'Todos os Follow-ups do Período'}
                  {kpiDrillDown === 'tomorrow' && 'Follow-ups Agendados para Amanhã'}
                  {kpiDrillDown === 'responded' && 'Leads que Responderam'}
                  {kpiDrillDown === 'leads' && 'Todos os Leads'}
                  {kpiDrillDown === 'contracts' && 'Leads que Fecharam Contrato'}
                  <span className="text-xs font-normal text-muted-foreground ml-1">({drillDownLeads.length})</span>
                </h3>
                <button onClick={() => setKpiDrillDown(null)} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors">
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
              <ScrollArea className="w-full" type="auto">
                <div className="min-w-[500px]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Contato</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Telefone</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Depto</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Disparos</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Etapa</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Status</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Tempo Resp.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillDownLeads.slice(0, 50).map((lead, idx) => {
                      const dept = lead.department ? DEPT_CONFIG[lead.department.toLowerCase()] : null;
                      return (
                        <tr key={idx} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-2 font-medium text-foreground">{lead.contact_name || '—'}</td>
                          <td className="py-2 px-2">
                            {lead.contact_phone ? (
                              <UITooltip>
                                <TooltipTrigger asChild>
                                  <button className="text-primary hover:underline flex items-center gap-1 text-xs">
                                    <MessageCircle className="h-3 w-3" />
                                    {lead.contact_phone}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-[320px] p-3">
                                  <p className="text-[10px] font-medium text-muted-foreground mb-1">📤 Última mensagem enviada:</p>
                                  <p className="text-xs text-foreground">
                                    {(() => {
                                      const evt = snapshot?.timeline?.find(e =>
                                        (e.contact_phone === lead.contact_phone || e.card_id === lead.card_id) && e.message_preview
                                      );
                                      return evt?.message_preview || 'Mensagem não disponível';
                                    })()}
                                  </p>
                                </TooltipContent>
                              </UITooltip>
                            ) : '—'}
                          </td>
                          <td className="py-2 px-2">
                            {dept ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: dept.color + '20', color: dept.color }}>
                                {dept.emoji} {dept.label}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-foreground">{lead.responderam}/{lead.total_disparos}</span>
                              <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-[hsl(var(--kpi-emerald))]" style={{ width: `${lead.total_disparos > 0 ? (lead.responderam / lead.total_disparos) * 100 : 0}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-muted-foreground">
                            {(() => {
                              const cadName = getCadenceLabel(lead.ultima_etapa);
                              return `Etapa ${lead.ultima_etapa} (${cadName})`;
                            })()}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1">
                              {lead.lead_closed_contract && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--kpi-emerald))]/10 text-[hsl(var(--kpi-emerald))] font-medium">Contrato</span>}
                              {lead.lead_advanced && !lead.lead_closed_contract && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--kpi-emerald))]/10 text-[hsl(var(--kpi-emerald))] font-medium">Avançou</span>}
                              {!lead.lead_advanced && !lead.lead_closed_contract && <span className="text-[10px] text-muted-foreground">Em progresso</span>}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-muted-foreground">
                            {lead.tempo_medio_resposta_horas != null ? `${lead.tempo_medio_resposta_horas}h` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Tabs ─── */}
      <ScrollArea className="w-full" type="auto">
        <div className="flex gap-1 bg-muted p-1 rounded-xl">
          {([
            { id: 'overview' as const, label: 'Visão Geral', icon: LayoutGrid },
            { id: 'live' as const, label: 'Timeline', icon: Activity },
            { id: 'templates' as const, label: 'Templates', icon: FileText },
            { id: 'distribution' as const, label: 'Distribuição', icon: BarChart3 },
            { id: 'heatmap' as const, label: 'Heatmap', icon: BarChart3 },
            { id: 'leads' as const, label: 'Por Lead', icon: Users },
            { id: 'saturation' as const, label: 'Saturação', icon: TrendingDown },
            { id: 'graveyard' as const, label: 'Cemitério', icon: UserX },
            { id: 'preview' as const, label: 'Conversas', icon: MessageCircle },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* ═══════════ TAB: Overview ═══════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Funnel */}
           <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" /> {agenteFilter !== 'all' ? `Funil: ${agenteFilter.charAt(0).toUpperCase() + agenteFilter.slice(1)}` : 'Funil: Follow-up'}
              </h3>
              {uniqueAgentes.length > 0 && (
                <select
                  value={agenteFilter}
                  onChange={e => setAgenteFilter(e.target.value)}
                  className="h-7 rounded-md border border-input bg-background px-2 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="all">Todos agentes</option>
                  {uniqueAgentes.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              {[
                { name: 'Enviados', value: filteredFunil.enviados, color: 'hsl(var(--kpi-blue))' },
                { name: 'Responderam', value: filteredFunil.responderam, color: 'hsl(var(--kpi-emerald))' },
                { name: 'Avançaram', value: filteredFunil.avancaram, color: 'hsl(var(--kpi-violet))' },
                { name: 'Contrato', value: filteredFunil.fecharam_contrato, color: 'hsl(var(--kpi-amber))' },
              ].map((stage, i, arr) => {
              const maxVal = filteredFunil.enviados || 1;
                const width = Math.max(15, (stage.value / maxVal) * 100);
                const convPct = i > 0 && maxVal > 0
                  ? ((stage.value / maxVal) * 100).toFixed(1) + '%'
                  : null;
                return (
                  <div key={stage.name} className="flex items-center gap-1" style={{ flex: `${width} 1 0` }}>
                    <div className="flex-1 rounded-lg py-4 text-center transition-all" style={{ backgroundColor: stage.color + '15' }}>
                      <p className="text-2xl font-bold" style={{ color: stage.color }}>{stage.value}</p>
                      <p className="text-[10px] text-muted-foreground font-medium">{stage.name}</p>
                      {convPct && (
                        <p className="text-[9px] mt-0.5" style={{ color: stage.color }}>{convPct} conversão</p>
                      )}
                    </div>
                    {i < arr.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Volume + Cadences */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Volume Chart */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> Volume Diário
              </h3>
              {volumeChartData.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Sem dados de volume</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={volumeChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <RechartsTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="total_enviados" name="Enviados" stroke="hsl(var(--kpi-blue))" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="responderam" name="Responderam" stroke="hsl(var(--kpi-emerald))" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="avancaram" name="Avançaram" stroke="hsl(var(--kpi-violet))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Cadence Performance */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Performance por Cadência
              </h3>
              {filteredCadencias.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Nenhuma cadência registrada</p>
              ) : (
                <ScrollArea className="max-h-64 overflow-auto" type="always">
                  <div className="space-y-3 pr-3">
                  {filteredCadencias.map(cadence => {
                    const respRate = cadence.taxa_resposta_pct;
                    const barColor = respRate >= 70 ? 'hsl(var(--kpi-emerald))' : respRate >= 40 ? 'hsl(var(--kpi-amber))' : 'hsl(var(--destructive))';
                    return (
                      <div key={cadence.cadence_step} className="rounded-lg border border-border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">#{cadence.cadence_step}</span>
                            <span className="text-xs font-medium text-foreground">{formatCadenceName(cadence.cadence_name)}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {cadence.responderam}/{cadence.total_disparos} respondidos / disparos
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${respRate}%`, backgroundColor: barColor }} />
                          </div>
                          <span className="text-xs font-bold" style={{ color: barColor }}>{respRate}%</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-[10px] text-muted-foreground">
                          <span>Tempo médio: {cadence.tempo_medio_horas != null ? `${cadence.tempo_medio_horas}h` : '—'}</span>
                        </div>
                      </div>
                    );
                   })}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ TAB: Timeline ═══════════ */}
      {activeTab === 'live' && (
        <div className="space-y-3">
          {/* Timeline filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={timelineSearch}
                onChange={e => setTimelineSearch(e.target.value)}
                placeholder="Buscar por nome, telefone..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-0.5 bg-muted p-0.5 rounded-lg">
              {[
                { v: 'all', l: 'Todos' },
                { v: 'sent', l: 'Enviados' },
                { v: 'responded', l: 'Respondidos' },
                { v: 'failed', l: 'Falhas' },
              ].map(s => (
                <button
                  key={s.v}
                  onClick={() => setTimelineStatusFilter(s.v)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                    timelineStatusFilter === s.v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s.l}
                </button>
              ))}
            </div>
          </div>
          {(() => {
            const searchLower = timelineSearch.toLowerCase().trim();
            let events = filteredTimeline;
            if (timelineStatusFilter === 'responded') events = events.filter(e => e.responded_at);
            else if (timelineStatusFilter === 'sent') events = events.filter(e => !e.responded_at && e.status !== 'failed' && e.status !== 'error');
            else if (timelineStatusFilter === 'failed') events = events.filter(e => e.status === 'failed' || e.status === 'error' || e.template_error);
            if (searchLower) {
              events = events.filter(e =>
                (e.contact_name || '').toLowerCase().includes(searchLower) ||
                (e.contact_phone || '').includes(searchLower) ||
                (e.template_name || '').toLowerCase().includes(searchLower)
              );
            }
            if (events.length === 0) return (
              <div className="text-center py-16 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum evento encontrado.</p>
              </div>
            );
            return (
              <div className="space-y-2">
              {events.map((event, i) => {
                const st = STATUS_CONFIG[event.status] || STATUS_CONFIG.sent;
                const dept = event.department ? DEPT_CONFIG[event.department.toLowerCase()] : null;
                const cadenceLabel = formatCadenceName(event.cadence_name);
                return (
                  <motion.div
                    key={event.id || i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold text-primary-foreground shrink-0 ${
                        event.lead_closed_contract ? 'bg-[hsl(var(--kpi-emerald))]' : event.lead_advanced ? 'bg-[hsl(var(--kpi-emerald))]' : 'bg-muted-foreground/60'
                      }`}>
                        {(event.contact_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{event.contact_name || event.contact_phone || 'Desconhecido'}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: st.color + '20', color: st.color }}>
                            {st.emoji} {st.label}
                          </span>
                          {dept && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: dept.color + '20', color: dept.color }}>
                              {dept.label}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">{cadenceLabel} · Etapa {event.cadence_step}</span>
                        </div>

                        {event.template_name ? (
                          <p className="text-[10px] text-muted-foreground mt-0.5">📋 {event.template_name}</p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground mt-0.5">🤖 Mensagem IA</p>
                        )}

                        {event.message_preview && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {event.message_preview.length > 80 ? event.message_preview.slice(0, 80) + '…' : event.message_preview}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                          <span>{format(new Date(event.sent_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                          {event.response_time_seconds != null && (
                            <span className="flex items-center gap-0.5"><Timer className="h-3 w-3" />{formatResponseTime(event.response_time_seconds)}</span>
                          )}
                          {event.lead_advanced && (
                            <span className="flex items-center gap-0.5 text-[hsl(var(--kpi-emerald))]"><ArrowUpRight className="h-3 w-3" /> Avançou</span>
                          )}
                          {event.lead_closed_contract && (
                            <span className="flex items-center gap-0.5 text-[hsl(var(--kpi-emerald))]"><CheckCircle2 className="h-3 w-3" /> Contrato</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════ TAB: Templates ═══════════ */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          {filteredTemplates.length === 0 && !templateSearch && templateStatusFilter === 'all' ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum dado de template registrado.</p>
            </div>
          ) : (
            <>
              {/* KPI resumo inline */}
              <div className="grid grid-cols-5 gap-3">
                {(() => {
                  const totalAll = filteredTemplates.reduce((a, t) => a + t.total_enviados, 0);
                  const errorCount = filteredTemplates.filter(t => t.template_error || t.template_status === 'error' || t.template_status === 'paused' || t.template_status === 'failed').reduce((a, t) => a + t.total_enviados, 0);
                  const enviadosSemErro = totalAll - errorCount;
                  const respostas = filteredTemplates.reduce((a, t) => a + t.responderam, 0);
                  const taxa = enviadosSemErro > 0 ? `${((respostas / enviadosSemErro) * 100).toFixed(1)}%` : '0%';
                  return [
                    { label: 'Templates Utilizados', value: filteredTemplates.length, color: 'hsl(var(--foreground))' },
                    { label: 'Total (c/ erros)', value: totalAll, color: 'hsl(var(--muted-foreground))' },
                    { label: 'Enviados', value: enviadosSemErro, color: 'hsl(var(--kpi-blue))' },
                    { label: 'Respostas', value: respostas, color: 'hsl(var(--kpi-emerald))' },
                    { label: 'Taxa Média', value: taxa, color: 'hsl(var(--kpi-amber))' },
                  ];
                })().map((kpi, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-3 text-center">
                    <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* Search + Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={e => setTemplateSearch(e.target.value)}
                    placeholder="Buscar por nome, código Meta, etapa..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex items-center gap-0.5 bg-muted p-0.5 rounded-lg">
                  {[
                    { v: 'all', l: 'Todos' },
                    { v: 'approved', l: '✅ Aprovado' },
                    { v: 'paused', l: '⏸️ Pausado' },
                    { v: 'error', l: '❌ Erro' },
                    { v: 'sent', l: '📤 Enviado' },
                  ].map(s => (
                    <button
                      key={s.v}
                      onClick={() => setTemplateStatusFilter(s.v)}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                        templateStatusFilter === s.v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabela com colunas redimensionáveis */}
              {(() => {
                const searchLower = templateSearch.toLowerCase().trim();
                let visibleTemplates = filteredTemplates;
                if (searchLower) {
                  visibleTemplates = visibleTemplates.filter(t => {
                    const { dept, cleanName } = formatTemplateDept(t.template_name);
                    return cleanName.toLowerCase().includes(searchLower) ||
                      (t.template_content || '').toLowerCase().includes(searchLower) ||
                      dept.toLowerCase().includes(searchLower) ||
                      t.template_name.toLowerCase().includes(searchLower);
                  });
                }
                if (templateStatusFilter !== 'all') {
                  visibleTemplates = visibleTemplates.filter(t => {
                    const st = t.template_status || 'sent';
                    if (templateStatusFilter === 'error') return st === 'error' || st === 'failed' || !!t.template_error;
                    return st === templateStatusFilter;
                  });
                }

                const COL_HEADERS = ['#', 'Etapa', 'Nome', 'Código Meta', 'Status', 'Envios', 'Respostas', 'Taxa', 'Tempo Médio'];

                const handleMouseDown = (colIdx: number, startX: number) => {
                  const startW = colWidths[colIdx];
                  const onMove = (e: MouseEvent) => {
                    const diff = e.clientX - startX;
                    setColWidths(prev => {
                      const next = [...prev];
                      next[colIdx] = Math.max(40, startW + diff);
                      return next;
                    });
                  };
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                  };
                  document.body.style.cursor = 'col-resize';
                  document.body.style.userSelect = 'none';
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                };

                return (
                  <div className="rounded-lg border border-border bg-card overflow-hidden">
                    {visibleTemplates.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Nenhum template encontrado</p>
                        {templateSearch && <p className="text-xs mt-1">Tente refinar sua busca</p>}
                      </div>
                    ) : (
                    <ScrollArea className="w-full" type="auto">
                      <div style={{ minWidth: colWidths.reduce((a, b) => a + b, 0) + 'px' }}>
                        {/* Header com divisórias arrastáveis */}
                        <div className="flex items-center bg-muted/40 border-b border-border">
                          {COL_HEADERS.map((h, ci) => (
                            <div
                              key={ci}
                              className="relative flex items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-2.5 select-none"
                              style={{ width: colWidths[ci], minWidth: colWidths[ci], flexShrink: 0 }}
                            >
                              {h}
                              {ci < COL_HEADERS.length - 1 && (
                                <div
                                  className="absolute right-0 top-1 bottom-1 w-[3px] cursor-col-resize hover:bg-primary/50 active:bg-primary rounded transition-colors"
                                  onMouseDown={e => handleMouseDown(ci, e.clientX)}
                                  style={{ borderRight: '1px solid hsl(var(--border))' }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        {/* Rows */}
                        {visibleTemplates.map((tpl, i) => {
                          const { dept, cleanName } = formatTemplateDept(tpl.template_name);
                          const deptConfig = dept ? DEPT_CONFIG[dept.toLowerCase()] : null;
                          const respRate = tpl.taxa_resposta_pct;
                          const barColor = respRate >= 60 ? 'hsl(var(--kpi-emerald))' : respRate >= 30 ? 'hsl(var(--kpi-amber))' : 'hsl(var(--destructive))';
                          const statusMap: Record<string, { bg: string; text: string; label: string }> = {
                            approved: { bg: 'bg-[hsl(142_76%_36%)]/10', text: 'text-[hsl(142_76%_36%)]', label: '✅ Aprovado' },
                            paused: { bg: 'bg-[hsl(var(--kpi-amber))]/10', text: 'text-[hsl(var(--kpi-amber))]', label: '⏸️ Pausado' },
                            error: { bg: 'bg-destructive/10', text: 'text-destructive', label: '❌ Erro' },
                            failed: { bg: 'bg-destructive/10', text: 'text-destructive', label: '❌ Falhou' },
                            delivered: { bg: 'bg-[hsl(var(--kpi-cyan))]/10', text: 'text-[hsl(var(--kpi-cyan))]', label: '📦 Entregue' },
                          };
                          const st = statusMap[tpl.template_status] || { bg: 'bg-muted', text: 'text-muted-foreground', label: '📤 ' + (tpl.template_status || 'Enviado') };

                          return (
                            <React.Fragment key={tpl.template_name}>
                              <div
                                className="flex items-center border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
                                onClick={() => setExpandedTemplate(expandedTemplate === tpl.template_name ? null : tpl.template_name)}
                              >
                                <div className="px-2 py-2.5 text-xs text-muted-foreground font-medium flex items-center gap-1" style={{ width: colWidths[0], minWidth: colWidths[0], flexShrink: 0 }}>
                                  <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${expandedTemplate === tpl.template_name ? 'rotate-180' : ''}`} />
                                  {i + 1}
                                </div>
                                <div className="px-2 py-2.5" style={{ width: colWidths[1], minWidth: colWidths[1], flexShrink: 0 }}>
                                  {deptConfig ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap" style={{ backgroundColor: deptConfig.color + '18', color: deptConfig.color }}>
                                      {deptConfig.emoji} {deptConfig.label}
                                    </span>
                                  ) : <span className="text-[10px] text-muted-foreground">—</span>}
                                </div>
                                <div className="px-2 py-2.5 overflow-hidden" style={{ width: colWidths[2], minWidth: colWidths[2], flexShrink: 0 }}>
                                  <span className="text-xs font-medium text-foreground truncate block" title={tpl.template_name}>{cleanName}</span>
                                </div>
                                <div className="px-2 py-2.5 overflow-hidden" style={{ width: colWidths[3], minWidth: colWidths[3], flexShrink: 0 }}>
                                  <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono truncate block">{tpl.template_content || '—'}</code>
                                </div>
                                <div className="px-2 py-2.5" style={{ width: colWidths[4], minWidth: colWidths[4], flexShrink: 0 }}>
                                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${st.bg} ${st.text}`}>{st.label}</span>
                                </div>
                                <div className="px-2 py-2.5 text-sm font-semibold text-foreground text-center" style={{ width: colWidths[5], minWidth: colWidths[5], flexShrink: 0 }}>{tpl.total_enviados}</div>
                                <div className="px-2 py-2.5 text-sm font-semibold text-center" style={{ width: colWidths[6], minWidth: colWidths[6], flexShrink: 0, color: 'hsl(var(--kpi-emerald))' }}>{tpl.responderam}</div>
                                <div className="px-2 py-2.5 flex items-center gap-2" style={{ width: colWidths[7], minWidth: colWidths[7], flexShrink: 0 }}>
                                  <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${Math.min(respRate, 100)}%`, backgroundColor: barColor }} />
                                  </div>
                                  <span className="text-xs font-bold" style={{ color: barColor }}>{respRate}%</span>
                                </div>
                                <div className="px-2 py-2.5 text-xs text-foreground text-right" style={{ width: colWidths[8], minWidth: colWidths[8], flexShrink: 0 }}>
                                  {tpl.tempo_medio_horas != null ? `${tpl.tempo_medio_horas}h` : '—'}
                                </div>
                              </div>
                              {expandedTemplate === tpl.template_name && (() => {
                                const events = templateEvents.get(tpl.template_name) || [];
                                return (
                                  <div className="bg-muted/20 border-b border-border px-4 py-3">
                                    <p className="text-[10px] font-semibold text-muted-foreground mb-2">Envios associados ({events.length})</p>
                                    {events.length === 0 ? (
                                      <p className="text-[10px] text-muted-foreground">Nenhum envio individual encontrado na timeline</p>
                                    ) : (
                                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                        <AnimatePresence>
                                        {events.slice(0, 30).map((evt, eIdx) => {
                                          const evtSt = STATUS_CONFIG[evt.status] || STATUS_CONFIG.sent;
                                          return (
                                            <motion.div
                                              key={evt.id || eIdx}
                                              initial={{ opacity: 0, height: 0 }}
                                              animate={{ opacity: 1, height: 'auto' }}
                                              exit={{ opacity: 0, height: 0 }}
                                              transition={{ duration: 0.2, ease: 'easeInOut' }}
                                              className="flex items-center justify-between gap-2 text-[10px] rounded-md bg-background p-2"
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: evtSt.color + '20', color: evtSt.color }}>
                                                  {evtSt.emoji} {evtSt.label}
                                                </span>
                                                <span className="font-medium text-foreground truncate">{evt.contact_name || evt.contact_phone || 'Desconhecido'}</span>
                                                {evt.contact_phone && <span className="text-muted-foreground">{evt.contact_phone}</span>}
                                              </div>
                                              <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-muted-foreground">{format(new Date(evt.sent_at), "dd/MM HH:mm")}</span>
                                                {evt.responded_at && <span className="text-[hsl(var(--kpi-emerald))]">✅ {format(new Date(evt.responded_at), "dd/MM HH:mm")}</span>}
                                                {evt.card_id && (
                                                  <button onClick={(e) => { e.stopPropagation(); goToConversas(evt.card_id); }} className="text-primary hover:underline">
                                                    <ExternalLink className="h-3 w-3" />
                                                  </button>
                                                )}
                                              </div>
                                            </motion.div>
                                          );
                                        })}
                                        </AnimatePresence>
                                        {events.length > 30 && <p className="text-[9px] text-muted-foreground text-center pt-1">... e mais {events.length - 30} envios</p>}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </React.Fragment>
                          );
                        })}
                      </div>
                      <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                    )}
                  </div>
                );
              })()}

              {/* Gráfico Enviados vs Respondidos com toggle */}
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" /> Enviados vs Respondidos
                  </h3>
                  <div className="flex items-center gap-0.5 bg-muted p-0.5 rounded-lg">
                    <button onClick={() => setChartLayout('horizontal')} className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${chartLayout === 'horizontal' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      ═ Horizontal
                    </button>
                    <button onClick={() => setChartLayout('vertical')} className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${chartLayout === 'vertical' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                      ║ Vertical
                    </button>
                  </div>
                </div>
                {(() => {
                  const chartData = filteredTemplates.slice(0, 10).map(t => ({
                    name: formatTemplateDept(t.template_name).cleanName.replace(/_/g, ' ').slice(0, 22),
                    enviados: t.total_enviados,
                    respondidos: t.responderam,
                  }));
                  return (
                    <div className={chartLayout === 'vertical' ? 'h-80' : 'h-64'}>
                      <ResponsiveContainer width="100%" height="100%">
                        {chartLayout === 'horizontal' ? (
                          <BarChart layout="vertical" data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }} barCategoryGap="25%" barGap={2}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                            <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10, fill: 'hsl(var(--foreground))', fontWeight: 500 }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                            <RechartsTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12, padding: '10px 14px' }} cursor={{ fill: 'hsl(var(--muted))' }} />
                            <Bar dataKey="enviados" name="Enviados" fill="hsl(var(--kpi-blue))" radius={[0, 4, 4, 0]} barSize={14} />
                            <Bar dataKey="respondidos" name="Respondidos" fill="hsl(var(--kpi-emerald))" radius={[0, 4, 4, 0]} barSize={14} />
                          </BarChart>
                        ) : (
                          <BarChart data={chartData} margin={{ left: 10, right: 10, top: 5, bottom: 40 }} barCategoryGap="20%" barGap={3}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--foreground))', fontWeight: 500 }} axisLine={{ stroke: 'hsl(var(--border))' }} angle={-35} textAnchor="end" interval={0} height={60} />
                            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} />
                            <RechartsTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12, padding: '10px 14px' }} cursor={{ fill: 'hsl(var(--muted))' }} />
                            <Bar dataKey="enviados" name="Enviados" fill="hsl(var(--kpi-blue))" radius={[4, 4, 0, 0]} barSize={20} />
                            <Bar dataKey="respondidos" name="Respondidos" fill="hsl(var(--kpi-emerald))" radius={[4, 4, 0, 0]} barSize={20} />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
                <div className="flex items-center justify-center gap-6 mt-3 pt-3 border-t border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--kpi-blue))' }} />
                    <span className="text-xs font-medium text-foreground">Enviados</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(var(--kpi-emerald))' }} />
                    <span className="text-xs font-medium text-foreground">Respondidos</span>
                  </div>
                </div>
              </div>

              {/* Gráfico de Pizza / Donut inline */}
              {(() => {
                const COLORS = ['hsl(var(--kpi-blue))', 'hsl(var(--kpi-emerald))', 'hsl(var(--kpi-amber))', 'hsl(var(--primary))', 'hsl(var(--kpi-violet))', 'hsl(var(--destructive))', 'hsl(var(--kpi-cyan))', 'hsl(142 76% 36%)'];
                const totalEnvios = filteredTemplates.reduce((a, t) => a + t.total_enviados, 0);
                const pieData = filteredTemplates.map((t, i) => {
                  const { cleanName } = formatTemplateDept(t.template_name);
                  const displayName = cleanName.replace(/_lawchat$/i, '').replace(/_Lawchat$/i, '').replace(/_/g, ' ');
                  return { name: displayName, value: t.total_enviados, responderam: t.responderam, taxa: t.total_enviados > 0 ? Math.round((t.responderam / t.total_enviados) * 100) : 0, fill: COLORS[i % COLORS.length] };
                });
                if (pieData.length === 0) return null;
                return (
                  <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" /> Distribuição de Envios
                    </h3>
                    <div className="grid lg:grid-cols-[1fr_1fr] gap-6 items-start">
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={2} dataKey="value" onMouseEnter={(_, idx) => setHoveredSlice(idx)} onMouseLeave={() => setHoveredSlice(null)} stroke="hsl(var(--background))" strokeWidth={2}>
                              {pieData.map((entry, index) => (
                                <Cell key={index} fill={entry.fill} opacity={hoveredSlice !== null && hoveredSlice !== index ? 0.35 : 1} style={{ cursor: 'pointer', transition: 'opacity 0.2s ease' }} />
                              ))}
                            </Pie>
                            <RechartsTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12, padding: '10px 14px' }} formatter={(value: number, name: string) => [`${value} envios (${totalEnvios > 0 ? ((value / totalEnvios) * 100).toFixed(1) : 0}%)`, name]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-1.5">
                        {pieData.map((item, idx) => {
                          const pct = totalEnvios > 0 ? ((item.value / totalEnvios) * 100).toFixed(1) : '0';
                          const isActive = hoveredSlice === idx;
                          return (
                            <div key={idx} onMouseEnter={() => setHoveredSlice(idx)} onMouseLeave={() => setHoveredSlice(null)} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${isActive ? 'border-primary/40 bg-primary/5 scale-[1.01]' : 'border-transparent hover:bg-muted/40'}`}>
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                                <p className="text-[10px] text-muted-foreground">{item.value} env · {item.responderam} resp · <span style={{ color: item.fill }}>{item.taxa}%</span></p>
                              </div>
                              <span className="text-xs font-bold text-foreground shrink-0">{pct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Templates com problema */}
              {(() => {
                const errorEvents = (snapshot?.timeline || []).filter(
                  (evt: TimelineEvent) => evt.template_error || evt.status === 'error' || evt.template_status === 'error' || evt.template_status === 'paused' || evt.template_status === 'failed'
                );
                const templateErrors = filteredTemplates.filter(t => t.template_error);
                const allErrors = errorEvents.length > 0 ? errorEvents : [];
                if (allErrors.length === 0 && templateErrors.length === 0) return null;
                return (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" /> Envios com Falha
                      <span className="ml-auto text-[11px] font-normal text-muted-foreground">{allErrors.length > 0 ? allErrors.length : templateErrors.length} ocorrência(s)</span>
                    </h3>
                    <div className="space-y-3">
                      {allErrors.length > 0 ? allErrors.map((evt: TimelineEvent) => {
                        const phone = evt.contact_phone || '';
                        const formattedPhone = phone.replace(/^55/, '+55 ').replace(/(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');
                        const { cleanName } = formatTemplateDept(evt.template_name || 'Template desconhecido');
                        const isPaused = evt.template_status === 'paused';
                        return (
                          <div key={evt.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isPaused ? 'bg-[hsl(var(--kpi-amber))]/10' : 'bg-destructive/10'}`}>
                                  <XCircle className={`h-4 w-4 ${isPaused ? 'text-[hsl(var(--kpi-amber))]' : 'text-destructive'}`} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{evt.contact_name || 'Sem nome'}</p>
                                  <div className="flex flex-col gap-0.5 mt-0.5">
                                    <div className="flex items-center gap-1.5">
                                      <MessageCircle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                      <span className="text-[10px] text-muted-foreground">Canal:</span>
                                      <span className="text-[11px] text-muted-foreground capitalize font-medium">{evt.channel}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-muted-foreground ml-[18px]">Telefone:</span>
                                      <span className="text-[11px] text-muted-foreground font-mono">{formattedPhone || '—'}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold flex-shrink-0 ${isPaused ? 'bg-[hsl(var(--kpi-amber))]/10 text-[hsl(var(--kpi-amber))] border border-[hsl(var(--kpi-amber))]/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                                {isPaused ? 'Pausado' : evt.template_status || 'Erro'}
                              </span>
                            </div>
                            <div className="ml-11 space-y-1">
                              <p className="text-xs text-foreground"><span className="text-muted-foreground">Template:</span> <span className="font-medium">{cleanName}</span></p>
                              {evt.template_error && <p className="text-xs text-destructive/80 bg-destructive/5 rounded px-2 py-1 border border-destructive/10">{evt.template_error}</p>}
                              <p className="text-[10px] text-muted-foreground">{format(new Date(evt.sent_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                            </div>
                          </div>
                        );
                      }) : templateErrors.map(tpl => {
                        const { cleanName } = formatTemplateDept(tpl.template_name);
                        const isPaused = tpl.template_status === 'paused';
                        return (
                          <div key={tpl.template_name} className="rounded-lg border border-border bg-card p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isPaused ? 'bg-[hsl(var(--kpi-amber))]/10' : 'bg-destructive/10'}`}>
                                  <XCircle className={`h-4 w-4 ${isPaused ? 'text-[hsl(var(--kpi-amber))]' : 'text-destructive'}`} />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{cleanName}</p>
                                  <p className="text-xs text-destructive/80 mt-1">{tpl.template_error}</p>
                                </div>
                              </div>
                              <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold ${isPaused ? 'bg-[hsl(var(--kpi-amber))]/10 text-[hsl(var(--kpi-amber))] border border-[hsl(var(--kpi-amber))]/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                                {isPaused ? 'Pausado' : 'Erro'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ═══════════ TAB: Distribuição ═══════════ */}
      {activeTab === 'distribution' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold text-foreground mb-2 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Distribuição de Envios por Template
            </h3>
            <p className="text-xs text-muted-foreground mb-6">Clique em um segmento para ver detalhes do template.</p>

            {filteredTemplates.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum dado de template registrado.</p>
              </div>
            ) : (() => {
              const COLORS = ['hsl(var(--kpi-blue))', 'hsl(var(--kpi-emerald))', 'hsl(var(--kpi-amber))', 'hsl(var(--primary))', 'hsl(var(--kpi-violet))', 'hsl(var(--destructive))', 'hsl(var(--kpi-cyan))', 'hsl(142 76% 36%)'];
              const totalEnvios = filteredTemplates.reduce((a, t) => a + t.total_enviados, 0);
              const pieData = filteredTemplates.map((t, i) => {
                const { cleanName } = formatTemplateDept(t.template_name);
                const displayName = cleanName.replace(/_lawchat$/i, '').replace(/_Lawchat$/i, '').replace(/_/g, ' ');
                return {
                  name: displayName,
                  fullName: cleanName,
                  value: t.total_enviados,
                  responderam: t.responderam,
                  taxa: t.total_enviados > 0 ? Math.round((t.responderam / t.total_enviados) * 100) : 0,
                  fill: COLORS[i % COLORS.length],
                };
              });

              return (
                <div className="grid lg:grid-cols-[1fr_1fr] gap-8 items-start">
                  {/* Donut chart */}
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={120}
                          paddingAngle={2}
                          dataKey="value"
                          onMouseEnter={(_, idx) => setHoveredSlice(idx)}
                          onMouseLeave={() => setHoveredSlice(null)}
                          onClick={(_, idx) => setHoveredSlice(hoveredSlice === idx ? null : idx)}
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                        >
                          {pieData.map((entry, index) => (
                            <Cell
                              key={index}
                              fill={entry.fill}
                              opacity={hoveredSlice !== null && hoveredSlice !== index ? 0.4 : 1}
                              style={{ cursor: 'pointer', transition: 'opacity 0.2s ease' }}
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12, padding: '12px 16px' }}
                          formatter={(value: number, name: string) => [`${value} envios (${totalEnvios > 0 ? ((value / totalEnvios) * 100).toFixed(1) : 0}%)`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legend + details list */}
                  <div className="space-y-2">
                    {pieData.map((item, idx) => {
                      const pct = totalEnvios > 0 ? ((item.value / totalEnvios) * 100).toFixed(1) : '0';
                      const isActive = hoveredSlice === idx;
                      return (
                        <motion.div
                          key={idx}
                          onMouseEnter={() => setHoveredSlice(idx)}
                          onMouseLeave={() => setHoveredSlice(null)}
                          onClick={() => setHoveredSlice(isActive ? null : idx)}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                            isActive ? 'border-primary/40 bg-primary/5 shadow-sm scale-[1.01]' : 'border-border bg-card hover:bg-muted/40'
                          }`}
                          initial={false}
                          animate={{ scale: isActive ? 1.01 : 1 }}
                        >
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-[11px] text-muted-foreground">{item.value} envios</span>
                              <span className="text-[11px] text-muted-foreground">•</span>
                              <span className="text-[11px] text-muted-foreground">{item.responderam} respostas</span>
                              <span className="text-[11px] text-muted-foreground">•</span>
                              <span className="text-[11px] font-medium" style={{ color: item.fill }}>{item.taxa}% taxa</span>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-foreground shrink-0">{pct}%</span>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ═══════════ TAB: Heatmap ═══════════ */}
      {activeTab === 'heatmap' && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> Mapa de Calor — Horário de Respostas
          </h3>
          <ScrollArea className="w-full" type="auto">
            <div className="min-w-[600px]">
              {/* Hour labels */}
              <div className="flex ml-12 mb-1">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground">{h}h</div>
                ))}
              </div>
              {/* Grid */}
              {heatmapGrid.grid.map((row, dayIdx) => (
                <div key={dayIdx} className="flex items-center gap-1 mb-0.5">
                  <span className="w-10 text-[10px] text-muted-foreground font-medium text-right">{DAYS[dayIdx]}</span>
                  <div className="flex flex-1 gap-0.5">
                    {row.map((count: number, hourIdx: number) => {
                      const intensity = heatmapGrid.max > 0 ? count / heatmapGrid.max : 0;
                      const bg = count === 0
                        ? 'hsl(var(--muted))'
                        : `hsl(142 76% ${Math.round(85 - intensity * 55)}%)`;
                      return (
                        <div
                          key={hourIdx}
                          className="flex-1 aspect-square rounded-sm cursor-default relative group"
                          style={{ backgroundColor: bg, minHeight: '14px' }}
                          title={`${DAYS[dayIdx]} ${hourIdx}h: ${count} respostas`}
                        >
                          {count > 0 && (
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-[8px] font-bold text-white drop-shadow-sm">{count}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center justify-end gap-2 mt-3">
                <span className="text-[9px] text-muted-foreground">Menos</span>
                <div className="flex gap-0.5">
                  {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
                    <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: v === 0 ? 'hsl(var(--muted))' : `hsl(142 76% ${Math.round(85 - v * 55)}%)` }} />
                  ))}
                </div>
                <span className="text-[9px] text-muted-foreground">Mais</span>
              </div>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* ═══════════ TAB: Por Lead ═══════════ */}
      {activeTab === 'leads' && (
        <div className="space-y-3">
          {filteredLeads.length === 0 && !leadSearch ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum lead com follow-up registrado.</p>
            </div>
          ) : (
            <>
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={leadSearch}
                onChange={e => setLeadSearch(e.target.value)}
                placeholder="Buscar por nome, telefone ou número..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {(() => {
              const searchLower = leadSearch.toLowerCase().trim();
              const searchedLeads = searchLower
                ? filteredLeads.filter(l =>
                    (l.contact_name || '').toLowerCase().includes(searchLower) ||
                    (l.contact_phone || '').includes(searchLower) ||
                    (l.card_id || '').includes(searchLower)
                  )
                : filteredLeads;
              if (searchedLeads.length === 0) return (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nenhum lead encontrado para "{leadSearch}"</p>
                </div>
              );
              return searchedLeads.map((lead, idx) => {
              const dept = lead.department ? DEPT_CONFIG[lead.department.toLowerCase()] : null;
              const respPct = lead.total_disparos > 0 ? Math.round((lead.responderam / lead.total_disparos) * 100) : 0;
              const isExpanded = selectedLead === (lead.card_id || String(idx));
              return (
                <motion.div key={lead.card_id || idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setSelectedLead(isExpanded ? null : (lead.card_id || String(idx)))}
                    className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center h-9 w-9 rounded-full text-xs font-bold text-primary-foreground ${
                        lead.lead_closed_contract ? 'bg-[hsl(var(--kpi-emerald))]' : lead.lead_advanced ? 'bg-[hsl(var(--kpi-emerald))]' : 'bg-muted-foreground'
                      }`}>
                        {(lead.contact_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-foreground">{lead.contact_name || 'Desconhecido'}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {lead.responderam}/{lead.total_disparos} respostas
                          {dept && ` · ${dept.emoji} ${dept.label}`}
                          {' '}· {getCadenceLabel(lead.ultima_etapa)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {lead.lead_closed_contract && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--kpi-emerald))]/10 text-[hsl(var(--kpi-emerald))] font-medium">Contrato</span>
                      )}
                      {lead.lead_advanced && !lead.lead_closed_contract && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--kpi-emerald))]/10 text-[hsl(var(--kpi-emerald))] font-medium">Avançou</span>
                      )}
                      <div className="flex items-center gap-1.5 mr-2">
                        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[hsl(var(--kpi-emerald))]" style={{ width: `${respPct}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{respPct}%</span>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border">
                      <div className="p-3 space-y-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="rounded-md bg-muted/50 p-2 text-center">
                            <p className="font-bold text-foreground">{lead.total_disparos}</p>
                            <p className="text-[9px] text-muted-foreground">Total Disparos</p>
                          </div>
                          <div className="rounded-md bg-muted/50 p-2 text-center">
                            <p className="font-bold text-foreground">{lead.responderam}</p>
                            <p className="text-[9px] text-muted-foreground">Responderam</p>
                          </div>
                          <div className="rounded-md bg-muted/50 p-2 text-center">
                            <p className="font-bold text-foreground">{lead.tempo_medio_resposta_horas != null ? `${lead.tempo_medio_resposta_horas}h` : '—'}</p>
                            <p className="text-[9px] text-muted-foreground">Tempo Médio</p>
                          </div>
                          <div className="rounded-md bg-muted/50 p-2 text-center">
                            <p className="font-bold text-foreground text-xs">{getCadenceLabel(lead.ultima_etapa)}</p>
                            <p className="text-[9px] text-muted-foreground">Cadência</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                          <div className="rounded-md bg-muted/50 p-2 text-center">
                            <p className="text-[10px] text-muted-foreground mb-0.5">📤 Primeiro Envio</p>
                            <p className="text-xs font-semibold text-foreground">{format(new Date(lead.primeiro_disparo), "dd/MM/yyyy 'às' HH:mm")}</p>
                          </div>
                          <div className="rounded-md bg-muted/50 p-2 text-center">
                            <p className="text-[10px] text-muted-foreground mb-0.5">📤 Último Envio</p>
                            <p className="text-xs font-semibold text-foreground">{format(new Date(lead.ultimo_disparo), "dd/MM/yyyy 'às' HH:mm")}</p>
                          </div>
                          {lead.ultima_resposta && (
                            <div className="rounded-md bg-muted/50 p-2 text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">💬 Última Resposta</p>
                              <p className="text-xs font-semibold text-foreground">{format(new Date(lead.ultima_resposta), "dd/MM/yyyy 'às' HH:mm")}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            });
            })()}
            </>
          )}
        </div>
      )}

      {/* ═══════════ TAB: Curva de Saturação ═══════════ */}
      {activeTab === 'saturation' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-primary" /> Curva de Saturação por Cadência
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              Visualize a queda de engajamento ao longo das etapas da cadência.
            </p>
            {saturationData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Sem dados de cadência</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={saturationData}>
                    <defs>
                      <linearGradient id="gradDisparos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--kpi-blue))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--kpi-blue))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradResponderam" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--kpi-emerald))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--kpi-emerald))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="step" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <RechartsTooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number, _name: string, _props: any, index: number) => [value, index === 0 ? 'Enviados' : 'Responderam']}
                    />
                    <Area type="monotone" dataKey="disparos" name="Enviados" stroke="hsl(var(--kpi-blue))" strokeWidth={2} fill="url(#gradDisparos)" />
                    <Area type="monotone" dataKey="responderam" name="Responderam" stroke="hsl(var(--kpi-emerald))" strokeWidth={2} fill="url(#gradResponderam)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Drop-off cards with score */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
            {saturationData.map((step, i) => {
              const isDeadZone = step.taxa === 0 && step.disparos > 0;
              const dropColor = isDeadZone ? 'hsl(var(--destructive))' : step.taxa < 50 ? 'hsl(var(--kpi-amber))' : 'hsl(var(--kpi-emerald))';
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`rounded-xl border bg-card p-4 ${isDeadZone ? 'border-destructive/30' : 'border-border'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">#{i + 1}</span>
                    {isDeadZone && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                  </div>
                  <p className="text-2xl font-bold" style={{ color: dropColor }}>{step.taxa}%</p>
                  <p className="text-xs text-muted-foreground font-medium mt-1">Resposta</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{step.disparos} env. · {step.responderam} resp.</p>
                  <div className="mt-2 flex items-center gap-1">
                    <span className="text-[11px] font-semibold text-primary">Score: {step.score}</span>
                  </div>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${step.taxa}%`, backgroundColor: dropColor }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 truncate" title={step.name}>{step.name}</p>
                </motion.div>
              );
            })}
          </div>

          {/* Ranking by Score */}
          {saturationData.length > 0 && (() => {
            const ranked = [...saturationData].sort((a, b) => b.score - a.score);
            if (ranked.length === 0) return null;
            return (
              <div className="rounded-xl border border-border bg-card p-5">
                <h4 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" /> Ranking por Score
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                        <Activity className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[280px] text-xs">
                      Uma pontuação perante total de enviados e a porcentagem. Exemplo: 10% em 400 envios tem score maior que 15% de 50 envios.
                    </TooltipContent>
                  </UITooltip>
                </h4>
                <div className="space-y-3">
                  {ranked.map((s, idx) => {
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                    const barWidth = ranked[0].score > 0 ? (s.score / ranked[0].score) * 100 : 0;
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <span className="text-base w-8 text-center">{medal}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
                            <span className="text-sm font-bold text-primary ml-2 shrink-0">{s.score} pontos</span>
                          </div>
                          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-primary"
                              initial={{ width: 0 }}
                              animate={{ width: `${barWidth}%` }}
                              transition={{ delay: idx * 0.08, duration: 0.5 }}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Taxa: {s.taxa}% · {s.disparos} envios · {s.responderam} respostas
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Insight */}
          {saturationData.length > 0 && (() => {
            const deadStep = saturationData.find(s => s.taxa === 0 && s.disparos > 0);
            const bestByScore = [...saturationData].sort((a, b) => b.score - a.score)[0] || null;
            const bestByTaxa = [...saturationData].sort((a, b) => b.taxa - a.taxa)[0] || null;
            return (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                <h4 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Insights da Curva
                </h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {bestByScore && bestByScore.score > 0 && (
                    <p>🏆 <strong className="text-foreground">Melhor score:</strong> {bestByScore.name} — score {bestByScore.score} (taxa {bestByScore.taxa}%, {bestByScore.disparos} envios)</p>
                  )}
                  {bestByTaxa && bestByTaxa.name !== bestByScore?.name && bestByTaxa.taxa > 0 && (
                    <p>📈 <strong className="text-foreground">Maior taxa pura:</strong> {bestByTaxa.name} com {bestByTaxa.taxa}% — {bestByTaxa.disparos} envios, score {bestByTaxa.score}</p>
                  )}
                  {deadStep && <p>💀 <strong className="text-foreground">Zona morta:</strong> {deadStep.name} — 0% de resposta com {deadStep.disparos} envios. Revise esta etapa e acompanhe de perto.</p>}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════ TAB: Cemitério de Leads ═══════════ */}
      {activeTab === 'graveyard' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-destructive/20 bg-card p-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <UserX className="h-4 w-4 text-destructive" /> Leads sem Resposta
                <span className="text-xs font-normal text-muted-foreground ml-1">({graveyardLeads.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Agrupar:</span>
                <div className="flex items-center gap-0.5 bg-muted p-0.5 rounded-lg">
                  {([
                    { v: 'none' as const, l: 'Nenhum' },
                    { v: 'etapa' as const, l: 'Etapa' },
                    { v: 'dept' as const, l: 'Depto' },
                  ]).map(g => (
                    <button
                      key={g.v}
                      onClick={() => setGraveyardGroupBy(g.v)}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                        graveyardGroupBy === g.v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {g.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={graveyardSearch}
                onChange={e => setGraveyardSearch(e.target.value)}
                placeholder="Buscar por nome, telefone..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {(() => {
              const searchLower = graveyardSearch.toLowerCase().trim();
              const filteredGraveyard = searchLower
                ? graveyardLeads.filter(l =>
                    (l.contact_name || '').toLowerCase().includes(searchLower) ||
                    (l.contact_phone || '').includes(searchLower)
                  )
                : graveyardLeads;

              if (filteredGraveyard.length === 0) return (
                <div className="text-center py-12 text-muted-foreground">
                  {graveyardSearch ? (
                    <>
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhum lead encontrado para "{graveyardSearch}"</p>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-30 text-[hsl(var(--kpi-emerald))]" />
                      <p className="text-sm font-medium text-foreground">Nenhum lead sem resposta!</p>
                      <p className="text-xs text-muted-foreground mt-1">Todos os leads responderam em alguma etapa</p>
                    </>
                  )}
                </div>
              );

              return (() => {
              // Group leads based on selected grouping
              const renderLeadCard = (lead: LeadData, idx: number) => {
                const dept = lead.department ? DEPT_CONFIG[lead.department.toLowerCase()] : null;
                const daysSinceFirst = Math.round((new Date().getTime() - new Date(lead.primeiro_disparo).getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <motion.div
                    key={lead.card_id || idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                    className="rounded-xl border border-destructive/10 bg-card p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-9 w-9 rounded-full bg-destructive/10 text-destructive text-xs font-bold shrink-0">
                          {(lead.contact_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{lead.contact_name || 'Desconhecido'}</p>
                          {lead.contact_phone && (
                            <p className="text-[10px] text-muted-foreground">{lead.contact_phone}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const hasSession = !!getPreviewUrl(lead.card_id, lead.contact_phone);
                          if (hasSession) {
                            return (
                              <button
                                onClick={() => goToConversas(lead.card_id)}
                                className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-[hsl(var(--kpi-emerald))]/10 text-[hsl(var(--kpi-emerald))] font-medium hover:bg-[hsl(var(--kpi-emerald))]/20 transition-colors"
                              >
                                <MessageCircle className="h-3 w-3" /> Abrir Conversa
                              </button>
                            );
                          }
                          if (lead.contact_phone) {
                            return (
                              <a
                                href={`https://wa.me/${lead.contact_phone}?text=Ol%C3%A1%20${encodeURIComponent(lead.contact_name || '')}%2C%20tudo%20bem%3F`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-[hsl(var(--kpi-emerald))]/10 text-[hsl(var(--kpi-emerald))] font-medium hover:bg-[hsl(var(--kpi-emerald))]/20 transition-colors"
                              >
                                <MessageCircle className="h-3 w-3" /> Reengajar via WhatsApp
                              </a>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5 text-[10px]">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                        <Send className="h-2.5 w-2.5" /> {lead.total_disparos} follow-ups enviados
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {getCadenceLabel(lead.ultima_etapa)}
                      </span>
                      {dept && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          {dept.emoji} {dept.label}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        {daysSinceFirst} dias sem responder · desde {format(new Date(lead.primeiro_disparo), "dd/MM")} até {format(new Date(lead.ultimo_disparo), "dd/MM")}
                      </span>
                    </div>
                  </motion.div>
                );
              };

              if (graveyardGroupBy === 'none') {
                return (
                  <div className="space-y-2">
                    {filteredGraveyard.map((lead, idx) => renderLeadCard(lead, idx))}
                  </div>
                );
              }

              // Group by etapa or department
              const groups = new Map<string, LeadData[]>();
              filteredGraveyard.forEach(lead => {
                const key = graveyardGroupBy === 'etapa'
                  ? getCadenceLabel(lead.ultima_etapa)
                  : (lead.department ? (DEPT_CONFIG[lead.department.toLowerCase()]?.label || lead.department) : 'Sem Depto');
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(lead);
              });

              const sortedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

              return (
                <div className="space-y-3">
                  {sortedGroups.map(([groupName, leads]) => {
                    const isCollapsed = collapsedGroups.has(groupName);
                    return (
                      <div key={groupName} className="rounded-xl border border-border bg-card overflow-hidden">
                        <button
                          onClick={() => {
                            const next = new Set(collapsedGroups);
                            if (next.has(groupName)) next.delete(groupName); else next.add(groupName);
                            setCollapsedGroups(next);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30 transition-colors"
                        >
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                          <span className="text-sm font-semibold text-foreground">{groupName}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                            {leads.length} lead{leads.length > 1 ? 's' : ''}
                          </span>
                          <div className="flex-1" />
                          <span className="text-[10px] text-muted-foreground">{isCollapsed ? 'Expandir' : 'Minimizar'}</span>
                        </button>
                        <AnimatePresence initial={false}>
                          {!isCollapsed && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-4 pb-3 space-y-2">
                                {leads.map((lead, idx) => renderLeadCard(lead, idx))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              );
            })();
            })()}
          </div>

          {/* Graveyard stats */}
          {graveyardLeads.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-2xl font-bold text-destructive">{graveyardLeads.length}</p>
                <p className="text-[10px] text-muted-foreground">Leads perdidos</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{Math.round(graveyardLeads.reduce((s, l) => s + l.total_disparos, 0) / graveyardLeads.length)}</p>
                <p className="text-[10px] text-muted-foreground">Média de disparos</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-2xl font-bold text-foreground">
                  {filteredLeads.length > 0 ? Math.round((graveyardLeads.length / filteredLeads.length) * 100) : 0}%
                </p>
                <p className="text-[10px] text-muted-foreground">Taxa de perda</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{graveyardLeads.reduce((s, l) => s + l.total_disparos, 0)}</p>
                <p className="text-[10px] text-muted-foreground">Disparos sem retorno</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TAB: Preview de Conversas ═══════════ */}
      {activeTab === 'preview' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" /> Preview de Conversas
            </h3>
            <p className="text-[10px] text-muted-foreground mb-4">Selecione um lead para abrir o chat</p>
          </div>

          <div className={`grid gap-4 ${activePreviewUrl ? 'lg:grid-cols-[350px_1fr]' : 'grid-cols-1'}`}>
            {/* Lead list */}
            <ScrollArea className="max-h-[600px]" type="auto">
              <div className="space-y-2 pr-3">
              {filteredLeads.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum lead disponível</p>
                </div>
              ) : (
                filteredLeads.map((lead, idx) => {
                  const isActive = previewCardId === lead.card_id;
                  const dept = lead.department ? DEPT_CONFIG[lead.department.toLowerCase()] : null;
                  const hasChat = !!getPreviewUrl(lead.card_id, lead.contact_phone);
                  return (
                    <motion.button
                      key={lead.card_id || idx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => setPreviewCardId(isActive ? null : (lead.card_id || null))}
                      className={`w-full text-left rounded-xl border p-3 transition-all ${
                        isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center h-9 w-9 rounded-full text-xs font-bold text-primary-foreground shrink-0 ${
                          lead.lead_closed_contract ? 'bg-[hsl(var(--kpi-emerald))]' : lead.responderam > 0 ? 'bg-[hsl(var(--kpi-blue))]' : 'bg-muted-foreground'
                        }`}>
                          {(lead.contact_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{lead.contact_name || 'Desconhecido'}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            {dept && <span>{dept.emoji} {dept.label}</span>}
                            <span>· {lead.responderam}/{lead.total_disparos}</span>
                            <span>· {getCadenceLabel(lead.ultima_etapa)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {lead.lead_closed_contract && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[hsl(var(--kpi-emerald))]/10 text-[hsl(var(--kpi-emerald))] font-medium">Contrato</span>}
                          {hasChat && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                      </div>
                    </motion.button>
                  );
                })
              )}
              </div>
            </ScrollArea>

            {/* Preview panel */}
            {activePreviewUrl && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">{previewLeadData?.contact_name || 'Chat'}</span>
                    {previewLeadData?.contact_phone && (
                      <span className="text-[10px] text-muted-foreground">{previewLeadData.contact_phone}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={activePreviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Abrir Chat
                    </a>
                    <button
                      onClick={() => setPreviewCardId(null)}
                      className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <iframe
                  src={activePreviewUrl}
                  className="w-full h-[500px] border-0"
                  title="Chat Preview"
                />
              </motion.div>
            )}

            {!activePreviewUrl && previewCardId && (
              <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center justify-center text-muted-foreground">
                <MessageCircle className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium text-foreground">Sem chat disponível</p>
                <p className="text-xs text-muted-foreground mt-1">Este lead não possui sessão de chat vinculada</p>
                {previewLeadData?.contact_phone && (
                  <a
                    href={`https://wa.me/${previewLeadData.contact_phone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[hsl(var(--kpi-emerald))]/10 text-[hsl(var(--kpi-emerald))] font-medium hover:bg-[hsl(var(--kpi-emerald))]/20 transition-colors"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Abrir WhatsApp
                  </a>
                )}
              </div>
            )}

            {!activePreviewUrl && !previewCardId && (
              <div className="hidden lg:flex rounded-xl border border-border bg-card p-8 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Selecione um lead para ver o chat</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FollowUpPage;
