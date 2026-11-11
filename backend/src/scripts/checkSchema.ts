/** Comprueba que la base REAL tiene las columnas que usa el código */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// Columnas que el código escribe o pide, por tabla (flujo de vacantes y postulaciones)
export const EXPECTED_COLUMNS: Record<string, string[]> = {
  vacancies: [
    'id', 'title', 'company', 'company_id', 'description', 'location', 'modality',
    'salary_min', 'salary_max', 'experience_years_min', 'skills', 'status',
    'created_by', 'deadline', 'created_at', 'updated_at',
  ],
  applications: ['id', 'candidate_profile_id', 'vacancy_id', 'company_id', 'cover_letter', 'status', 'created_at', 'candidate_note'],
  // Postulaciones a ofertas de otros sitios (migración 030)
  external_applications: ['id', 'candidate_profile_id', 'source', 'title', 'url', 'status', 'applied_at', 'status_changed_at'],
  // Vista "Ver candidatos" de una vacante (routes/vacancy-applicants.ts)
  candidate_profiles: ['id', 'profile_id', 'professional_title', 'position', 'location', 'experience_years'],
  // Perfil propio y ficha de empresa (routes/account.ts, migración 026)
  profiles: ['id', 'full_name', 'phone', 'job_title'],
  companies: ['id', 'name', 'industry', 'city', 'website', 'description'],
  candidates: [
    'id', 'company_id', 'vacancy_id', 'full_name', 'position', 'location', 'experience_years', 'status', 'created_at', 'updated_at',
    // Perfil externo de LinkedIn (migración 025)
    'headline', 'summary',
  ],
  // Contactos por WhatsApp/correo/LinkedIn desde el chat (migración 025)
  candidate_contact_log: ['id', 'company_id', 'recruiter_id', 'candidate_profile_id', 'legacy_candidate_id', 'channel', 'created_at'],
  // Rechazos por puesto (migración 027)
  candidate_rejections: ['id', 'company_id', 'candidate_profile_id', 'legacy_candidate_id', 'role_label', 'role_key', 'vacancy_id', 'reason', 'rejected_by', 'created_at'],
  candidate_status_history: ['candidate_id', 'from_status', 'to_status', 'changed_by', 'reason'],
  company_candidates: [
    // Motivo de la decisión de la empresa (migración 028)
    'company_decision_reason',
    'id', 'company_id', 'candidate_profile_id', 'legacy_candidate_id', 'status', 'source',
    'presented_to_company', 'presented_at', 'presented_by',
    // Decisión de la empresa (migración 024)
    'company_decision', 'company_decided_at', 'company_decided_by',
  ],
};

async function main(): Promise<void> {
  const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let missing = 0;
  for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
    const absent: string[] = [];
    for (const column of columns) {
      const { error } = await supabase.from(table).select(column).limit(0);
      if (error) absent.push(`${column} (${error.code ?? 'error'})`);
    }
    if (absent.length === 0) {
      console.log(`OK     ${table}: ${columns.length} columnas`);
    } else {
      missing += absent.length;
      console.log(`FALTA  ${table}: ${absent.join(', ')}`);
    }
  }

  if (missing > 0) {
    console.log(`\n${missing} columna(s) faltan en la base. Aplica las migraciones pendientes (p. ej. 022_vacancies_missing_columns.sql).`);
    process.exit(1);
  }
  console.log('\nEsquema correcto.');
}

main().catch((err) => {
  console.error('No se pudo comprobar el esquema:', err instanceof Error ? err.message : err);
  process.exit(2);
});
