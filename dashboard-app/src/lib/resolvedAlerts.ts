const STORAGE_KEY = 'resolved_alerts_v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

type ResolvedMap = Record<string, { resolvedAt: string; lastMessageAt: string }>;

function read(): ResolvedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ResolvedMap;
    // Clean entries older than 24h
    const now = Date.now();
    const cleaned: ResolvedMap = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (now - new Date(entry.resolvedAt).getTime() < MAX_AGE_MS) {
        cleaned[id] = entry;
      }
    }
    if (Object.keys(cleaned).length !== Object.keys(parsed).length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return {};
  }
}

function write(map: ResolvedMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    // Notify listeners (same tab)
    window.dispatchEvent(new Event('resolved-alerts-changed'));
  } catch {
    // ignore
  }
}

export function getResolvedMap(): ResolvedMap {
  return read();
}

export function isResolved(sessionId: string, lastMessageAt: string): boolean {
  const map = read();
  const entry = map[sessionId];
  if (!entry) return false;
  // If a new message came in after we resolved, alert returns
  return new Date(lastMessageAt).getTime() <= new Date(entry.resolvedAt).getTime();
}

export function markResolved(sessionId: string, lastMessageAt: string) {
  const map = read();
  map[sessionId] = {
    resolvedAt: new Date().toISOString(),
    lastMessageAt,
  };
  write(map);
}

export function unmarkResolved(sessionId: string) {
  const map = read();
  delete map[sessionId];
  write(map);
}

export function subscribeResolvedAlerts(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener('resolved-alerts-changed', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('resolved-alerts-changed', handler);
    window.removeEventListener('storage', handler);
  };
}
