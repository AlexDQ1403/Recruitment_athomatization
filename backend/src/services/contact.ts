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
