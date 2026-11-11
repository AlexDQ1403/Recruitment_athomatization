import { extractText } from 'unpdf';
import mammoth from 'mammoth';

/** Texto plano de una hoja de vida (PDF o DOCX) */

export const MAX_CV_TEXT = 15_000; // ~4 páginas; lo demás no cambia la extracción y encarece el LLM

export class CvReadError extends Error {}

export async function cvToText(bytes: Uint8Array, ext: string): Promise<string> {
  let text: string;
  if (ext === 'pdf') {
    const { text: merged } = await extractText(bytes, { mergePages: true });
    text = merged;
  } else if (ext === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    text = value;
  } else {
    throw new CvReadError('Solo podemos leer hojas de vida en PDF o DOCX. Guarda tu archivo como PDF y vuelve a subirlo.');
  }

  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  // PDF escaneado (imagen): no hay texto que leer
  if (text.length < 80) {
    throw new CvReadError('No pudimos leer texto en tu hoja de vida. Si es un escaneo o una imagen, súbela como PDF generado desde Word o Google Docs.');
  }
  return text.slice(0, MAX_CV_TEXT);
}
