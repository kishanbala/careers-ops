import { showToast } from './render/toast.js';

// ===== PDF.js WORKER =====
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
}

// CV upload via PDF.js
document.getElementById('cv-upload-zone').addEventListener('click', () => document.getElementById('cv-file-input').click());
document.getElementById('cv-file-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById('cv-upload-prompt').style.display = 'none';
  document.getElementById('cv-uploading').style.display = 'block';
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    document.getElementById('p-cv').value = text.trim();
    document.getElementById('cv-upload-zone').classList.add('has-cv');
    document.getElementById('cv-upload-prompt').innerHTML = `<div style="font-size:28px;margin-bottom:8px;">✅</div><div style="font-size:13px;font-weight:600;color:var(--strong);">CV loaded</div><div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Click to replace</div>`;
    document.getElementById('cv-upload-prompt').style.display = 'block';
    document.getElementById('cv-uploading').style.display = 'none';
    showToast('CV extracted ✓');
  } catch (err) {
    document.getElementById('cv-uploading').style.display = 'none';
    document.getElementById('cv-upload-prompt').style.display = 'block';
    showToast('Failed to extract PDF text.', 3000);
  }
});
