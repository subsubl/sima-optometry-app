import React, { useEffect, useId, useRef } from 'react';
import { NetworkPairingInfo } from '../../hooks/useExamSync';

interface PairingQrDialogProps {
  isOpen: boolean;
  onClose: () => void;
  networkInfo: NetworkPairingInfo | null;
}

export const PairingQrDialog: React.FC<PairingQrDialogProps> = ({
  isOpen,
  onClose,
  networkInfo,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

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

  const doctorUrl = networkInfo?.doctorUrl || `${window.location.origin}/#/doctor`;
  const patientUrl = networkInfo?.patientUrl || `${window.location.origin}/#/patient`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as any)}
      className="m-auto w-full max-w-sm bg-[#0D0F14] text-[#E2E8F0] border border-[#262B38] shadow-2xl p-0 backdrop:bg-black/80"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-[#13161F] border-b border-[#262B38]">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-3.5 bg-amber-500 inline-block" />
          <h2 id={titleId} className="text-xs font-mono font-bold uppercase tracking-[0.16em] text-white">
            Pair Remote
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
        <div className="flex flex-col items-center justify-center p-4 bg-white mx-auto w-52 h-52 border-2 border-[#262B38]">
          {networkInfo?.qrDataUrl ? (
            <img
              src={networkInfo.qrDataUrl}
              alt="Scan QR code to pair remote controller"
              width={192}
              height={192}
              style={{ aspectRatio: '1 / 1' }}
              className="w-44 h-44 object-contain"
            />
          ) : (
            <div className="w-44 h-44 flex items-center justify-center text-neutral-700 text-center text-[11px] p-3">
              SCAN OR OPEN REMOTE URL ON LAN
            </div>
          )}
        </div>

        <div className="space-y-2 bg-[#090B0E] p-3 border border-[#1E2330]">
          <div className="text-[10px] text-neutral-500 uppercase">REMOTE CONTROLLER ADDRESS</div>
          <div className="text-amber-400 break-all select-all text-[11px]">{doctorUrl}</div>
          <div className="text-[10px] text-neutral-500 uppercase pt-1.5">PATIENT DISPLAY ADDRESS</div>
          <div className="text-neutral-300 break-all select-all text-[11px]">{patientUrl}</div>
        </div>

        <form method="dialog" className="flex justify-end">
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
