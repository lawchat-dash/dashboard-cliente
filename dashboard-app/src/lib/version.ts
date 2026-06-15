// ============================================================
// VERSÃO + RELATÓRIO DE ATUALIZAÇÕES (fonte única)
// ------------------------------------------------------------
// Formato: MAJOR.MINOR.PATCH.BUILD  (ex.: 1.00.0.0 → 1.00.1.2)
// A cada modificação que sobe pra produção:
//   1. incremente APP_VERSION (normalmente o último/penúltimo número)
//   2. adicione uma entrada NO TOPO de CHANGELOG com a data e o que mudou
// Assim o "Relatório de Atualizações" (admin) sempre reflete o histórico.
// ============================================================

export const APP_VERSION = '1.00.0.0';

// Beta enquanto estamos lançando pros primeiros clientes.
export const IS_BETA = true;

export interface ChangelogEntry {
  version: string;
  date: string;   // YYYY-MM-DD
  title?: string;
  changes: string[];
}

// Mais recente em CIMA.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.00.0.0',
    date: '2026-06-15',
    title: 'Lançamento inicial (Beta)',
    changes: [
      'Dashboard comercial: KPIs, funil de vendas, evolução de chats, origem dos leads e mapa por estado.',
      'Campanhas: ranking de anúncios, funil por campanha e UTM completo.',
      'Auditoria de leads: etapas + lista + pré-visualização da conversa + filtro por tags (ex.: "IA desativada").',
      'Follow Up: cadências, disparos e taxa de resposta.',
      'Sincronização automática com a Helena (horária + noturna) capturando tags, responsável, setor e classificação.',
      'Modo TV (apresentação) e tela de acesso não liberado para links sem cadastro.',
      'Segurança: a chave da Helena nunca é retornada nas respostas da API.',
    ],
  },
];
