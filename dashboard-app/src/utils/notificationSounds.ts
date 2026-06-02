/**
 * Notification Sounds - Web Audio API
 * 
 * Sons distintos para cada tipo de evento:
 * 
 * 🔔 Nova Notificação: Chime duplo suave (dois tons ascendentes)
 * 🎉 Contrato Assinado: Fanfarra triunfante (acorde maior ascendente)
 * ✅ Proposta Aceita: Confirmação positiva (dois tons harmônicos)
 * ⚠️ Dificuldade Assinatura: Alerta urgente (tom pulsante de atenção)
 * 📋 Notificação Geral: Ping neutro (tom único curto)
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

function playTone(
  frequency: number,
  duration: number,
  startTime: number,
  ctx: AudioContext,
  type: OscillatorType = 'sine',
  volume = 0.15,
  fadeOut = true
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(volume, startTime);
  if (fadeOut) {
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  }
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

/** 🔔 Nova Notificação - Chime duplo ascendente (dó-mi) */
export function playNewNotificationSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    playTone(523.25, 0.2, now, ctx, 'sine', 0.12);       // C5
    playTone(659.25, 0.3, now + 0.15, ctx, 'sine', 0.15); // E5
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

/** 🎉 Contrato Assinado - Fanfarra triunfante (acorde maior C-E-G-C) */
export function playContractSignedSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    playTone(523.25, 0.2, now, ctx, 'triangle', 0.1);         // C5
    playTone(659.25, 0.2, now + 0.12, ctx, 'triangle', 0.12);  // E5
    playTone(783.99, 0.2, now + 0.24, ctx, 'triangle', 0.14);  // G5
    playTone(1046.5, 0.5, now + 0.36, ctx, 'sine', 0.18);      // C6 (sustain)
    // Harmonic shimmer
    playTone(1318.5, 0.4, now + 0.4, ctx, 'sine', 0.06);       // E6 soft
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

/** ✅ Proposta de Honorários Aceita - Confirmação positiva (sol-dó agudo) */
export function playProposalAcceptedSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    playTone(783.99, 0.15, now, ctx, 'sine', 0.12);       // G5
    playTone(1046.5, 0.35, now + 0.12, ctx, 'sine', 0.16); // C6
    playTone(1046.5, 0.25, now + 0.12, ctx, 'triangle', 0.05); // C6 harmonic
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

/** ⚠️ Dificuldade na Assinatura - Alerta pulsante (tom urgente A-A-A) */
export function playDifficultyAlertSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    playTone(440, 0.12, now, ctx, 'square', 0.08);           // A4
    playTone(440, 0.12, now + 0.18, ctx, 'square', 0.08);    // A4
    playTone(523.25, 0.25, now + 0.36, ctx, 'square', 0.1);  // C5 (up)
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

/** 📋 Notificação Geral - Ping neutro */
export function playGenericNotificationSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    playTone(880, 0.2, now, ctx, 'sine', 0.1); // A5
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

/**
 * Toca o som apropriado baseado no status do lead
 */
export function playNotificationSoundByStatus(externalStatus: string | null) {
  const s = (externalStatus || '').toLowerCase();

  if (s.includes('contrato assinado')) {
    playContractSignedSound();
  } else if (s.includes('proposta') || s.includes('honorário') || s.includes('honorario') || s.includes('elabor') || s.includes('confecção') || s.includes('confeccao')) {
    playProposalAcceptedSound();
  } else if (s.includes('dificuldade') || s.includes('não assinou') || s.includes('nao assinou') || s.includes('intervenção') || s.includes('intervencao')) {
    playDifficultyAlertSound();
  } else if (s.includes('qualificado') || s.includes('novo') || s.includes('new')) {
    playNewNotificationSound();
  } else {
    playGenericNotificationSound();
  }
}
