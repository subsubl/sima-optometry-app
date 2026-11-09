import React, { useEffect, useId, useRef, useState } from 'react';
import { NetworkPairingInfo } from '../../hooks/useExamSync';

interface PairingQrDialogProps {
  isOpen: boolean;
  onClose: () => void;
  networkInfo: NetworkPairingInfo | null;
  onSelectIp?: (ip: string) => void;
}

export const PairingQrDialog: React.FC<PairingQrDialogProps> = ({
  isOpen,
  onClose,
  networkInfo,
  onSelectIp,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [customIp, setCustomIp] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleClose);

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          dialog.close();
        }
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, [onClose]);

  const defaultHostname =
    typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  const defaultPort =
    typeof window !== 'undefined' ? Number(window.location.port) || 3020 : 3020;
  const activeLanIp =
    networkInfo?.lanIp ||
    (defaultHostname !== 'localhost' && defaultHostname !== '127.0.0.1'
      ? defaultHostname
      : '127.0.0.1');
  const port = networkInfo?.port || defaultPort;
  const doctorUrl = networkInfo?.doctorUrl || `http://${activeLanIp}:${port}/#/doctor`;
  const patientUrl = networkInfo?.patientUrl || `http://${activeLanIp}:${port}/#/patient`;

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore clipboard error
    }
  };

  const handleApplyCustomIp = (e: React.FormEvent) => {
    e.preventDefault();
    if (customIp.trim() && onSelectIp) {
      onSelectIp(customIp.trim());
    }
  };

  const availableIps = networkInfo?.allLanIps || (activeLanIp !== '127.0.0.1' ? [activeLanIp] : []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as any)}
      className="m-auto w-full max-w-md bg-[#0D0F14] text-[#E2E8F0] border border-[#262B38] shadow-2xl p-0 backdrop:bg-black/80"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-[#13161F] border-b border-[#262B38]">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-3.5 bg-amber-500 inline-block" />
          <h2 id={titleId} className="text-xs font-mono font-bold uppercase tracking-[0.16em] text-white">
            Pair Remote / LAN Controller
          </h2>
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="px-2 py-0.5 bg-[#1C202B] hover:bg-[#282E3D] border border-[#2E3446] text-[11px] font-mono text-neutral-300 cursor-pointer"
        >
          ESC
        </button>
      </div>

      <div className="p-5 space-y-4 font-mono text-xs">
        {/* QR CODE DISPLAY */}
        <div className="flex flex-col items-center justify-center p-3 bg-white mx-auto w-48 h-48 border-2 border-[#262B38]">
          {networkInfo?.qrDataUrl ? (
            <img
              src={networkInfo.qrDataUrl}
              alt="Scan QR code to pair remote controller"
              width={176}
              height={176}
              style={{ aspectRatio: '1 / 1' }}
              className="w-40 h-40 object-contain"
            />
          ) : (
            <div className="w-40 h-40 flex items-center justify-center text-neutral-700 text-center text-[10px] p-2 leading-relaxed">
              SCAN OR OPEN REMOTE URL ON LAN
            </div>
          )}
        </div>

        {/* NETWORK INTERFACE / IP SELECTOR */}
        {availableIps.length > 1 && (
          <div className="bg-[#090B0E] p-2.5 border border-[#1E2330] space-y-1.5">
            <div className="text-[10px] text-neutral-400 uppercase tracking-wider">
              SELECT LAN ADAPTER (WI-FI / ETHERNET)
            </div>
            <select
              value={activeLanIp}
              onChange={(e) => onSelectIp?.(e.target.value)}
              className="w-full bg-[#131620] border border-[#2B3244] text-amber-400 px-2 py-1 text-xs font-mono outline-none cursor-pointer"
            >
              {availableIps.map((ip) => {
                const adapter = networkInfo?.adapters?.find((a) => a.address === ip);
                return (
                  <option key={ip} value={ip}>
                    {ip} {adapter ? `(${adapter.name})` : ''}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* URL DISPLAY & ONE-CLICK COPY */}
        <div className="space-y-2.5 bg-[#090B0E] p-3 border border-[#1E2330]">
          <div>
            <div className="flex items-center justify-between text-[10px] text-neutral-500 uppercase pb-1">
              <span>REMOTE CONTROLLER (IPAD / PHONE)</span>
              <button
                type="button"
                onClick={() => copyToClipboard(doctorUrl, 'doctor')}
                className="text-[10px] text-amber-400 hover:text-amber-300 cursor-pointer underline"
              >
                {copiedKey === 'doctor' ? 'COPIED ✓' : 'COPY'}
              </button>
            </div>
            <div className="text-amber-400 break-all select-all text-[11px] bg-[#12151E] p-1.5 border border-[#1E2330]">
              {doctorUrl}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[10px] text-neutral-500 uppercase pb-1">
              <span>PATIENT DISPLAY (LANE MONITOR)</span>
              <button
                type="button"
                onClick={() => copyToClipboard(patientUrl, 'patient')}
                className="text-[10px] text-neutral-400 hover:text-white cursor-pointer underline"
              >
                {copiedKey === 'patient' ? 'COPIED ✓' : 'COPY'}
              </button>
            </div>
            <div className="text-neutral-300 break-all select-all text-[11px] bg-[#12151E] p-1.5 border border-[#1E2330]">
              {patientUrl}
            </div>
          </div>
        </div>

        {/* CUSTOM IP / HOSTNAME OVERRIDE */}
        <form onSubmit={handleApplyCustomIp} className="flex gap-2">
          <input
            type="text"
            placeholder="Custom LAN IP / Hostname (e.g. 192.168.1.50)"
            value={customIp}
            onChange={(e) => setCustomIp(e.target.value)}
            className="flex-1 bg-[#090B0E] border border-[#252B3B] px-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-[#171B26] hover:bg-[#202534] border border-[#2E3547] text-[11px] text-neutral-300 uppercase cursor-pointer"
          >
            Set IP
          </button>
        </form>

        {/* FIREWALL & LAN CONNECTIVITY NOTICE */}
        <div className="p-2.5 bg-[#11141D] border border-[#1F2533] text-[10px] leading-relaxed text-neutral-400 space-y-1">
          <div className="text-amber-400 font-bold uppercase flex items-center gap-1.5">
            <span>●</span> LAN ACCESS NOTE
          </div>
          <div>
            Connect your remote device (iPad / tablet / phone) to the same Wi-Fi network.
            If your Linux firewall blocks incoming LAN traffic, allow TCP port {port}:
          </div>
          <div className="bg-[#08090D] p-1 text-emerald-400 font-mono select-all border border-[#1A1F2C]">
            sudo ufw allow {port}/tcp
          </div>
        </div>

        <form method="dialog" className="flex justify-end pt-1">
          <button
            type="submit"
            autoFocus
            className="w-full py-2 bg-[#1A1E29] hover:bg-[#252B3B] border border-[#2D3343] text-xs font-mono font-bold uppercase text-white cursor-pointer"
          >
            Close
          </button>
        </form>
      </div>
    </dialog>
  );
};
