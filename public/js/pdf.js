// ===== PDF.js (self-hosted, lazy) =====
// Phase 4C (#41): the 320 KB pdf.min.js is not needed to paint any screen. It is loaded on demand by
// extractPdfText (first CV PDF import), instead of blocking first paint. Same-origin only.
let pdfReady = null;
function loadPdfJs() {
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
    return Promise.resolve();
  }
  if (!pdfReady) {
    pdfReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/pdfjs/pdf.min.js';
      s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js'; resolve(); };
      s.onerror = () => { pdfReady = null; reject(new Error('PDF reader is not loaded.')); };
      document.head.appendChild(s);
    });
  }
  return pdfReady;
}
// Phase 3 (spec §5, used by 3D Profile): PDF file -> plain text, in the browser (self-hosted PDF.js, no upload).
// Rejects when PDF.js is missing or the file cannot be read; the caller shows the error.
export async function extractPdfText(file) {
  await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text.trim();
}
