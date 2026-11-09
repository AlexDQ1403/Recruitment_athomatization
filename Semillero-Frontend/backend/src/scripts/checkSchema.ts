/**
 * Comprueba que la base REAL tiene las columnas que usa el código.
 *
 *   npm run check:schema
 *
 * Existe porque las migraciones del repo y la base pueden desfasarse: la tabla
 * `vacancies` se creó con una versión vieja de la migración 005 y le faltaban
 * salary_min, salary_max, experience_years_min y skills. Publicar vacantes fallaba
 * con PGRST204 y ninguna prueba unitaria lo podía ver, porque las pruebas leen las
 * migraciones del repo, no la base.
 *
 * Solo lee metadatos (select ... limit 0): no toca ni devuelve datos. Sale con
 * código 1 si falta algo, para poder usarlo en una lista de verificación de despliegue.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// Columnas que el código escribe o pide, por tabla (flujo de vacantes y postulaciones)
export const EXPECTED_COLUMNS: Record<string, string[]> = {
  vacancies: [
    'id', 'title', 'company', 'company_id', 'description', 'location', 'modality',
    'salary_min', 'salary_max', 'experience_years_min', 'skills', 'status',
    'created_by', 'deadline', 'created_at', 'updated_at',
  ],
  applications: ['id', 'candidate_profile_id', 'vacancy_id', 'company_id', 'cover_letter', 'status', 'created_at'],
  // Vista "Ver candidatos" de una vacante (routes/vacancy-applicants.ts)
  candidate_profiles: ['id', 'profile_id', 'professional_title', 'position', 'location', 'experience_years'],
  profiles: ['id', 'full_name'],
  candidates: ['id', 'company_id', 'vacancy_id', 'full_name', 'position', 'location', 'experience_years', 'status', 'created_at', 'updated_at'],
  candidate_status_history: ['candidate_id', 'from_status', 'to_status', 'changed_by', 'reason'],
  company_candidates: [
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
