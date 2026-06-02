import { useState, useMemo, useEffect } from 'react';
import { Card as HelenaCard, Session } from '@/api/helena';
import { useClassify } from '@/contexts/StepMappingsContext';
import { formatDate, formatCurrency } from '@/utils/formatters';
import { extractCampaign } from '@/utils/extractCampaign';
import { avatarPalette, initialOf } from '@/utils/leadScore';
import {
  FileText, Phone, User, TrendingUp, BarChart3, ExternalLink, Copy, Check, Clock,
  GitBranch, MessageCircle, Target, Zap, Download, Timer, Search, Sparkles,
  AlertTriangle, PieChart, Award, ChevronRight, X, RotateCcw,
} from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedCounter from '@/components/AnimatedCounter';

interface ContractsPageProps {
  cards: HelenaCard[];
  sessions: Session[];
}

interface ParsedContract {
  caso: string;
  resumo_caso: string;
  qualidade: string;
  qualidade_detalhe: string;
  potencial_retorno: string;
}

function parseContractNote(text: string): ParsedContract | null {
  if (!text || !text.includes('📄Contrato Assinado!')) return null;
  const parsed: Partial<ParsedContract> = {};

  const casoMatch = text.match(/📂\s*Caso:\s*(.+?)(?:\n\n|\n📄|$)/s);
  if (casoMatch) parsed.caso = casoMatch[1].trim();

  const resumoMatch = text.match(/📄\s*Resumo do caso:\s*(.+?)(?:\n\n📊|$)/s);
  if (resumoMatch) parsed.resumo_caso = resumoMatch[1].trim();

  const qualidadeMatch = text.match(/📊\s*Qualidade do contrato:\s*(.+?)(?:\n\n💰|$)/s);
  if (qualidadeMatch) {
    const full = qualidadeMatch[1].trim();
    parsed.qualidade_detalhe = full;
    const levelMatch = full.match(/^(Alta|Média|Baixa)/i);
    if (levelMatch) parsed.qualidade = levelMatch[1];
  }

  const retornoMatch = text.match(/💰\s*Potencial retorno:\s*(.+?)$/s);
  if (retornoMatch) parsed.potencial_retorno = retornoMatch[1].trim();

  return parsed as ParsedContract;
}

interface KeyTag {
  label: string;
  emoji: string;
  color: string;
}

function extractKeyTags(resumo: string | undefined, caso: string | undefined): KeyTag[] {
  const tags: KeyTag[] = [];
  if (!resumo && !caso) return tags;

  if (caso) tags.push({ label: caso, emoji: '📂', color: 'bg-primary/15 text-primary border-primary/25' });

  const text = resumo || '';

  const anoMatch = text.match(/Ano:\s*(\d{4})/i);
  if (anoMatch) tags.push({ label: `Ano: ${anoMatch[1]}`, emoji: '📅', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/25' });

  const acidenteMatch = text.match(/Acidente:\s*([^|,\n]+)/i);
  const acidenteDesc = acidenteMatch ? acidenteMatch[1].trim() : '';
  if (acidenteDesc) tags.push({ label: acidenteDesc, emoji: '⚠️', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/25' });

  const alreadyCovered = (word: string) => {
    const w = word.toLowerCase();
    return tags.some(t => t.label.toLowerCase().includes(w));
  };

  const auxDoencaPositive = /auxílio[- ]?doença/i.test(text) &&
    !/auxílio[- ]?doença:\s*não/i.test(text) &&
    !/não\s+(?:receb|inform|t(?:em|eve)|houve).*auxílio[- ]?doença/i.test(text);
  if (auxDoencaPositive && !alreadyCovered('auxílio-doença') && !alreadyCovered('auxilio-doença')) {
    tags.push({ label: 'Auxílio-doença', emoji: '🏥', color: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/25' });
  }

  if (/\bBPC\b/i.test(text) && !alreadyCovered('BPC')) tags.push({ label: 'BPC', emoji: '🛡️', color: 'bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/25' });
  if (/\bLOAS\b/i.test(text) && !alreadyCovered('LOAS')) tags.push({ label: 'LOAS', emoji: '🛡️', color: 'bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/25' });

  const apoMatch = text.match(/(Aposentadoria\s*(?:por\s+)?(?:Invalidez|Idade|Tempo|Especial)?)/i);
  if (apoMatch && !alreadyCovered('aposentadoria')) tags.push({ label: apoMatch[1].trim(), emoji: '👴', color: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/25' });

  if (/Pensão\s*(?:por\s+Morte)?/i.test(text) && !alreadyCovered('pensão')) tags.push({ label: 'Pensão por Morte', emoji: '🕊️', color: 'bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/25' });

  if (/retroativ/i.test(text)) tags.push({ label: 'Retroativo', emoji: '💰', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25' });

  if (/incapacid/i.test(text) && !alreadyCovered('incapacid')) tags.push({ label: 'Incapacidade', emoji: '♿', color: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/25' });

  const limMatch = text.match(/Limitação:\s*([^|,\n]+)/i);
  if (limMatch) {
    const lim = limMatch[1].trim();
    if (lim.length <= 50 && !alreadyCovered(lim.substring(0, 10))) {
      tags.push({ label: lim, emoji: '⛔', color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/25' });
    }
  }

  const seen = new Set<string>();
  return tags.filter(t => {
    const key = t.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function extractName(title: string): string {
  if (!title) return '—';
  const match = title.match(/👤\s*([^|]+)/);
  if (match) return match[1].trim();
  const pipeMatch = title.match(/^([^|]+)/);
  if (pipeMatch) return pipeMatch[1].replace(/[^\w\sÀ-ÿ.-]/g, '').trim();
  return title;
}

function extractPhone(title: string): string | null {
  if (!title) return null;
  const match = title.match(/📞\s*([\d\s()+-]+)/);
  if (match) return match[1].trim();
  const phoneMatch = title.match(/(\(?\d{2}\)?\s?\d{4,5}-?\d{4})/);
  return phoneMatch ? phoneMatch[1] : null;
}

// Title Case que agrupa "AUXÍLIO ACIDENTE" e "auxilio acidente"
function titleCase(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
    .replace(/(^|\s|-)([a-zà-ÿ])/g, (_, p, c) => p + c.toUpperCase());
}

// Canonicaliza variantes do mesmo tipo de caso ("Aux Acidente", "Auxilio Acidente",
// "Auxílio-Acidente" → um só rótulo). Sem acento, sem hífen, sem abreviação divergente.
function canonicalCaso(s: string): string {
  const n = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/\baux/.test(n) && /acidente/.test(n)) return 'Auxílio-Acidente';
  if (/\baux/.test(n) && /doenc/.test(n)) return 'Auxílio-Doença';
  if (/\bbpc\b|\bloas\b/.test(n)) return 'BPC/LOAS';
  if (/aposentad/.test(n)) return 'Aposentadoria';
  if (/pensao/.test(n)) return 'Pensão por Morte';
  if (/trauma\s*facial/.test(n)) return 'Trauma Facial';
  if (/respirat/.test(n)) return 'Dificuldade Respiratória';
  if (/invalidez/.test(n)) return 'Invalidez';
  return titleCase(s);
}

// Valida o "tipo de caso": rejeita frases/lixo que o parser às vezes captura
// (ex: "Deve Ser Classificado Como Duvidaqualificacao.", ". Portanto, ...").
// Retorna um caso curto e limpo, ou null.
function sanitizeCaso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/\s+/g, ' ');
  // corta na primeira pontuação de frase OU pipe (pega só o "núcleo" do caso)
  s = s.split(/[.;:!?|]/)[0].trim();
  if (s.length < 3 || s.length > 32) return null;
  if (!/[A-Za-zÀ-ÿ]/.test(s)) return null;
  // rejeita telefone / dígitos / emoji / símbolos de contato (não são tipo de caso)
  if (/\d|📞|\+|\(|\)|@|https?:/i.test(s)) return null;
  // rejeita frases de qualificação/análise + nomes de etapa/departamento
  if (/duvida|qualific|classificad|prosseguiment|portanto|elemento|requerente|desqualific|apto\s+para|n[ãa]o\s+foi|deve\s+ser|analisand|escrit[óo]rio|descartar|operacional|comercial|financeir|suporte|atendiment|\bvendas\b|\bsdr\b|closer|\bgeral\b|\bteste\b/i.test(s)) return null;
  return canonicalCaso(s);
}

// Limpa o nome do cliente: tira prefixo "IA cliente"/"cliente" e sufixo " - CASO".
function cleanName(raw: string | null | undefined): string {
  let s = String(raw || '').trim();
  if (!s) return '—';
  s = s.split(/\s[-–]\s/)[0].trim();                 // remove " - AUXILIO ACIDENTE"
  s = s.replace(/^(ia\s+cliente|cliente|ia)\s+/i, '').trim(); // remove prefixo automático
  if (s && s === s.toUpperCase()) s = titleCase(s);  // "MATEUS DOS SANTOS" → "Mateus Dos Santos"
  return s || '—';
}

function getQualityColor(quality: string): string {
  const q = (quality || '').toLowerCase();
  if (q.includes('alta')) return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
  if (q.includes('média') || q.includes('media')) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
  if (q.includes('baixa')) return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30';
  return 'bg-muted text-muted-foreground border-border';
}

function getQualityDot(quality: string): string {
  const q = (quality || '').toLowerCase();
  if (q.includes('alta')) return '🟢';
  if (q.includes('média') || q.includes('media')) return '🟡';
  if (q.includes('baixa')) return '🔴';
  return '⚪';
}

function ensureProtocol(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return 'https://' + url;
}

// remove acentos p/ busca tolerante
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// quality level normalizado (decide tudo: cards, filtros, badges)
type QLevel = 'alta' | 'media' | 'baixa' | 'sem';
function qualityLevel(parsed: ParsedContract | null): QLevel {
  if (!parsed) return 'sem';
  const q = (parsed.qualidade || '').toLowerCase();
  if (q.includes('alta')) return 'alta';
  if (q.includes('méd') || q.includes('med')) return 'media';
  if (q.includes('baix')) return 'baixa';
  return 'sem';
}

// número de contrato determinístico a partir do id (cosmético, estável)
function contractNumber(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `#${(h % 900000) + 100000}`;
}

// paleta do donut por tipo de caso
const CASE_PALETTE = ['#10b981', '#8b5cf6', '#f59e0b', '#f43f5e', '#3b82f6', '#06b6d4'];
const OUTROS_COLOR = '#94a3b8';

// série semanal (últimas N semanas) p/ sparkline real
function weekBuckets(times: number[], nowMs: number, weeks = 8): number[] {
  const wk = 7 * 24 * 3600 * 1000;
  const arr = new Array(weeks).fill(0);
  times.forEach(t => {
    if (!t || isNaN(t)) return;
    const idx = weeks - 1 - Math.floor((nowMs - t) / wk);
    if (idx >= 0 && idx < weeks) arr[idx]++;
  });
  return arr;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 64, h = 22;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 3) - 1.5).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <motion.polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </svg>
  );
}

function TimelineEvent({ icon, title, subtitle, extra, color, isLast }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  extra?: string;
  color: string;
  isLast?: boolean;
}) {
  return (
    <div className="relative flex items-start gap-2.5">
      <div className={`relative z-10 h-6 w-6 rounded-full flex items-center justify-center border ${color} shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 pb-1">
        <p className="text-xs font-medium text-foreground leading-snug">{title}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
        {extra && <p className="text-[10px] text-muted-foreground/70 mt-0.5 italic">{extra}</p>}
      </div>
    </div>
  );
}

const PER_PAGE = 20;

const ContractsPage = ({ cards, sessions }: ContractsPageProps) => {
  const { classify } = useClassify();
  const [selectedCard, setSelectedCard] = useState<HelenaCard | null>(null);
  const [qualityFilter, setQualityFilter] = useState<string>('all');
  const [caseFilter, setCaseFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hoverSeg, setHoverSeg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const nowMs = useMemo(() => Date.now(), []);

  // ───────────────────────── dados (mesma lógica robusta de antes) ─────────────────────────
  const contractCards = useMemo(() => {
    return cards
      .filter(card => {
        const stage = classify(card);
        return stage === 'CONTRATO FECHADO' && !card.archived;
      })
      .map(card => {
        let parsed: ParsedContract | null = null;
        const cardAny = card as any;

        if (cardAny.contractParsed && cardAny.contractParsed.caso) {
          parsed = cardAny.contractParsed as ParsedContract;
        } else if (cardAny.contractNote?.text) {
          parsed = parseContractNote(cardAny.contractNote.text);
        }

        const campaign = extractCampaign(card);
        const cardSessions = sessions
          .filter(s => s.cardId === card.id)
          .sort((a, b) => new Date(a.sessionCreatedAt || '').getTime() - new Date(b.sessionCreatedAt || '').getTime());

        const firstSession = cardSessions[0] || null;
        const sessionPhone = firstSession?.contactPhone || null;
        const contactPhone = extractPhone(card.title);

        const createdDate = new Date(card.createdAt).getTime();
        const contractMs = new Date(cardAny.contractNote?.createdAt || card.updatedAt).getTime();
        const msToContract = contractMs - createdDate;
        const daysToContract = Math.round(msToContract / (1000 * 60 * 60 * 24));

        // Caso: prioriza o parse da nota (validado), senão tenta o sufixo do título.
        let caso = sanitizeCaso(parsed?.caso);
        if (!caso) {
          const parts = (card.title || '').split(/\s[-–]\s/);
          if (parts.length > 1) caso = sanitizeCaso(parts[parts.length - 1]);
        }

        // keyTags usa o caso JÁ validado (evita frase-lixo virar tag)
        const keyTags = extractKeyTags(parsed?.resumo_caso, caso || undefined);

        const noteDate = cardAny.contractNote?.createdAt || card.updatedAt;
        const yearTag = keyTags.find(t => t.label.startsWith('Ano'));

        return {
          card,
          parsed,
          caso,
          qlevel: qualityLevel(parsed),
          keyTags,
          yearLabel: yearTag?.label || null,
          contractNo: contractNumber(card.id),
          name: cleanName(firstSession?.contactName || extractName(card.title)),
          phone: sessionPhone || contactPhone,
          campaign: campaign || firstSession?.utmCampaign || null,
          utmSource: firstSession?.utmSource || null,
          utmMedium: firstSession?.utmMedium || null,
          utmHeadline: firstSession?.utmHeadline || null,
          utmContent: firstSession?.utmContent || null,
          channelType: firstSession?.channelType || null,
          channelName: firstSession?.channelName || null,
          agentName: firstSession?.agentName || null,
          responsibleUser: card.responsibleUser?.name || null,
          referralUrl: firstSession?.utmReferralUrl || null,
          noteDate,
          noteMs: new Date(noteDate).getTime(),
          allSessions: cardSessions,
          daysToContract,
          msToContract: msToContract > 0 ? msToContract : 0,
        };
      })
      .sort((a, b) => b.noteMs - a.noteMs);
  }, [cards, classify, sessions]);

  // tipos de caso únicos (p/ filtro e abas) — ordenados por frequência
  const caseEntries = useMemo(() => {
    const m = new Map<string, number>();
    contractCards.forEach(c => { if (c.caso) m.set(c.caso, (m.get(c.caso) || 0) + 1); });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [contractCards]);

  // ───────────────────────── filtros (agora REALMENTE funcionam: qualidade + caso + busca) ─────────────────────────
  const filteredContracts = useMemo(() => {
    const q = norm(search.trim());
    return contractCards.filter(c => {
      if (qualityFilter !== 'all' && c.qlevel !== qualityFilter) return false;
      if (caseFilter !== 'all' && c.caso !== caseFilter) return false;
      if (q) {
        const hay = norm([
          c.name,
          c.contractNo,
          c.caso || '',
          c.parsed?.resumo_caso || '',
          c.parsed?.caso || '',
          c.campaign || '',
          c.phone || '',
        ].join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [contractCards, qualityFilter, caseFilter, search]);

  // reset de página quando filtros mudam
  useEffect(() => { setPage(1); }, [qualityFilter, caseFilter, search]);

  // ───────────────────────── KPIs (sobre o conjunto total, como na referência) ─────────────────────────
  const kpis = useMemo(() => {
    const total = contractCards.length;
    const alta = contractCards.filter(c => c.qlevel === 'alta').length;
    const media = contractCards.filter(c => c.qlevel === 'media').length;
    const baixa = contractCards.filter(c => c.qlevel === 'baixa').length;
    const semNota = contractCards.filter(c => c.qlevel === 'sem').length;

    const withMs = contractCards.filter(c => c.msToContract > 0);
    const avgMs = withMs.length ? withMs.reduce((s, c) => s + c.msToContract, 0) / withMs.length : 0;
    const avgDays = Math.floor(avgMs / (1000 * 60 * 60 * 24));
    const avgHours = Math.floor((avgMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

    // sparklines reais (contratos por semana, por categoria)
    const spark = (subset: typeof contractCards) => weekBuckets(subset.map(c => c.noteMs), nowMs);

    return {
      total, alta, media, baixa, semNota, avgDays, avgHours,
      pctAlta: pct(alta), pctMedia: pct(media), pctBaixa: pct(baixa), pctSem: pct(semNota),
      sparkTotal: spark(contractCards),
      sparkAlta: spark(contractCards.filter(c => c.qlevel === 'alta')),
      sparkMedia: spark(contractCards.filter(c => c.qlevel === 'media')),
      sparkBaixa: spark(contractCards.filter(c => c.qlevel === 'baixa')),
      sparkSem: spark(contractCards.filter(c => c.qlevel === 'sem')),
    };
  }, [contractCards, nowMs]);

  // ───────────────────────── donut por tipo de caso (top 4 + Outros) ─────────────────────────
  const donut = useMemo(() => {
    const total = caseEntries.reduce((s, [, n]) => s + n, 0);
    const TOP = 4;
    const top = caseEntries.slice(0, TOP);
    const restCount = caseEntries.slice(TOP).reduce((s, [, n]) => s + n, 0);
    const segs = top.map(([label, value], i) => ({
      label, value, color: CASE_PALETTE[i % CASE_PALETTE.length],
      pct: total ? (value / total) * 100 : 0,
    }));
    if (restCount > 0) segs.push({ label: 'Outros', value: restCount, color: OUTROS_COLOR, pct: total ? (restCount / total) * 100 : 0 });
    return { segs, total };
  }, [caseEntries]);

  // ───────────────────────── insights inteligentes (data-driven) ─────────────────────────
  const insights = useMemo(() => {
    const list: { icon: any; tone: string; text: string; cta: string; onClick?: () => void }[] = [];
    const top = caseEntries[0];
    if (top && kpis.total > 0) {
      list.push({
        icon: PieChart, tone: 'emerald',
        text: `${top[0]} representa ${((top[1] / kpis.total) * 100).toFixed(1)}% dos contratos fechados.`,
        cta: 'Ver contratos', onClick: () => { setCaseFilter(top[0]); setQualityFilter('all'); },
      });
    }
    if (kpis.semNota > 0) {
      list.push({
        icon: AlertTriangle, tone: 'amber',
        text: `${kpis.semNota} contrato(s) não possuem anotação. Isso representa ${kpis.pctSem.toFixed(1)}% do total.`,
        cta: 'Revisar', onClick: () => { setQualityFilter('sem'); setCaseFilter('all'); },
      });
    }
    if (kpis.avgDays > 0) {
      list.push({
        icon: Timer, tone: 'blue',
        text: `O tempo médio de fechamento é de ${kpis.avgDays}d ${kpis.avgHours}h (criação → contrato).`,
        cta: 'Ver tendência',
      });
    }
    if (kpis.total > 0) {
      list.push({
        icon: Award, tone: 'violet',
        text: `${kpis.pctAlta.toFixed(1)}% dos contratos têm qualidade alta (${kpis.alta} de ${kpis.total}).`,
        cta: 'Ver de qualidade alta', onClick: () => { setQualityFilter('alta'); setCaseFilter('all'); },
      });
    }
    return list.slice(0, 4);
  }, [caseEntries, kpis]);

  const totalPages = Math.max(1, Math.ceil(filteredContracts.length / PER_PAGE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filteredContracts.slice((pageSafe - 1) * PER_PAGE, pageSafe * PER_PAGE);

  const selectedParsed = useMemo(() => {
    if (!selectedCard) return null;
    return contractCards.find(c => c.card.id === selectedCard.id) || null;
  }, [selectedCard, contractCards]);

  const exportCsv = () => {
    const headers = ['Cliente', 'Contrato', 'Telefone', 'Caso', 'Qualidade', 'Campanha', 'Dias até Contrato', 'Data Contrato'];
    const rows = filteredContracts.map(c => [
      c.name, c.contractNo, c.phone || '', c.caso || '', c.parsed?.qualidade || 'Sem anotação',
      c.campaign || '', String(c.daysToContract), formatDate(c.noteDate),
    ]);
    exportToCsv('contratos.csv', headers, rows);
  };

  // tone → classes
  const toneBg: Record<string, string> = {
    emerald: 'from-emerald-500/10 to-transparent border-emerald-500/20',
    amber: 'from-amber-500/10 to-transparent border-amber-500/20',
    blue: 'from-blue-500/10 to-transparent border-blue-500/20',
    violet: 'from-violet-500/10 to-transparent border-violet-500/20',
  };
  const toneIcon: Record<string, string> = {
    emerald: 'text-emerald-500 bg-emerald-500/15',
    amber: 'text-amber-500 bg-amber-500/15',
    blue: 'text-blue-500 bg-blue-500/15',
    violet: 'text-violet-500 bg-violet-500/15',
  };

  const hasActiveFilters = qualityFilter !== 'all' || caseFilter !== 'all' || search.trim() !== '';

  const KPI_CARDS = [
    { label: 'Total de Contratos', value: kpis.total, sub: '100% do total', icon: FileText, color: 'text-foreground', glow: 'rgba(16,185,129,0.10)', spark: kpis.sparkTotal, sparkColor: '#10b981' },
    { label: 'Tempo Médio', value: -1, display: `${kpis.avgDays}d ${kpis.avgHours}h`, sub: 'criação → contrato', icon: Timer, color: 'text-blue-500', glow: 'rgba(59,130,246,0.10)', spark: kpis.sparkTotal, sparkColor: '#3b82f6' },
    { label: 'Qualidade Alta', value: kpis.alta, sub: `${kpis.pctAlta.toFixed(1)}% do total`, icon: TrendingUp, color: 'text-emerald-500', glow: 'rgba(16,185,129,0.12)', spark: kpis.sparkAlta, sparkColor: '#10b981' },
    { label: 'Qualidade Média', value: kpis.media, sub: `${kpis.pctMedia.toFixed(1)}% do total`, icon: BarChart3, color: 'text-amber-500', glow: 'rgba(245,158,11,0.12)', spark: kpis.sparkMedia, sparkColor: '#f59e0b' },
    { label: 'Qualidade Baixa', value: kpis.baixa, sub: `${kpis.pctBaixa.toFixed(1)}% do total`, icon: AlertTriangle, color: 'text-red-500', glow: 'rgba(244,63,94,0.12)', spark: kpis.sparkBaixa, sparkColor: '#f43f5e' },
    { label: 'Sem Anotação', value: kpis.semNota, sub: `${kpis.pctSem.toFixed(1)}% do total`, icon: FileText, color: 'text-muted-foreground', glow: 'rgba(148,163,184,0.10)', spark: kpis.sparkSem, sparkColor: '#94a3b8' },
  ];

  return (
    <div className="space-y-5">
      {/* ───────── Header ───────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Resumo de Anotações dos Contratos</h1>
            <p className="text-sm text-muted-foreground">Visão geral das anotações dos contratos fechados</p>
          </div>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Download className="h-4 w-4" />
          Exportar relatório
        </button>
      </div>

      {/* ───────── KPI Cards ───────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPI_CARDS.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: i * 0.06, duration: 0.5, ease: 'easeOut' }}
            whileHover={{ y: -4 }}
            className="group relative rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)] transition-shadow overflow-hidden"
          >
            <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full blur-2xl opacity-70" style={{ background: kpi.glow }} />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <div className={`h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center ${kpi.color}`}>
                  <kpi.icon className="h-4 w-4" />
                </div>
                <Sparkline data={kpi.spark} color={kpi.sparkColor} />
              </div>
              <p className="text-[11px] text-muted-foreground font-medium truncate">{kpi.label}</p>
              <p className={`text-2xl font-bold tracking-tight ${kpi.color}`}>
                {kpi.display ? kpi.display : <AnimatedCounter value={kpi.value} />}
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{kpi.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ───────── Filtros ───────── */}
      <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)] flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground hidden sm:inline">Qualidade</span>
          <select
            value={qualityFilter}
            onChange={e => setQualityFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            <option value="all">Todas as qualidades</option>
            <option value="alta">🟢 Alta</option>
            <option value="media">🟡 Média</option>
            <option value="baixa">🔴 Baixa</option>
            <option value="sem">⚪ Sem anotação</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground hidden sm:inline">Caso</span>
          <select
            value={caseFilter}
            onChange={e => setCaseFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 max-w-[200px]"
          >
            <option value="all">Todos os casos</option>
            {caseEntries.map(([c, n]) => (
              <option key={c} value={c}>{c} ({n})</option>
            ))}
          </select>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por contrato, cliente ou anotação..."
            className="w-full rounded-lg border border-border bg-background pl-8 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => { setQualityFilter('all'); setCaseFilter('all'); setSearch(''); }}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Limpar filtros
          </button>
        )}
      </div>

      {/* ───────── Donut + Insights ───────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Donut */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)] flex flex-col">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-emerald-500" />
            Contratos por tipo de caso
          </h3>
          {donut.total === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Sem dados de tipo de caso ainda.</p>
          ) : (
            <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-8 py-2">
              <motion.div
                initial={{ scale: 0.85, opacity: 0, rotate: -8 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 160, damping: 18 }}
                className="relative h-[176px] w-[176px] shrink-0"
              >
                {/* glow suave atrás do donut */}
                <div className="absolute inset-3 rounded-full bg-emerald-500/10 blur-2xl" />
                <svg viewBox="0 0 120 120" className="relative h-full w-full -rotate-90">
                  {(() => {
                    const R = 50, C = 2 * Math.PI * R;
                    let acc = 0;
                    return donut.segs.map((s, i) => {
                      const seg = (s.value / donut.total) * C;
                      const rot = (acc / donut.total) * 360;
                      acc += s.value;
                      const dim = hoverSeg && hoverSeg !== s.label;
                      return (
                        <motion.circle
                          key={s.label}
                          cx={60} cy={60} r={R}
                          fill="none"
                          stroke={s.color}
                          strokeWidth={hoverSeg === s.label ? 16 : 13}
                          strokeDasharray={`${seg} ${C}`}
                          transform={`rotate(${rot} 60 60)`}
                          initial={{ strokeDashoffset: seg }}
                          animate={{ strokeDashoffset: 0, opacity: dim ? 0.3 : 1 }}
                          transition={{ strokeDashoffset: { duration: 1, delay: 0.15 + i * 0.12, ease: 'easeOut' }, opacity: { duration: 0.2 } }}
                          onMouseEnter={() => setHoverSeg(s.label)}
                          onMouseLeave={() => setHoverSeg(null)}
                          style={{ cursor: 'pointer' }}
                        />
                      );
                    });
                  })()}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-foreground">
                    <AnimatedCounter value={hoverSeg ? (donut.segs.find(s => s.label === hoverSeg)?.value || donut.total) : donut.total} />
                  </span>
                  <span className="text-[10px] text-muted-foreground">{hoverSeg || 'contratos'}</span>
                </div>
              </motion.div>
              <div className="w-full sm:w-auto min-w-[200px] space-y-1.5">
                {donut.segs.map(s => (
                  <button
                    key={s.label}
                    onMouseEnter={() => setHoverSeg(s.label)}
                    onMouseLeave={() => setHoverSeg(null)}
                    onClick={() => s.label !== 'Outros' && setCaseFilter(s.label)}
                    className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors text-left"
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-xs text-foreground flex-1 truncate">{s.label}</span>
                    <span className="text-xs font-semibold text-foreground tabular-nums">{s.value}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{s.pct.toFixed(1)}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            Insights inteligentes
            <span className="ml-auto text-[10px] font-medium text-violet-500 bg-violet-500/10 rounded-full px-2 py-0.5">IA</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {insights.map((ins, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.1 }}
                className={`rounded-xl border bg-gradient-to-br ${toneBg[ins.tone]} p-3 flex flex-col`}
              >
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center mb-2 ${toneIcon[ins.tone]}`}>
                  <ins.icon className="h-3.5 w-3.5" />
                </div>
                <p className="text-xs text-foreground leading-snug flex-1">{ins.text}</p>
                <button
                  onClick={ins.onClick}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-foreground/80 hover:text-foreground transition-colors self-start"
                >
                  {ins.cta} <ChevronRight className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* ───────── Abas por tipo de caso ───────── */}
      {caseEntries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setCaseFilter('all')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
              caseFilter === 'all' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-card text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            Todas <span className="opacity-70">{contractCards.length}</span>
          </button>
          {caseEntries.slice(0, 6).map(([c, n]) => (
            <button
              key={c}
              onClick={() => setCaseFilter(c)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                caseFilter === c ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-card text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {c} <span className="opacity-70">{n}</span>
            </button>
          ))}
        </div>
      )}

      {/* ───────── Tabela premium ───────── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-[0_1px_3px_rgba(15,23,42,0.05)] overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground">
            Contratos fechados <span className="text-muted-foreground font-normal">({filteredContracts.length})</span>
          </h3>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-lg px-3 py-1.5 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>

        {/* Cabeçalho de colunas (desktop) */}
        <div className="hidden md:grid grid-cols-[2.2fr_1.3fr_2.5fr_0.9fr_1fr] gap-3 px-4 py-2.5 border-b border-border bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
          <span>Cliente / Contrato</span>
          <span>Caso</span>
          <span>Anotações (Resumo)</span>
          <span>Qualidade</span>
          <span>Data de Fechamento</span>
        </div>

        <div className="divide-y divide-border">
          <AnimatePresence mode="popLayout">
            {pageRows.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground text-sm">
                Nenhum contrato encontrado com os filtros atuais.
              </div>
            ) : (
              pageRows.map((c, i) => {
                const pal = avatarPalette(c.name);
                const qBorder = c.qlevel === 'alta' ? 'before:bg-emerald-500'
                  : c.qlevel === 'media' ? 'before:bg-amber-500'
                  : c.qlevel === 'baixa' ? 'before:bg-red-500'
                  : 'before:bg-transparent';
                const resumo = c.parsed?.resumo_caso || '';
                const resumoShort = resumo ? resumo.replace(/\s+/g, ' ').slice(0, 120) : null;
                const extraTags = Math.max(0, c.keyTags.length - 1);
                return (
                  <motion.div
                    key={c.card.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.3) }}
                    onClick={() => setSelectedCard(c.card)}
                    className={`group relative cursor-pointer md:grid md:grid-cols-[2.2fr_1.3fr_2.5fr_0.9fr_1fr] md:items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors
                      before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:opacity-0 group-hover:before:opacity-100 before:transition-opacity ${qBorder}`}
                  >
                    {/* Cliente / Contrato */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${pal.bg} ${pal.text}`}>
                        {initialOf(c.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                        <p className="text-[11px] text-muted-foreground">Contrato {c.contractNo}</p>
                      </div>
                    </div>

                    {/* Caso */}
                    <div className="flex flex-wrap items-center gap-1 mt-1.5 md:mt-0">
                      {c.caso ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[11px] font-medium">
                          {c.caso}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                      {c.yearLabel && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-2 py-0.5 text-[11px]">
                          📅 {c.yearLabel.replace('Ano: ', '')}
                        </span>
                      )}
                    </div>

                    {/* Resumo */}
                    <div className="min-w-0 mt-1.5 md:mt-0">
                      {resumoShort ? (
                        <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{resumoShort}{resumo.length > 120 ? '…' : ''}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground/60 italic">Sem anotação registrada</p>
                      )}
                      {extraTags > 0 && (
                        <span className="inline-block mt-1 text-[10px] text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5">+{extraTags} tags</span>
                      )}
                    </div>

                    {/* Qualidade */}
                    <div className="mt-1.5 md:mt-0">
                      {c.qlevel !== 'sem' ? (
                        <Badge className={`text-[10px] px-2 py-0.5 ${getQualityColor(c.parsed?.qualidade || '')}`}>
                          {getQualityDot(c.parsed?.qualidade || '')} {c.parsed?.qualidade}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 text-muted-foreground">Sem anotação</Badge>
                      )}
                    </div>

                    {/* Data + ações */}
                    <div className="flex items-center justify-between gap-2 mt-1.5 md:mt-0">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDate(c.noteDate)}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedCard(c.card); }}
                          title="Ver anotação"
                          className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </button>
                        {c.referralUrl && (
                          <button
                            onClick={(e) => { e.stopPropagation(); window.open(ensureProtocol(c.referralUrl!), '_blank', 'noopener,noreferrer'); }}
                            title="Abrir origem"
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {/* Paginação */}
        {filteredContracts.length > PER_PAGE && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Mostrando {(pageSafe - 1) * PER_PAGE + 1}–{Math.min(pageSafe * PER_PAGE, filteredContracts.length)} de {filteredContracts.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground disabled:opacity-40 hover:bg-muted transition-colors"
              >
                ‹
              </button>
              {Array.from({ length: totalPages }).slice(0, 7).map((_, idx) => {
                // janela simples ao redor da página atual
                let n = idx + 1;
                if (totalPages > 7) {
                  const start = Math.min(Math.max(pageSafe - 3, 1), totalPages - 6);
                  n = start + idx;
                }
                return (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                      n === pageSafe ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold' : 'text-muted-foreground hover:bg-muted border border-transparent'
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground disabled:opacity-40 hover:bg-muted transition-colors"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ───────── Detail Modal (mantido) ───────── */}
      <Dialog open={!!selectedCard} onOpenChange={() => setSelectedCard(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-card">
          {selectedParsed && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4 text-primary" />
                  {selectedParsed.name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="space-y-1">
                  {selectedParsed.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{selectedParsed.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    <span>Contrato {selectedParsed.contractNo} · {formatDate(selectedParsed.noteDate)}</span>
                  </div>
                </div>

                <hr className="border-border" />

                {selectedParsed.parsed ? (
                  <>
                    {selectedParsed.parsed.caso && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">📂 Caso</p>
                        <p className="text-foreground">{selectedParsed.parsed.caso}</p>
                      </div>
                    )}
                    {selectedParsed.parsed.resumo_caso && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">📄 Resumo do caso</p>
                        <p className="text-foreground whitespace-pre-line">{selectedParsed.parsed.resumo_caso}</p>
                      </div>
                    )}
                    {selectedParsed.parsed.qualidade && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">📊 Qualidade do contrato</p>
                        <Badge className={`mb-1.5 ${getQualityColor(selectedParsed.parsed.qualidade)}`}>
                          {getQualityDot(selectedParsed.parsed.qualidade)} {selectedParsed.parsed.qualidade}
                        </Badge>
                        {selectedParsed.parsed.qualidade_detalhe && (
                          <p className="text-muted-foreground text-xs mt-1">
                            {selectedParsed.parsed.qualidade_detalhe.replace(/^(Alta|Média|Baixa)\s*—?\s*/i, '')}
                          </p>
                        )}
                      </div>
                    )}
                    {selectedParsed.parsed.potencial_retorno && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">💰 Potencial retorno</p>
                        <p className="text-foreground whitespace-pre-line">{selectedParsed.parsed.potencial_retorno}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs italic">
                    Anotação de contrato ainda não disponível. A busca será feita na próxima sincronização.
                  </p>
                )}

                <hr className="border-border" />

                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Trajetória do Lead
                    {selectedParsed.daysToContract > 0 && (
                      <span className="text-[10px] font-normal text-muted-foreground/70 ml-auto">
                        ⏱ {selectedParsed.daysToContract} dias até contrato
                      </span>
                    )}
                  </p>
                  <div className="relative pl-5 space-y-3">
                    <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
                    <TimelineEvent
                      icon={<Zap className="h-3 w-3 text-primary" />}
                      title="Lead criado"
                      subtitle={formatDate(selectedParsed.card.createdAt)}
                      color="bg-primary/15 border-primary/30"
                    />
                    {(selectedParsed.utmSource || selectedParsed.campaign) && (
                      <TimelineEvent
                        icon={<Target className="h-3 w-3 text-blue-500" />}
                        title={`Origem: ${selectedParsed.utmSource?.toUpperCase() || 'Direto'}${selectedParsed.utmMedium ? ` / ${selectedParsed.utmMedium.toUpperCase()}` : ''}`}
                        subtitle={selectedParsed.campaign || undefined}
                        extra={selectedParsed.utmHeadline || undefined}
                        color="bg-blue-500/15 border-blue-500/30"
                      />
                    )}
                    {selectedParsed.allSessions.map((session, idx) => {
                      const prevDate = idx === 0
                        ? new Date(selectedParsed.card.createdAt).getTime()
                        : new Date(selectedParsed.allSessions[idx - 1].sessionCreatedAt || '').getTime();
                      const currDate = new Date(session.sessionCreatedAt || '').getTime();
                      const daysDiff = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
                      const timeDiffLabel = daysDiff > 0 ? `+${daysDiff}d depois` : '';
                      return (
                        <TimelineEvent
                          key={session.id}
                          icon={<MessageCircle className="h-3 w-3 text-emerald-500" />}
                          title={`${session.departmentName || 'Atendimento'}${session.channelName ? ` • ${session.channelName}` : ''}`}
                          subtitle={[
                            session.agentName ? `Agente: ${session.agentName}` : null,
                            session.sessionCreatedAt ? formatDate(session.sessionCreatedAt) : null,
                            timeDiffLabel,
                          ].filter(Boolean).join(' • ')}
                          extra={session.utmCampaign ? `Campanha: ${session.utmCampaign}` : undefined}
                          color="bg-emerald-500/15 border-emerald-500/30"
                        />
                      );
                    })}
                    {selectedParsed.allSessions.length === 0 && selectedParsed.channelName && (
                      <TimelineEvent
                        icon={<MessageCircle className="h-3 w-3 text-emerald-500" />}
                        title={`Atendimento: ${selectedParsed.channelName}`}
                        subtitle={selectedParsed.agentName ? `Agente: ${selectedParsed.agentName}` : undefined}
                        color="bg-emerald-500/15 border-emerald-500/30"
                      />
                    )}
                    <TimelineEvent
                      icon={<GitBranch className="h-3 w-3 text-amber-500" />}
                      title={`Etapa: ${selectedParsed.card.stepTitle || 'Desconhecida'}`}
                      subtitle={selectedParsed.responsibleUser ? `Responsável: ${selectedParsed.responsibleUser}` : undefined}
                      color="bg-amber-500/15 border-amber-500/30"
                    />
                    <TimelineEvent
                      icon={<FileText className="h-3 w-3 text-emerald-400" />}
                      title="Contrato assinado"
                      subtitle={formatDate(selectedParsed.noteDate)}
                      extra={selectedParsed.card.monetaryAmount ? `Valor: ${formatCurrency(selectedParsed.card.monetaryAmount)}` : undefined}
                      color="bg-emerald-500/15 border-emerald-500/30"
                      isLast
                    />
                  </div>
                </div>

                <hr className="border-border" />

                <div className="space-y-1.5">
                  {selectedParsed.campaign && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>🎯 Campanha: <span className="text-foreground">{selectedParsed.campaign}</span></span>
                    </div>
                  )}
                  {selectedParsed.utmHeadline && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>📝 Anúncio: <span className="text-foreground">{selectedParsed.utmHeadline}</span></span>
                    </div>
                  )}
                  {selectedParsed.utmSource && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>🔗 Origem: <span className="text-foreground">{selectedParsed.utmSource.toUpperCase()}{selectedParsed.utmMedium ? ` / ${selectedParsed.utmMedium.toUpperCase()}` : ''}</span></span>
                    </div>
                  )}
                  {selectedParsed.channelName && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>📱 Canal: <span className="text-foreground">{selectedParsed.channelName}</span></span>
                    </div>
                  )}
                  {selectedParsed.responsibleUser && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>👤 Responsável: <span className="text-foreground">{selectedParsed.responsibleUser}</span></span>
                    </div>
                  )}
                  {selectedParsed.card.monetaryAmount != null && selectedParsed.card.monetaryAmount > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>💵 Valor: <span className="text-foreground">{formatCurrency(selectedParsed.card.monetaryAmount)}</span></span>
                    </div>
                  )}
                  {!selectedParsed.campaign && !selectedParsed.utmSource && !selectedParsed.channelName && (
                    <p className="text-xs text-muted-foreground italic">Sem dados de campanha disponíveis</p>
                  )}
                </div>

                {selectedParsed.referralUrl && (() => {
                  const safeUrl = ensureProtocol(selectedParsed.referralUrl!);
                  const isInstagram = safeUrl.includes('instagram.com');
                  const isFacebook = safeUrl.includes('fb.me') || safeUrl.includes('facebook.com');
                  return (
                    <div className="space-y-2">
                      <hr className="border-border" />
                      <p className="text-xs font-semibold text-muted-foreground">Preview do Anúncio</p>
                      {isInstagram ? (
                        <div className="overflow-hidden rounded-lg border border-border">
                          <iframe
                            src={`${safeUrl}embed/`}
                            className="h-[480px] w-full border-0"
                            allowFullScreen
                            title="Instagram Post"
                          />
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => window.open(safeUrl, '_blank', 'noopener,noreferrer')}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-primary transition-colors hover:bg-muted/60"
                          >
                            <ExternalLink className="h-4 w-4" />
                            {isFacebook ? 'Abrir no Facebook' : 'Abrir no navegador'}
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(safeUrl);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/60"
                          >
                            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                            {copied ? 'Copiado!' : 'Copiar'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContractsPage;
