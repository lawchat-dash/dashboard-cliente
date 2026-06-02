import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
}

/**
 * Conta de 0 até `value` com easing suave ao montar / quando o valor muda.
 * Usa pt-BR (separador de milhar) e respeita prefers-reduced-motion.
 */
const AnimatedCounter = ({
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  duration = 1200,
  className,
}: AnimatedCounterProps) => {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const fallbackRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduce) { setDisplay(value); return; }

    fromRef.current = display;
    startRef.current = null;
    const to = value;
    const from = fromRef.current;

    // Se já está no valor, não anima (evita re-render desnecessário)
    if (from === to) { setDisplay(to); return; }

    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else setDisplay(to);
    };
    rafRef.current = requestAnimationFrame(tick);

    // FALLBACK: requestAnimationFrame PAUSA em abas de fundo / é throttled.
    // Um timer garante que o valor final SEMPRE seja exibido depois da duração,
    // mesmo se o RAF congelar no meio (números nunca ficam "travados" errados).
    fallbackRef.current = setTimeout(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setDisplay(to);
    }, duration + 300);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const formatted = display.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return <span className={className}>{prefix}{formatted}{suffix}</span>;
};

export default AnimatedCounter;
