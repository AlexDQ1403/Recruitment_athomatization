# Dashboard del reclutador

## Problemas del dashboard anterior
1. Leía `candidates` directo desde el navegador (depende de RLS, que ya falló en vacantes) y solo contaba fichas heredadas: los candidatos con cuenta que se postulan no aparecían.
2. "Tasa de contratación" usaba `stats.hired`, un estado que ya no existe → siempre 0%.
3. Las insignias usaban clases inexistentes (`badge-seguimiento`, `badge-en_contacto`).
4. No mostraba vacantes, aplicantes ni cuántos candidatos aprobó el reclutador.

## Endpoint `GET /api/dashboard/recruiter` (rol `recruiter`, empresa del token)
```
{ pipeline: { seguimiento, en_contacto, rechazado }, total,
  approved,                                  // presentados a la empresa y no rechazados
  vacancies: { active, paused, closed, applicants_active, top: [{ id, title, applicants }] },
  recent: [{ kind, id, full_name, title, location, status, vacancy_title, created_at }] }
```
- Pipeline = fichas heredadas (`candidates.status`) + candidatos con cuenta (`company_candidates.status`) + postulantes sin fila en `company_candidates` (altas anteriores a la corrección del portal) contados como `seguimiento`.
- Conteos con `count` exacto (Supabase limita a 1000 filas por consulta).
- Actividad reciente = últimos registros entre fichas heredadas y postulaciones, con la vacante.
- Solo datos básicos; nada de email/teléfono/salario.

## Seguridad
Empresa solo del token; 403 sin empresa; 503 si falta una migración; 500 genérico con detalle en el log.

## Frontend
`RecruiterDashboardView` (reclutador). superAdmin conserva la vista anterior. La consulta usa la clave `['candidate-stats']`, que ya invalidan Kanban/tabla/panel, y ahora también el modal de candidatos por vacante.
