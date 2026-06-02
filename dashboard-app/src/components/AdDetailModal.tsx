import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ExternalLink, TrendingUp, Users, FileCheck, Copy, Check } from 'lucide-react';
import { useState } from 'react';

export interface AdData {
  key: string;
  campaign: string;
  headline: string;
  source: string;
  sourceId: string;
  referralUrl: string | null;
  totalLeads: number;
  totalClosed: number;
  conversionRate: number;
}

interface AdDetailModalProps {
  ad: AdData | null;
  onClose: () => void;
}

function ensureProtocol(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return 'https://' + url;
}

const AdDetailModal = ({ ad, onClose }: AdDetailModalProps) => {
  const [copied, setCopied] = useState(false);

  if (!ad) return null;

  const safeUrl = ad.referralUrl ? ensureProtocol(ad.referralUrl) : null;
  const isInstagram = safeUrl?.includes('instagram.com');
  const isFacebook = safeUrl?.includes('fb.me') || safeUrl?.includes('facebook.com');

  return (
    <Dialog open={!!ad} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground">Detalhes do Anúncio</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Dados completos e preview do anúncio
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Metrics */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
              <Users className="mx-auto mb-1 h-4 w-4 text-primary" />
              <p className="text-lg font-bold text-foreground">{ad.totalLeads}</p>
              <p className="text-[11px] text-muted-foreground">Leads</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
              <FileCheck className="mx-auto mb-1 h-4 w-4 text-emerald-500" />
              <p className="text-lg font-bold text-foreground">{ad.totalClosed}</p>
              <p className="text-[11px] text-muted-foreground">Contratos</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
              <TrendingUp className="mx-auto mb-1 h-4 w-4 text-amber-500" />
              <p className="text-lg font-bold text-foreground">{ad.conversionRate.toFixed(1)}%</p>
              <p className="text-[11px] text-muted-foreground">Conversão</p>
            </div>
          </div>

          {/* Info */}
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-muted-foreground">Plataforma: </span>
              <span className="text-foreground">{ad.source}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Campanha: </span>
              <span className="text-foreground">{ad.campaign}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Headline: </span>
              <span className="text-foreground">{ad.headline}</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Source ID: </span>
              <span className="font-mono text-xs text-foreground">{ad.sourceId}</span>
            </div>
          </div>

          {/* Preview / Link */}
          {safeUrl && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Preview do Anúncio</h4>
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdDetailModal;
