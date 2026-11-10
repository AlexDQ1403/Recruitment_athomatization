/**
 * Normaliza un teléfono a formato internacional (+<código país><número>) para
 * poder abrir WhatsApp con él. El scraping trae formatos libres:
 * "300 123 4567", "(+57) 300-123-4567", "0057 3001234567".
 *
 * Sin indicativo se asume Colombia: los números nacionales tienen 10 dígitos y
 * empiezan por 3 (celular) o 60x (fijo, desde 2021). Devuelve null si no
 * parece un número utilizable.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!trimmed.startsWith('+') && digits.length === 10 && /^(3|60)/.test(digits)) digits = `57${digits}`;

  // E.164: máximo 15 dígitos; menos de 10 no alcanza para un móvil con indicativo
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}
