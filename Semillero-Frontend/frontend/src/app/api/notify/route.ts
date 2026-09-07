import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const STATUS_LABELS: Record<string, string> = {
  pending:     'Pendiente de revisión',
  interviewed: 'Seleccionado para entrevista',
  hired:       'Contratado',
  rejected:    'No continuará en el proceso',
};

const STATUS_MESSAGES: Record<string, { subject: string; heading: string; body: string; color: string }> = {
  interviewed: {
    subject: '¡Felicitaciones! Pasaste a la siguiente etapa',
    heading: '¡Buenas noticias!',
    body: 'Tu perfil fue revisado y has sido seleccionado para continuar en el proceso de selección. Pronto te contactaremos para coordinar una entrevista.',
    color: '#4f6ef7',
  },
  hired: {
    subject: '¡Bienvenido al equipo! 🎉',
    heading: '¡Felicitaciones, fuiste seleccionado!',
    body: 'Es un placer informarte que has sido seleccionado para el cargo. Nuestro equipo se pondrá en contacto contigo muy pronto con los detalles del siguiente paso.',
    color: '#34d399',
  },
  rejected: {
    subject: 'Actualización sobre tu aplicación',
    heading: 'Gracias por tu interés',
    body: 'Hemos revisado tu perfil con cuidado. En esta ocasión no continuaremos con tu candidatura para este cargo, pero conservaremos tu información para futuras oportunidades que se ajusten mejor a tu perfil.',
    color: '#f87171',
  },
};

async function verifySession(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: { user } } = await supabase.auth.getUser(token);
  return user;
}

export async function POST(req: NextRequest) {
  const caller = await verifySession(req);
  if (!caller) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    // Sin key configurada — no es error crítico, solo skip silencioso
    return NextResponse.json({ sent: false, reason: 'RESEND_API_KEY no configurada' });
  }

  let body: { candidate_email?: string; candidate_name?: string; status?: string; vacancy_title?: string; company?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }); }

  const { candidate_email, candidate_name, status, vacancy_title, company } = body;

  if (!candidate_email || !status) {
    return NextResponse.json({ sent: false, reason: 'Sin email o status' });
  }

  const template = STATUS_MESSAGES[status];
  if (!template) return NextResponse.json({ sent: false, reason: 'Status sin template de email' });

  const resend = new Resend(resendKey);
  const vacancyInfo = vacancy_title ? `<strong>${vacancy_title}</strong>${company ? ` en ${company}` : ''}` : 'el cargo solicitado';

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0c;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0c;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111110;border:1px solid #2a2a26;border-radius:12px;overflow:hidden;max-width:560px;width:100%">

        <!-- Header -->
        <tr><td style="background:#111110;padding:28px 36px;border-bottom:1px solid #2a2a26">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <span style="background:#d4845a;color:#0d0d0c;padding:4px 10px;border-radius:5px;font-size:15px;font-weight:700;font-style:italic;letter-spacing:-0.02em">S</span>
                <span style="color:#f0ede6;font-size:16px;font-weight:600;margin-left:8px;letter-spacing:-0.02em">Semillero</span>
              </td>
              <td align="right">
                <span style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:${template.color}20;color:${template.color}">
                  ${STATUS_LABELS[status] ?? status}
                </span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 36px 28px">
          <h1 style="color:#f0ede6;font-size:22px;font-weight:400;font-style:italic;margin:0 0 16px;line-height:1.2">${template.heading}</h1>
          <p style="color:#9a9690;font-size:15px;line-height:1.7;margin:0 0 16px">
            Hola <strong style="color:#f0ede6">${candidate_name ?? 'candidato/a'}</strong>,
          </p>
          <p style="color:#9a9690;font-size:15px;line-height:1.7;margin:0 0 20px">${template.body}</p>

          ${vacancy_title ? `
          <div style="background:#181816;border:1px solid #2a2a26;border-left:3px solid ${template.color};border-radius:8px;padding:14px 18px;margin-bottom:20px">
            <p style="color:#5a5752;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 4px">Cargo</p>
            <p style="color:#f0ede6;font-size:14px;font-weight:600;margin:0">${vacancy_title}${company ? `<span style="color:#9a9690;font-weight:400"> · ${company}</span>` : ''}</p>
          </div>` : ''}

          <p style="color:#5a5752;font-size:13px;line-height:1.6;margin:0">
            Si tienes preguntas sobre tu aplicación, puedes responder a este correo.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 36px;border-top:1px solid #2a2a26">
          <p style="color:#5a5752;font-size:11.5px;margin:0">
            © ${new Date().getFullYear()} Semillero · Este es un mensaje automático
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: 'Semillero <onboarding@resend.dev>',
      to: candidate_email,
      subject: template.subject,
      html,
    });
    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error('Email send error:', err);
    return NextResponse.json({ sent: false, reason: 'Error al enviar' });
  }
}
