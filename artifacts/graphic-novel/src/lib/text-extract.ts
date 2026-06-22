// File picker filter. Note: legacy binary .doc is intentionally excluded — it
// cannot be parsed in the browser. Users get a clear error if they force one.
export const ACCEPTED_TEXT_TYPES =
  '.txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function getExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

async function extractPdf(file: File): Promise<string> {
  // Lazy-loaded so the ~2MB pdf engine + worker only ship when actually used.
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    parts.push(pageText);
  }
  return parts.join('\n\n');
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  return result.value;
}

/**
 * Extract plain text from an uploaded document. Supports .txt/.md, .pdf and
 * .docx. Legacy .doc (binary Word) is not supported and throws a clear error.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const ext = getExt(file.name);
  const type = file.type;

  if (ext === 'pdf' || type === 'application/pdf') {
    return (await extractPdf(file)).trim();
  }
  if (
    ext === 'docx' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return (await extractDocx(file)).trim();
  }
  if (ext === 'doc' || type === 'application/msword') {
    throw new Error('Old .doc files are not supported — save as .docx, PDF, or .txt and try again.');
  }
  // Treat everything else (txt, md, csv, unknown plain text) as text.
  return (await file.text()).trim();
}
