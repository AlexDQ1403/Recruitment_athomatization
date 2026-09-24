export interface CompanyRegistration {
  company_name: string;
  industry?: string;
  full_name: string;
  email: string;
  password: string;
}

export interface CandidateRegistration {
  full_name: string;
  email: string;
  password: string;
  position?: string;
  location?: string;
  experience_years?: number;
}

export interface RegistrationResult {
  requires_confirmation: boolean;
  message: string;
  company_id?: string;
}

/**
 * El rol NO se envía: lo fija el endpoint del backend según la ruta.
 * Enviar un rol desde el cliente permitiría auto-asignarse 'empresa'.
 */
async function post<T>(path: string, body: T): Promise<RegistrationResult> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error ?? 'No se pudo completar el registro');
  }
  return data as RegistrationResult;
}

export const registerService = {
  registerCompany: (data: CompanyRegistration) => post('/api/register/company', data),
  registerCandidate: (data: CandidateRegistration) => post('/api/register/candidate', data),
};

/** Misma regla que el backend: mínimo 8, con letras y números. */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[a-zA-Z]/.test(password)) return 'La contraseña debe incluir letras';
  if (!/[0-9]/.test(password)) return 'La contraseña debe incluir números';
  return null;
}
