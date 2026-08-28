/* Corrección de impresión física Zebra PDT
   - Etiqueta 2.5 x 1.0 in = 63.5 x 25.4 mm
   - Margen lateral fijo de 3 mm
   - El texto impreso conserva la escala de la vista previa */
(function () {
  window.printStyle = function (w, h) {
    let s = document.getElementById('dynamic-print-style');
    if (!s) {
      s = document.createElement('style');
      s.id = 'dynamic-print-style';
      document.head.appendChild(s);
    }

    s.textContent = `
      @media print {
        @page { margin: 0 !important; size: ${w}in ${h}in; }
        html, body {
          width: ${w}in !important; height: ${h}in !important;
          min-width: ${w}in !important; min-height: ${h}in !important;
          max-width: ${w}in !important; max-height: ${h}in !important;
          margin: 0 !important; padding: 0 !important;
          overflow: hidden !important; background: #fff !important;
        }
        #print-area {
          display: flex !important;
          width: ${w}in !important; height: ${h}in !important;
          min-width: ${w}in !important; min-height: ${h}in !important;
          max-width: ${w}in !important; max-height: ${h}in !important;
          margin: 0 !important; padding: 0 !important;
          box-sizing: border-box !important; overflow: hidden !important;
          background: #fff !important;
        }
        body.print-mode-barcode #print-barcode-content {
          display: flex !important; width: 100% !important; height: 100% !important;
          box-sizing: border-box !important;
          padding: 0.6mm 3mm !important;
          margin: 0 !important;
          flex-direction: column !important; justify-content: space-evenly !important;
          align-items: center !important; gap: 0 !important;
          overflow: hidden !important; background: #fff !important;
        }
        body.print-mode-barcode #print-barcode-content svg {
          display: block !important; width: auto !important; height: auto !important;
          max-width: calc(${w}in - 6mm) !important;
          max-height: calc((${h}in - 1.2mm) / 2) !important;
          margin: 0 auto !important; padding: 0 !important;
          flex: 0 1 auto !important; object-fit: contain !important;
          overflow: visible !important; background: #fff !important;
        }
        body.print-mode-text #print-text-label {
          display: flex !important; width: 100% !important; height: 100% !important;
          box-sizing: border-box !important; margin: 0 !important;
          padding: 1.5mm 3mm !important;
          align-items: center !important; justify-content: center !important;
          overflow: hidden !important; background: #fff !important;
        }
        #print-text-content {
          width: 100% !important; max-width: 100% !important; max-height: 100% !important;
          margin: 0 !important; padding: 0 !important;
          white-space: pre-wrap !important; overflow-wrap: anywhere !important;
          word-break: break-word !important; line-height: 1.06 !important;
          color: #000 !important; background: transparent !important;
        }
      }
    `;
  };

  const nativePrint = window.print.bind(window);
  const mmToPx = 96 / 25.4;

  function ajustarTextoFisicoAntesDeImprimir() {
    if (!document.body.classList.contains('print-mode-text')) return;

    const input = document.getElementById('text-label-input');
    const sizeSel = document.getElementById('text-select-size');
    const preview = document.getElementById('text-preview-content');
    const destino = document.getElementById('print-text-content');
    const alignSel = document.getElementById('text-label-align');
    const weightSel = document.getElementById('text-label-weight');
    if (!input || !sizeSel || !preview || !destino) return;

    const texto = input.value.trim();
    if (!texto) return;

    const [w, h] = sizeSel.value.split('x').map(Number);
    window.printStyle(w, h);

    const anchoUtilPx = Math.max(1, (w * 25.4 - 6) * mmToPx);
    const altoUtilPx = Math.max(1, (h * 25.4 - 3) * mmToPx);

    const previewStyle = getComputedStyle(preview);
    const previewFontPx = parseFloat(previewStyle.fontSize) || 16;
    const previewWidthPx = Math.max(1, preview.getBoundingClientRect().width);

    // Escala la fuente de pantalla al ancho físico útil de la etiqueta.
    let fontPx = previewFontPx * (anchoUtilPx / previewWidthPx) * 0.985;
    const minPx = 5 * 96 / 72;
    fontPx = Math.max(minPx, fontPx);

    const tester = document.createElement('div');
    tester.style.position = 'fixed';
    tester.style.left = '-10000px';
    tester.style.top = '-10000px';
    tester.style.visibility = 'hidden';
    tester.style.boxSizing = 'border-box';
    tester.style.width = `${anchoUtilPx}px`;
    tester.style.height = `${altoUtilPx}px`;
    tester.style.padding = '0';
    tester.style.margin = '0';
    tester.style.whiteSpace = 'pre-wrap';
    tester.style.overflowWrap = 'anywhere';
    tester.style.wordBreak = 'break-word';
    tester.style.lineHeight = '1.06';
    tester.style.fontFamily = 'Arial, sans-serif';
    tester.style.fontWeight = weightSel ? weightSel.value : previewStyle.fontWeight;
    tester.style.textAlign = alignSel ? alignSel.value : previewStyle.textAlign;
    tester.textContent = texto;
    document.body.appendChild(tester);

    const cabe = px => {
      tester.style.fontSize = `${px}px`;
      return tester.scrollWidth <= tester.clientWidth + 0.5 && tester.scrollHeight <= tester.clientHeight + 0.5;
    };

    if (!cabe(fontPx)) {
      let low = minPx, high = fontPx, best = minPx;
      for (let i = 0; i < 18; i++) {
        const mid = (low + high) / 2;
        if (cabe(mid)) { best = mid; low = mid; }
        else { high = mid; }
      }
      fontPx = best;
    }

    tester.remove();

    destino.textContent = texto;
    destino.style.setProperty('font-size', `${fontPx}px`, 'important');
    destino.style.setProperty('font-family', 'Arial, sans-serif', 'important');
    destino.style.setProperty('font-weight', weightSel ? weightSel.value : '700', 'important');
    destino.style.setProperty('text-align', alignSel ? alignSel.value : 'center', 'important');
    destino.style.setProperty('line-height', '1.06', 'important');
  }

  window.print = function () {
    ajustarTextoFisicoAntesDeImprimir();
    nativePrint();
  };
})();
