/* Restauración de impresión física Zebra PDT
   Mantiene el tamaño seleccionado y, para 2.5 x 1.0 in, respeta exactamente
   63.5 x 25.4 mm. Cada CODE128 ocupa como máximo la mitad de la etiqueta. */
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
          padding: 0.025in 0.055in !important;
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
          max-width: calc(${w}in - 0.11in) !important;
          max-height: calc((${h}in - 0.05in) / 2) !important;
          margin: 0 auto !important;
          padding: 0 !important;
          flex: 0 1 auto !important;
          object-fit: contain !important;
          overflow: visible !important;
          background: #fff !important;
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

        #print-text-content {
          color: #000 !important;
          background: transparent !important;
        }
      }
    `;
  };
})();
