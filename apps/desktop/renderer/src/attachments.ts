import type { Attachment } from '@strix/ai-gateway';

// Max bytes we'll read per attached file (keeps prompts + memory sane).
export const MAX_ATTACH_BYTES = 10 * 1024 * 1024; // 10 MB

const IMAGE_RE = /^image\//;

// Read a dropped/picked file into an Attachment the AI can use:
// - images  → base64 data URL (for vision models)
// - PDFs    → extracted text
// - else    → UTF-8 text (markdown, code, json, csv, …)
export async function readAttachment(file: File): Promise<Attachment> {
  if (IMAGE_RE.test(file.type)) {
    return { name: file.name, imageUrl: await fileToDataUrl(file) };
  }
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return { name: file.name, text: await extractPdfText(file) };
  }
  return { name: file.name, text: await file.text() };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(file);
  });
}

// Extract text from a PDF using pdf.js (loaded lazily so it never costs the rest
// of the app — or the test runner — anything unless a PDF is actually attached).
async function extractPdfText(file: File): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const pages = Math.min(doc.numPages, 50);
    let out = '';
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((it) => (it as { str?: string }).str ?? '').join(' ') + '\n';
    }
    if (doc.numPages > pages) out += `\n…(${doc.numPages - pages} more pages omitted)`;
    return out.trim() || '(no extractable text in PDF)';
  } catch (e) {
    return `(could not read PDF: ${e instanceof Error ? e.message : String(e)})`;
  }
}
