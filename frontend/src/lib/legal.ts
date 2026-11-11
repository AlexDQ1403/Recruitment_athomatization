/**
 * Datos del responsable del tratamiento (Ley 1581 de 2012, Decreto 1377 de 2013).
 * Un solo lugar para que la política, los términos y los avisos digan lo mismo.
 *
 * La ley exige identificar al responsable (nombre, documento, domicilio, dirección y
 * teléfono). Pendiente: cédulas y una dirección de notificaciones.
 */
export const LEGAL = {
  brand: 'Kmella',
  // Cédulas pendientes: se muestran cuando tengan valor (p. ej. id: 'C.C. 123...')
  responsables: [
    { name: 'Karol Stefani Guerrero Ortiz', id: '' },
    { name: 'Alex Camilo Duran Quiroga', id: '' },
  ] as { name: string; id: string }[],
  domicile: 'Bogotá D.C., Colombia',
  phones: ['+57 320 911 5933', '+57 313 803 7635'],
  email: 'alex.goood3585@gmail.com',
  site: 'https://kmella-web.onrender.com',
  /** Cambiar la versión obliga a volver a pedir la aceptación (ConsentGate) */
  version: '2026-11-11',
  effectiveDate: '11 de noviembre de 2026',
} as const;

/** Documentos que la persona acepta; deben coincidir con el backend (routes/consent.ts) */
export const CONSENT_DOCUMENTS = ['privacy', 'terms'] as const;
export type ConsentDocument = (typeof CONSENT_DOCUMENTS)[number];

export const responsablesText = () =>
  LEGAL.responsables.map((r) => (r.id ? `${r.name} (${r.id})` : r.name)).join(' y ');
