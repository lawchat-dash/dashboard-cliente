import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

// Paleta oficial LawChat
const C_LIGHT = '#8ED393';
const C_DARK = '#15BF41';

const STATUS_MESSAGES = [
  '✨ Conectando ao painel...',
  '📊 Carregando seus dados...',
  '🎯 Analisando funil de vendas...',
  '📈 Calculando KPIs...',
  '💬 Carregando atendimentos...',
  '⚡ Quase lá...',
];

interface LoadingScreenProps {
  userName?: string | null;
  // % REAL de carregamento (0–100). Se fornecida, sobrepõe a animação "fake".
  progress?: number;
  // rótulo extra (ex.: "12.430 de 14.015 registros")
  detail?: string | null;
}

const LoadingScreen = ({ userName, progress: realProgress, detail }: LoadingScreenProps = {}) => {
  const [statusIndex, setStatusIndex] = useState(0);
  const [fakeProgress, setFakeProgress] = useState(0);
  const isReal = typeof realProgress === 'number';
  // % exibida SEMPRE inteira (arredonda real E fake — o fake usava incrementos
  // float e vazava casas decimais tipo "42.604134...%" antes do total chegar).
  const progress = Math.round(isReal ? Math.max(0, Math.min(99, realProgress as number)) : fakeProgress);

  // Som de notificação leve ao montar (sintetizado, sem arquivo)
  useEffect(() => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      // Respeita autoplay: só toca se o contexto puder rodar (após interação do login)
      const playNote = (freq: number, start: number, dur: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      // Acorde leve ascendente (dó → mi → sol) — som "premium" suave
      playNote(523.25, 0.00, 0.30, 0.10); // C5
      playNote(659.25, 0.10, 0.30, 0.09); // E5
      playNote(783.99, 0.20, 0.45, 0.11); // G5
      setTimeout(() => { try { ctx.close(); } catch {} }, 1200);
    } catch {}
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIndex(prev => (prev + 1) % STATUS_MESSAGES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isReal) return; // quando a % real é fornecida, não anima o fake
    const interval = setInterval(() => {
      setFakeProgress(prev => (prev >= 95 ? 95 : prev + Math.random() * 6 + 2));
    }, 350);
    return () => clearInterval(interval);
  }, [isReal]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#0a0e1a]"
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Animated mesh background */}
        <motion.div
          className="absolute -top-32 -left-32 h-[400px] w-[400px] rounded-full blur-[100px]"
          style={{ background: `radial-gradient(circle, ${C_LIGHT}66 0%, transparent 70%)` }}
          animate={{ x: [0, 60, 0], y: [0, 40, 0], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-32 -right-32 h-[400px] w-[400px] rounded-full blur-[100px]"
          style={{ background: `radial-gradient(circle, ${C_DARK}66 0%, transparent 70%)` }}
          animate={{ x: [0, -60, 0], y: [0, -40, 0], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Logo with orbital rings (com bastante margem inferior pra não encostar no texto) */}
        <div className="relative mb-16">
          {/* Outer orbit */}
          <motion.div
            className="absolute -inset-12 rounded-full border"
            style={{ borderColor: `${C_LIGHT}33` }}
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 h-2 w-2 -translate-y-1 rounded-full"
              style={{ background: C_LIGHT, boxShadow: `0 0 10px ${C_LIGHT}cc` }}
            />
          </motion.div>

          {/* Middle orbit reverse */}
          <motion.div
            className="absolute -inset-8 rounded-full border"
            style={{ borderColor: `${C_LIGHT}4d` }}
            animate={{ rotate: -360 }}
            transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
          >
            <div
              className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1 h-1.5 w-1.5 rounded-full"
              style={{ background: C_DARK, boxShadow: `0 0 8px ${C_DARK}cc` }}
            />
          </motion.div>

          {/* Pulsating halo */}
          <motion.div
            className="absolute inset-0 rounded-full blur-2xl"
            style={{ background: `${C_DARK}66` }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Logo */}
          <motion.img
            src="/lawchat-logo.png"
            alt="LawChat"
            className="relative h-24 w-24"
            style={{ filter: `drop-shadow(0 0 30px ${C_DARK}99)` }}
            initial={{ scale: 0.7, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>

        {/* Brand name (mais espaço pra cima/baixo pra não encostar no logo) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-center mt-2 mb-1"
        >
          <h1 className="text-3xl font-bold text-white tracking-tight leading-tight">
            Law
            <span style={{ background: `linear-gradient(135deg, ${C_LIGHT}, ${C_DARK})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Chat
            </span>
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-[0.28em] text-white/45">
            Dashboard Comercial
          </p>
        </motion.div>

        {/* User greeting */}
        {userName && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-5 text-sm font-medium"
            style={{ color: C_LIGHT }}
          >
            Olá, {userName} 👋
          </motion.p>
        )}

        {/* Rotating status */}
        <div className="mt-10 h-6 flex items-center justify-center px-4">
          <AnimatePresence mode="wait">
            <motion.p
              key={statusIndex}
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.4 }}
              className="text-sm text-white/65"
            >
              {STATUS_MESSAGES[statusIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Progress bar */}
        <div className="mt-6 relative w-80">
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${C_LIGHT}, ${C_DARK})`,
                boxShadow: `0 0 10px ${C_DARK}80`,
              }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <motion.div
            className="absolute top-0 -translate-y-1 h-3 w-3 rounded-full"
            style={{ background: C_LIGHT, boxShadow: `0 0 15px ${C_LIGHT}` }}
            animate={{ left: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-4 font-mono text-xs text-white/30 tabular-nums"
        >
          {progress}%{detail ? ` · ${detail}` : ''}
        </motion.p>

        {/* Bottom hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-8 flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/30"
        >
          <span className="h-1 w-1 rounded-full animate-pulse" style={{ background: C_LIGHT }} />
          Powered by LawChat
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LoadingScreen;
