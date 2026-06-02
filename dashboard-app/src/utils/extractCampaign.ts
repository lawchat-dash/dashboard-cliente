import { Card } from '@/api/helena';

export function extractCampaign(card: Card): string {
  const url = card.customFields?.['an-ncio'];
  const texto = card.customFields?.['texto-campanha'];

  if (url) {
    if (url.includes('instagram.com')) {
      const match = url.match(/\/p\/([^\/\?]+)/);
      if (match) return `Instagram - ${match[1].substring(0, 8)}...`;
      return 'Instagram';
    }
    if (url.includes('facebook.com')) return 'Facebook';
    if (url.includes('google.com') || url.includes('goo.gl')) return 'Google Ads';
    if (url.includes('youtube.com')) return 'YouTube';
  }

  if (texto) return texto.length > 30 ? texto.substring(0, 30) + '...' : texto;
  return 'Orgânico / Direto';
}
