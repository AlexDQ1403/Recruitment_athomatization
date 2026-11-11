import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Hojas de vida en Supabase Storage, en un bucket PRIVADO: tienen teléfono,
 * correo y dirección, así que no pueden quedar en una URL pública. El candidato
 * sube por el backend (que valida tipo y tamaño) y quien la abre recibe un
 * enlace firmado que vence.
 *
 * En candidate_profiles.cv_url se guarda "storage:resumes/<ruta>". Siguen
 * funcionando las URL públicas antiguas del bucket y los enlaces externos.
 */

export const RESUMES_BUCKET = 'resumes';
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const PREFIX = `storage:${RESUMES_BUCKET}/`;
const SIGNED_TTL_SECONDS = 60 * 60;

/** Tipos aceptados, reconocidos por sus primeros bytes (no por la extensión que manda el navegador). */
const SIGNATURES: { ext: string; mime: string; magic: number[] }[] = [
  { ext: 'pdf', mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [0x50, 0x4b, 0x03, 0x04] },
  { ext: 'doc', mime: 'application/msword', magic: [0xd0, 0xcf, 0x11, 0xe0] },
];

export function detectResumeType(bytes: Uint8Array): { ext: string; mime: string } | null {
  const hit = SIGNATURES.find((s) => s.magic.every((b, i) => bytes[i] === b));
  return hit ? { ext: hit.ext, mime: hit.mime } : null;
}

/** Ruta dentro del bucket, o null si cv_url es un enlace externo. */
export function resumePathOf(cvUrl: string | null | undefined): string | null {
  if (!cvUrl) return null;
  if (cvUrl.startsWith(PREFIX)) return cvUrl.slice(PREFIX.length);
  const marker = `/${RESUMES_BUCKET}/`;
  const at = cvUrl.indexOf(marker);
  if (at >= 0 && cvUrl.includes('/storage/v1/object/')) return decodeURIComponent(cvUrl.slice(at + marker.length).split('?')[0]);
  return null;
}

let bucketReady: Promise<void> | null = null;

/** Crea el bucket privado si no existe (una vez por proceso). */
export function ensureResumesBucket(db: SupabaseClient): Promise<void> {
  bucketReady ??= (async () => {
    const { data } = await db.storage.getBucket(RESUMES_BUCKET);
    if (data) return;
    const { error } = await db.storage.createBucket(RESUMES_BUCKET, {
      public: false,
      fileSizeLimit: MAX_RESUME_BYTES,
      allowedMimeTypes: SIGNATURES.map((s) => s.mime),
    });
    // Otra petición pudo crearlo al mismo tiempo
    if (error && !/already exists/i.test(error.message)) throw error;
  })().catch((err) => {
    bucketReady = null;
    throw err;
  });
  return bucketReady;
}

export async function uploadResume(db: SupabaseClient, userId: string, bytes: Uint8Array): Promise<string> {
  const type = detectResumeType(bytes);
  if (!type) throw new ResumeError('El archivo debe ser PDF, DOC o DOCX');
  if (bytes.byteLength > MAX_RESUME_BYTES) throw new ResumeError('El archivo supera los 5 MB');
  await ensureResumesBucket(db);
  const path = `${userId}/cv-${Date.now()}.${type.ext}`;
  const { error } = await db.storage.from(RESUMES_BUCKET).upload(path, bytes, { contentType: type.mime, upsert: false });
  if (error) throw error;
  return `${PREFIX}${path}`;
}

/** Enlace para abrir la HV: firmado si está en el bucket, tal cual si es externo. */
export async function resumeLink(db: SupabaseClient, cvUrl: string | null | undefined): Promise<string | null> {
  if (!cvUrl) return null;
  const path = resumePathOf(cvUrl);
  if (!path) return cvUrl;
  const { data, error } = await db.storage.from(RESUMES_BUCKET).createSignedUrl(path, SIGNED_TTL_SECONDS);
  return error || !data ? null : data.signedUrl;
}

export class ResumeError extends Error {}
