# Candidatos por vacante (botón "Ver candidatos")

## Criterios de aceptación
1. En `/vacancies`, el botón de personas de cada vacante abre una vista (modal) con los postulantes de ESA vacante.
2. Cada fila muestra nombre, título/cargo, ubicación y experiencia (si existen) y el estado actual.
3. Botones por fila: **Seguimiento**, **En contacto**, **Rechazar**. Rechazar pide confirmación y es terminal (como en el resto del sistema).
4. Solo se ven y gestionan postulantes de vacantes de la empresa del usuario. Una vacante de otra empresa responde 404.
5. Funciona para los dos orígenes: candidatos con cuenta (`applications`) y fichas heredadas (`candidates.vacancy_id`).

## Backend (`routes/vacancy-applicants.ts`, montado en `/api/vacancies/:vacancyId/applicants`)
- Mismo middleware que vacantes: `companyAuthMiddleware`, roles `empresa`/`recruiter`, `requireCompany`. La empresa sale del token.
- `GET /` → `{ items: [{ kind, id, full_name, title, location, experience_years, status, applied_at }] }`.
  - `kind: 'profile'` → `id` = `candidate_profiles.id`; estado desde `company_candidates` (si falta la fila: `seguimiento`).
  - `kind: 'legacy'` → `id` = `candidates.id`; estado desde `candidates.status`.
  - No se devuelven email, teléfono, salario ni CV (solo datos básicos).
- `PATCH /:kind/:id/status` con `{ status, reason? }` (`seguimiento | en_contacto | rechazado`).
  - Transiciones: seguimiento↔en_contacto, cualquiera→rechazado, rechazado terminal (409 si se intenta salir). Mismo estado → `unchanged`.
  - `legacy`: actualiza `candidates.status` + `candidate_status_history`.
  - `profile`: actualiza (o crea, sin upsert) la fila `company_candidates`; sincroniza el estado visible al candidato en `applications.status` (seguimiento→en_revision, en_contacto→contactado, rechazado→descartada).
  - `seguimiento` y `rechazado` sacan al candidato de la lista de aceptados (`presented_to_company=false`), igual que la decisión del chat.
- Errores: 400 validación, 403 rol/empresa, 404 no es de tu empresa/vacante, 409 rechazado, 503 base desactualizada, 500 genérico (el detalle solo va al log).

## Seguridad
- Autorización por empresa en cada consulta (`company_id` del token + `vacancy_id`); ids validados como uuid; Zod en el body.
- El navegador nunca consulta Supabase para esto (evita depender de RLS, que ya falló en vacantes).
- React escapa el texto; no se usa `dangerouslySetInnerHTML`.

## Frontend
- `vacancyService.applicants(vacancyId)` y `vacancyService.setApplicantStatus(...)` por `/api/vacancies/...` (proxies Next).
- `ApplicantsModal` en `VacanciesView`: carga con skeleton, vacío, error con reintento, botones deshabilitados mientras guarda.

## Limitación conocida
El estado vive en la relación empresa↔candidato, no por vacante: rechazar a alguien en una vacante lo rechaza para toda la empresa (mismo comportamiento que el resto del sistema).
