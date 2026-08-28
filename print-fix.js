/* Auditoría y corrección de impresión física Zebra PDT
   - Etiqueta 2.5 x 1.0 in = 63.5 x 25.4 mm
   - Margen lateral fijo: 3 mm izquierda + 3 mm derecha
   - El texto se ajusta usando las dimensiones FÍSICAS reales antes de imprimir
   - Este archivo se carga después de app.js y reemplaza solo el flujo de impresión de texto */
(function () {
  const MM_TO_PX = 96 / 25.4;
  const PT_TO_PX = 96 / 72;

  window.printStyle = function (w, h) {
    let s = document.getElementById('dynamic-print-style');
    if (!s) {
      s = document.createElement('style');
      s.id = 'dynamic-print-style';
      document.head.appendChild(s);
    }

    s.textContent = `
      @media print {
        @page {
          margin: 0 !important;
          size: ${w}in ${h}in;
        }

        html, body {
          width: ${w}in !important;
          height: ${h}in !important;
          min-width: ${w}in !important;
          min-height: ${h}in !important;
          max-width: ${w}in !important;
          max-height: ${h}in !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: #fff !important;
        }

        .app-shell,
        .modal-overlay {
          display: none !important;
        }

        #print-area {
          display: flex !important;
          width: ${w}in !important;
          height: ${h}in !important;
          min-width: ${w}in !important;
          min-height: ${h}in !important;
          max-width: ${w}in !important;
          max-height: ${h}in !important;
          margin: 0 !important;
          padding: 0 !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          background: #fff !important;
        }

        body.print-mode-barcode #print-barcode-content {
          display: flex !important;
          width: 100% !important;
          height: 100% !important;
          box-sizing: border-box !important;
          padding: 0.6mm 3mm !important;
          margin: 0 !important;
          flex-direction: column !important;
          justify-content: space-evenly !important;
          align-items: center !important;
          gap: 0 !important;
          overflow: hidden !important;
          background: #fff !important;
        }

        body.print-mode-barcode #print-barcode-content svg {
          display: block !important;
          width: auto !important;
          height: auto !important;
          max-width: calc(${w}in - 6mm) !important;
          max-height: calc((${h}in - 1.2mm) / 2) !important;
          margin: 0 auto !important;
          padding: 0 !important;
          flex: 0 1 auto !important;
          object-fit: contain !important;
          overflow: visible !important;
          background: #fff !important;
        }

        body.print-mode-text #print-barcode-content {
          display: none !important;
        }

        body.print-mode-text #print-text-label {
          display: flex !important;
          width: 100% !important;
          height: 100% !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: 1.5mm 3mm !important;
          align-items: center !important;
          justify-content: center !important;
          overflow: hidden !important;
          background: #fff !important;
        }

        body.print-mode-text #print-text-content {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          box-sizing: border-box !important;
          white-space: pre-wrap !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
          line-height: 1.06 !important;
          color: #000 !important;
          background: transparent !important;
          overflow: hidden !important;
        }
      }
    `;
  };

  function medirYCalcularFuente(texto, cfg) {
    // Área útil física: se descuentan 3 mm por lado y 1.5 mm arriba/abajo.
    const anchoUtilMM = Math.max(1, cfg.w * 25.4 - 6);
    const altoUtilMM = Math.max(1, cfg.h * 25.4 - 3);
    const anchoPx = anchoUtilMM * MM_TO_PX;
    const altoPx = altoUtilMM * MM_TO_PX;

    const tester = document.createElement('div');
    Object.assign(tester.style, {
      position: 'fixed',
      left: '-10000px',
      top: '-10000px',
      visibility: 'hidden',
      boxSizing: 'border-box',
      width: `${anchoPx}px`,
      height: `${altoPx}px`,
      margin: '0',
      padding: '0',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      wordBreak: 'break-word',
      lineHeight: '1.06',
      fontFamily: 'Arial, sans-serif',
      fontWeight: cfg.weight,
      textAlign: cfg.align,
      overflow: 'hidden'
    });
    tester.textContent = texto;
    document.body.appendChild(tester);

    const cabe = pt => {
      tester.style.fontSize = `${pt}pt`;
      // scrollWidth/Height reflejan el contenido aunque overflow esté oculto.
      return tester.scrollWidth <= tester.clientWidth + 0.5 &&
             tester.scrollHeight <= tester.clientHeight + 0.5;
    };

    // En automático se comienza deliberadamente alto y se busca el máximo real que cabe.
    // Si el usuario selecciona un máximo manual, nunca se supera ese valor.
    const maxPt = cfg.max === 'auto'
      ? Math.min(96, Math.max(24, cfg.h * 72))
      : Number(cfg.max);

    const minPt = 5;
    let low = minPt;
    let high = Math.max(minPt, maxPt);
    let best = minPt;

    // Búsqueda binaria para obtener el mayor tamaño que cabe físicamente.
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (cabe(mid)) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    tester.remove();

    // Pequeño margen de seguridad para diferencias de rasterizado del driver Zebra/Chrome.
    return Math.max(minPt, best * 0.94);
  }

  function obtenerConfigTexto() {
    const size = document.getElementById('text-select-size');
    const align = document.getElementById('text-label-align');
    const weight = document.getElementById('text-label-weight');
    const max = document.getElementById('text-label-max-size');
    if (!size || !align || !weight || !max) return null;
    const [w, h] = size.value.split('x').map(Number);
    return { w, h, align: align.value, weight: weight.value, max: max.value };
  }

  function prepararTextoFisico() {
    const input = document.getElementById('text-label-input');
    const destino = document.getElementById('print-text-content');
    const cfg = obtenerConfigTexto();
    if (!input || !destino || !cfg) return false;

    const texto = input.value.trim();
    if (!texto) return false;

    window.printStyle(cfg.w, cfg.h);
    const fontPt = medirYCalcularFuente(texto, cfg);

    destino.textContent = texto;
    destino.style.setProperty('font-size', `${fontPt.toFixed(2)}pt`, 'important');
    destino.style.setProperty('font-family', 'Arial, sans-serif', 'important');
    destino.style.setProperty('font-weight', cfg.weight, 'important');
    destino.style.setProperty('text-align', cfg.align, 'important');
    destino.style.setProperty('line-height', '1.06', 'important');
    destino.style.setProperty('white-space', 'pre-wrap', 'important');
    destino.style.setProperty('overflow-wrap', 'anywhere', 'important');
    destino.style.setProperty('word-break', 'break-word', 'important');

    document.body.classList.remove('print-mode-barcode');
    document.body.classList.add('print-mode-text');
    return true;
  }

  function corregirPreviewMargen() {
    const box = document.getElementById('text-label-preview');
    const size = document.getElementById('text-select-size');
    if (!box || !size) return;
    const [w] = size.value.split('x').map(Number);
    const anchoMM = w * 25.4;
    // Representa visualmente 3 mm respecto al ancho REAL de la etiqueta.
    const pct = (3 / anchoMM) * 100;
    box.style.paddingLeft = `${pct}%`;
    box.style.paddingRight = `${pct}%`;
  }

  const btn = document.getElementById('btn-print-text');
  if (btn) {
    // Sustituye el onclick original de app.js. No se modifica window.print().
    btn.onclick = function () {
      if (!prepararTextoFisico()) return;
      if (typeof window.saveTextHistory === 'function') {
        window.saveTextHistory(true);
      }
      // Da un frame al navegador para aplicar el tamaño final antes del print preview.
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    };
  }

  // Ajusta también la representación visual del margen de 3 mm en la preview.
  ['text-select-size', 'text-label-align', 'text-label-weight', 'text-label-max-size', 'text-label-input']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const evt = id === 'text-label-input' ? 'input' : 'change';
        el.addEventListener(evt, () => requestAnimationFrame(corregirPreviewMargen));
      }
    });
  requestAnimationFrame(corregirPreviewMargen);
})();
