import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Columnas de `public.vacancies` según las migraciones del repo: las de CREATE TABLE
 * (005) más todo `ADD COLUMN IF NOT EXISTS` sobre la tabla (016, 022...).
 * Sirve para que el código no escriba ni pida columnas que ninguna migración define:
 * ese desfase hizo fallar la publicación de vacantes (PGRST204).
 */
export function vacanciesColumnsFromMigrations(): Set<string> {
  const dir = join(__dirname, '..', 'db', 'migrations');
  const columns = new Set<string>();

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf-8').replace(/--.*$/gm, '');

    const create = sql.match(/CREATE TABLE IF NOT EXISTS public\.vacancies \(([\s\S]*?)\n\);/);
    if (create) {
      for (const line of create[1].split('\n')) {
        const m = line.trim().match(/^([a-z_]+)\s+[A-Za-z]/);
        if (m && !['PRIMARY', 'CONSTRAINT', 'CHECK', 'UNIQUE'].includes(m[1].toUpperCase())) columns.add(m[1]);
      }
    }

    for (const alter of sql.matchAll(/ALTER TABLE public\.vacancies([\s\S]*?);/g)) {
      for (const m of alter[1].matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)/g)) columns.add(m[1]);
    }
  }
  return columns;
}
