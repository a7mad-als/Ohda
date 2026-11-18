import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X } from "lucide-react";

/** Extracts a 6-character Ohda deal code from a scanned QR value (invite link or raw code). */
export function codeFromQr(value: string): string | null {
  const fromLink = /\/j\/([A-Za-z0-9]{6})(?:[/?#]|$)/.exec(value.trim());
  if (fromLink) return fromLink[1].toUpperCase();
  const raw = value.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(raw) ? raw : null;
}

export function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("وجّه الكاميرا على باركود الصفقة");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setError("المتصفح ما يدعم الكاميرا. اكتب الكود بدلاً منه."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const video = videoRef.current;
        if (!video || stopped) return;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        await video.play();
        tick();
      } catch {
        setError("ما قدرنا نفتح الكاميرا. اسمح للموقع باستخدامها، أو اكتب الكود بدلاً منه.");
      }
    }
    function tick() {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth, h = video.videoHeight;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const result = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
          if (result?.data) {
            const code = codeFromQr(result.data);
            if (code) { stopped = true; onCode(code); return; }
            setHint("هذا الباركود مو حق صفقة في عهدة");
          }
        }
      }
      frame = requestAnimationFrame(tick);
    }
    void start();
    return () => { stopped = true; cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()); };
  }, [onCode]);

  return <div className="qr-scan-backdrop" role="dialog" aria-modal="true" aria-label="امسح باركود الصفقة">
    <div className="qr-scan-box">
      <button type="button" className="qr-scan-close" aria-label="إغلاق" onClick={onClose}><X size={20} /></button>
      <strong>امسح باركود الصفقة</strong>
      {error ? <p role="alert" className="qr-scan-error">{error}</p> : <>
        <div className="qr-scan-view"><video ref={videoRef} muted playsInline /><span className="qr-scan-frame" /></div>
        <small>{hint}</small>
      </>}
      <canvas ref={canvasRef} hidden />
    </div>
  </div>;
}
