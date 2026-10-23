import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialog } from './ui.jsx';
import Icon from './Icon.jsx';

// Barcode / QR scanning with the phone camera. It only shows where the browser can do it (Chrome on Android and desktop; not Safari on iPhone):
// there the button is simply absent, and a USB or Bluetooth scanner still works because it types the code and presses Enter.
export const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

function Scanner({ onCode, onClose }) {
  const video = useRef(null), [msg, setMsg] = useState('Starting the camera…');
  useEffect(() => {
    let stop = false, stream = null, timer = null;
    (async () => {
      try {
        const det = new window.BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stop) { stream.getTracks().forEach(t => t.stop()); return; }
        video.current.srcObject = stream; await video.current.play(); setMsg('Point the camera at the barcode.');
        const tick = async () => {
          if (stop) return;
          try { const r = await det.detect(video.current); if (r[0]?.rawValue) { stop = true; onCode(r[0].rawValue.trim()); return; } } catch { /* a frame that cannot be read: try the next */ }
          timer = setTimeout(tick, 200);
        };
        tick();
      } catch (e) { setMsg(e?.name === 'NotAllowedError' ? 'The camera is blocked. Allow it for this site in the browser settings.' : 'The camera could not be started on this device.'); }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Dialog title="Scan a barcode" onClose={onClose}>
      <video ref={video} className="scan-v" playsInline muted />
      <p className="mu" role="status">{msg}</p>
    </Dialog>
  );
}

export default function ScanButton({ onCode, className = '' }) {
  const [open, setOpen] = useState(false);
  if (!canScan()) return null;
  return (
    <>
      <button type="button" className={'scan-b ' + className} onMouseDown={e => e.preventDefault()} onClick={() => setOpen(true)} aria-label="Scan a barcode with the camera" title="Scan a barcode"><Icon name="scan" size={18} /></button>
      {open && createPortal(<Scanner onClose={() => setOpen(false)} onCode={c => { setOpen(false); onCode(c); }} />, document.body)}
    </>
  );
}
