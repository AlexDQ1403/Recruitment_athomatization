/**
 * Aplica los correos de Kmella (supabase/templates) al proyecto de Supabase y
 * agrega las URL de la app a las redirecciones permitidas de Auth.
 *
 * Uso (desde backend/):
 *   SUPABASE_ACCESS_TOKEN=sbp_... npm run emails:apply
 *
 * El token es personal (Supabase → Account → Access Tokens), no la service role.
 * Con --dry-run muestra qué cambiaría sin tocar nada.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEMPLATES_DIR = resolve(__dirname, '../../../supabase/templates');
const APP_URLS = ['http://localhost:3002', 'https://kmella-web.onrender.com'];

const EMAILS = {
  confirmation: { subject: 'Confirma tu correo en Kmella', file: 'confirmacion.html' },
  recovery: { subject: 'Restablece tu contraseña de Kmella', file: 'recuperacion.html' },
  invite: { subject: 'Te invitaron a Kmella: crea tu contraseña', file: 'invitacion.html' },
} as const;

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!token || !supabaseUrl) {
    console.error('Faltan SUPABASE_ACCESS_TOKEN (token personal) y/o SUPABASE_URL (backend/.env)');
    process.exitCode = 1;
    return;
  }
  const ref = new URL(supabaseUrl).hostname.split('.')[0];
  const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const current = await fetch(api, { headers });
  if (!current.ok) throw new Error(`No se pudo leer la configuración de Auth: HTTP ${current.status} ${await current.text()}`);
  const config = (await current.json()) as { uri_allow_list?: string | null; site_url?: string };

  // Se agregan las URL de la app sin borrar las que ya estaban
  const allow = new Set((config.uri_allow_list ?? '').split(',').map((u) => u.trim()).filter(Boolean));
  for (const url of APP_URLS) allow.add(`${url}/**`);

  const body: Record<string, string> = { uri_allow_list: [...allow].join(',') };
  for (const [kind, { subject, file }] of Object.entries(EMAILS)) {
    body[`mailer_subjects_${kind}`] = subject;
    body[`mailer_templates_${kind}_content`] = readFileSync(resolve(TEMPLATES_DIR, file), 'utf8');
  }

  console.log(`Proyecto: ${ref} · URL del sitio: ${config.site_url ?? '(sin definir)'}`);
  console.log('Redirecciones permitidas:', body.uri_allow_list);
  console.log('Correos:', Object.values(EMAILS).map((e) => `«${e.subject}»`).join(', '));
  if (process.argv.includes('--dry-run')) return console.log('--dry-run: no se cambió nada');

  const res = await fetch(api, { method: 'PATCH', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`No se pudo actualizar: HTTP ${res.status} ${await res.text()}`);
  console.log('Listo: correos y redirecciones actualizados en Supabase.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  // exitCode y no exit(): en Windows, exit() justo tras un fetch hace fallar libuv
  process.exitCode = 1;
});
