import React, { useState, useEffect } from 'react';
import { X, Smartphone, Copy, Check, Wifi, Globe, ExternalLink } from 'lucide-react';

interface MobileAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NetworkInfo {
  port: number;
  localUrl: string;
  networkUrls: string[];
  primaryNetworkUrl: string;
  isCloud?: boolean;
}

export const MobileAccessModal: React.FC<MobileAccessModalProps> = ({ isOpen, onClose }) => {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch('/api/network-info')
      .then((res) => res.json())
      .then((data: NetworkInfo) => {
        setNetworkInfo(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Falha ao obter dados de rede:', err);
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  // Detecção automática inteligente:
  // Se estivermos acessando por domínio na internet (ex: onrender.com) ou se a API indicar nuvem,
  // usa a URL atual da janela (window.location.origin) que funciona em qualquer 3G/4G/Wi-Fi no mundo inteiro!
  const isCloudOrWeb =
    networkInfo?.isCloud ||
    (typeof window !== 'undefined' &&
      !window.location.hostname.includes('localhost') &&
      !window.location.hostname.includes('127.0.0.1') &&
      !window.location.hostname.startsWith('10.') &&
      !window.location.hostname.startsWith('192.168.'));

  const targetUrl = isCloudOrWeb
    ? window.location.origin
    : (networkInfo?.primaryNetworkUrl || window.location.origin);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(
    targetUrl
  )}`;

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Acessar no Celular</h3>
              <p className="text-xs text-slate-500">Conecte qualquer celular ou tablet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            {loading ? (
              <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">
                Carregando rede...
              </div>
            ) : (
              <div className="space-y-2 text-center">
                <img
                  src={qrCodeUrl}
                  alt="QR Code de Acesso"
                  className="w-48 h-48 rounded-lg shadow-xs mx-auto bg-white p-2 border border-slate-200"
                />
                <p className="text-[11px] font-medium text-slate-500">
                  Aponte a câmera do celular para abrir
                </p>
              </div>
            )}
          </div>

          {/* Direct Link box */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Link direto no navegador do celular:</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={targetUrl}
                className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-lg font-mono text-slate-800 focus:outline-none select-all"
              />
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors shrink-0 shadow-xs ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          {/* Important instructions */}
          <div className="space-y-2.5 pt-1 border-t border-slate-100 text-xs text-slate-600">
            {isCloudOrWeb ? (
              <div className="flex items-start gap-2 text-emerald-800 bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-100">
                <Globe className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Acesso Global Detectado:</strong> Você está usando a versão em nuvem. Qualquer celular com internet (Wi-Fi ou 4G/5G) pode escanear o QR Code e abrir diretamente!
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <Wifi className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Rede Local Wi-Fi:</strong> O celular precisa estar conectado na mesma rede Wi-Fi deste computador.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Globe className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Fora de casa / 4G:</strong> Para acessar de qualquer lugar pela internet sem depender deste computador ligado, acesse o link publicado na nuvem.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
