import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, Bot } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTION_CHIPS = [
  { emoji: '📊', label: 'Relatório deste mês' },
  { emoji: '📉', label: 'Onde estou perdendo leads?' },
  { emoji: '✍️', label: 'Contratos parados' },
  { emoji: '🏆', label: 'Melhor mês' },
  { emoji: '⚡', label: 'Taxa de eficiência atual' },
];

const THINKING_TEXTS = [
  'Consultando dados...',
  'Analisando o funil...',
  'Calculando métricas...',
];

/* ── Markdown renderer ── */
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc pl-4 my-1 space-y-0.5">
          {listItems.map((li, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: inlineMd(li) }} />
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  const inlineMd = (s: string) =>
    s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
     .replace(/\*(.+?)\*/g, '<em>$1</em>');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^#{1,3}\s/.test(line)) {
      flushList();
      const level = (line.match(/^#+/)![0].length) as 1 | 2 | 3;
      const text = line.replace(/^#+\s*/, '');
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
      elements.push(<Tag key={i} className="font-semibold mt-2 mb-1" dangerouslySetInnerHTML={{ __html: inlineMd(text) }} />);
    } else if (/^[-•]\s/.test(line)) {
      listItems.push(line.replace(/^[-•]\s*/, ''));
    } else {
      flushList();
      if (line.trim() === '') {
        elements.push(<br key={i} />);
      } else {
        elements.push(<p key={i} className="my-0.5" dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />);
      }
    }
  }
  flushList();
  return <>{elements}</>;
}

/* ── Thinking indicator ── */
const ThinkingIndicator = () => {
  const [textIndex, setTextIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTextIndex(prev => (prev + 1) % THINKING_TEXTS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex justify-start">
      <div className="bg-muted rounded-xl px-4 py-3 flex items-center gap-2">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{THINKING_TEXTS[textIndex]}</span>
      </div>
    </div>
  );
};

/* ── Main component ── */
const SalesAgentFAB = ({ clientId }: { clientId?: string }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const streamChat = async (msgs: Msg[]) => {
    setLoading(true);
    let assistantSoFar = '';

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/sales-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ messages: msgs, clientId }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Erro na conexão' }));
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err.error || 'Erro ao conectar com o agente.'}` }]);
        setLoading(false);
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      const upsert = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
          }
          return [...prev, { role: 'assistant', content: assistantSoFar }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, idx);
          textBuffer = textBuffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsert(content);
          } catch { textBuffer = line + '\n' + textBuffer; break; }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Erro de conexão. Tente novamente.' }]);
    }
    setLoading(false);
  };

  const handleSend = () => {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: input.trim() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    streamChat(newMsgs);
  };

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors print:hidden"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        title="Agente de Análise"
      >
        <Sparkles className="h-6 w-6" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: 400 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 400 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl print:hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Agente de Vendas</h3>
                  <p className="text-xs text-muted-foreground">Consulta dados em tempo real</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md p-1.5 hover:bg-muted transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messages.length === 0 && !loading && (
                <div className="space-y-4">
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
                      <p className="font-medium mb-1">👋 Olá! Sou seu assistente de vendas.</p>
                      <p className="text-muted-foreground">Tenho acesso direto ao banco de dados. Pergunte qualquer coisa sobre seus leads, conversões e funil!</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTION_CHIPS.map(chip => (
                      <button
                        key={chip.label}
                        onClick={() => setInput(chip.label)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted hover:border-primary/30 transition-colors"
                      >
                        <span>{chip.emoji}</span>
                        <span>{chip.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}>
                    {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                  </div>
                </div>
              ))}
              {loading && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') && (
                <ThinkingIndicator />
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Pergunte sobre os dados..."
                  className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  disabled={loading}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SalesAgentFAB;
