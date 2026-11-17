// ===== PDF.js WORKER =====
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
}

// Phase 3 (spec §5, used by 3D Profile): PDF file -> plain text, in the browser (self-hosted PDF.js, no upload).
// Rejects when PDF.js is missing or the file cannot be read; the caller shows the error.
export async function extractPdfText(file) {
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF reader is not loaded.');
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text.trim();
}
