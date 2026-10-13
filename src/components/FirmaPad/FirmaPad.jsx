import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Eraser } from 'lucide-react';

/**
 * Panel para firmar con el dedo (celular / tablet) o el mouse.
 * ref.current.exportar() → dataURL PNG (fondo blanco, recortado y reducido) o null si está vacío.
 */
const FirmaPad = forwardRef(function FirmaPad({ alto = 200, onCambio }, ref) {
  const canvasRef = useRef(null);
  const dibujando = useRef(false);
  const ultimo = useRef(null);
  const trazos = useRef(0);
  const [vacio, setVacio] = useState(true);

  const prepararCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.4;
    trazos.current = 0;
  };

  useEffect(() => {
    prepararCanvas();
    const onResize = () => { prepararCanvas(); setVacio(true); };
    window.addEventListener('orientationchange', onResize);
    return () => window.removeEventListener('orientationchange', onResize);
  }, []);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    dibujando.current = true;
    ultimo.current = pos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.arc(ultimo.current.x, ultimo.current.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
  };
  const move = (e) => {
    if (!dibujando.current) return;
    e.preventDefault();
    const p = pos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(ultimo.current.x, ultimo.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimo.current = p;
  };
  const up = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    trazos.current += 1;
    if (vacio) { setVacio(false); onCambio?.(false); }
  };
  const limpiar = () => { prepararCanvas(); setVacio(true); onCambio?.(true); };

  useImperativeHandle(ref, () => ({
    limpiar,
    vacio: () => trazos.current === 0,
    exportar: () => {
      const c = canvasRef.current;
      if (!c || trazos.current === 0) return null;
      // Recorte al área firmada + fondo blanco + tamaño máximo 600 px de ancho (documento liviano)
      const ctx = c.getContext('2d');
      const { width: w, height: h } = c;
      const data = ctx.getImageData(0, 0, w, h).data;
      let x0 = w; let y0 = h; let x1 = 0; let y1 = 0;
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          if (data[(y * w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
      }
      if (x1 <= x0 || y1 <= y0) return null;
      const pad = 12;
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w, x1 + pad); y1 = Math.min(h, y1 + pad);
      const cw = x1 - x0; const ch = y1 - y0;
      const escala = Math.min(1, 600 / cw);
      const out = document.createElement('canvas');
      out.width = Math.round(cw * escala); out.height = Math.round(ch * escala);
      const o = out.getContext('2d');
      o.fillStyle = '#ffffff'; o.fillRect(0, 0, out.width, out.height);
      o.drawImage(c, x0, y0, cw, ch, 0, 0, out.width, out.height);
      return out.toDataURL('image/png');
    },
  }));

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>
      <canvas
        ref={canvasRef}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
        style={{ width: '100%', height: alto, display: 'block', background: '#fff', border: '2px dashed #94a3b8', borderRadius: 10, touchAction: 'none', cursor: 'crosshair' }}
      />
      {vacio && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: '#94a3b8', fontSize: '0.95rem' }}>
          Firmá aquí con el dedo
        </div>
      )}
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 34, borderBottom: '1px solid #cbd5e1', pointerEvents: 'none' }} />
      <button type="button" onClick={limpiar}
        style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', padding: '0.3rem 0.55rem', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer', color: '#334155' }}>
        <Eraser size={13} /> Borrar
      </button>
    </div>
  );
});

export default FirmaPad;
