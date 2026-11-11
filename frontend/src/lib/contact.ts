/** Mensaje de primer contacto y enlaces para abrirlo en WhatsApp o en el correo */

export interface ContactMessageInput {
  fullName: string;
  /** Cargo o titular del candidato. */
  role?: string | null;
  location?: string | null;
  recruiterName?: string | null;
  companyName?: string | null;
}

/** "LAURA marcela ríos" → "Laura". */
const firstName = (fullName: string): string => {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return first.charAt(0).toLocaleUpperCase('es-CO') + first.slice(1).toLocaleLowerCase('es-CO');
};

/** Los titulares de LinkedIn traen varios segmentos: "Contadora Pública | NIIF | Impuestos" → "Contadora Pública". */
export const shortRole = (role?: string | null): string | null => {
  const head = role?.split(/\s[|·•–-]\s|\s\|\s?/)[0]?.trim();
  return head ? head : null;
};

export function buildContactMessage(input: ContactMessageInput): { subject: string; body: string } {
  const name = firstName(input.fullName);
  const role = shortRole(input.role);
  const who = [input.recruiterName?.trim(), input.companyName?.trim() && `de ${input.companyName.trim()}`]
    .filter(Boolean)
    .join(', ');

  const intro = who ? `Soy ${who}.` : 'Te escribo del equipo de selección.';
  const interest = role
    ? `Vi tu perfil como ${role} y creo que encaja muy bien con una oportunidad que tenemos${input.location ? ` en ${input.location}` : ''}.`
    : `Vi tu perfil y creo que encaja muy bien con una oportunidad que tenemos${input.location ? ` en ${input.location}` : ''}.`;

  const body = [
    `Hola ${name}, ¿cómo estás?`,
    `${intro} ${interest}`,
    '¿Te gustaría que conversáramos unos minutos esta semana para contarte los detalles? Quedo pendiente de tu respuesta.',
    'Muchas gracias.',
  ].join('\n\n');

  const subject = [role ? `Oportunidad laboral: ${role}` : 'Oportunidad laboral', input.companyName?.trim()]
    .filter(Boolean)
    .join(' · ');

  return { subject, body };
}

/** phone en formato internacional ("+573001234567", como lo entrega el backend). */
export const whatsappUrl = (phone: string, text: string): string =>
  `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

export const mailtoUrl = (email: string, subject: string, body: string): string =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/** "+573001234567" → "+57 300 123 4567" (solo para mostrar). */
export const formatPhone = (phone: string): string => {
  const m = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : phone;
};
