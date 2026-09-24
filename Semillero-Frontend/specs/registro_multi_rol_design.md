# Registro multi-rol y modelo candidato↔empresa

**Fecha:** 2026-09-24
**Estado:** diseño aprobado, implementación en curso
**Decisiones tomadas por el usuario:** tabla puente `company_candidates`; alta de empresa self-service con
verificación de email; el candidato gestiona su perfil, sube CV y se postula.

---

## 1. Requisitos

| # | Requisito | Criterio de aceptación |
|---|---|---|
| R1 | Solo empresas y candidatos pueden crear cuenta | No existe endpoint público que cree un `recruiter`; los reclutadores los crea la empresa |
| R2 | El rol se resuelve al iniciar sesión consultando la BD | Tras autenticar, `profiles.role` decide la navegación; el cliente no lo envía nunca |
| R3 | Una empresa se registra sola | Crea `companies` + `profiles(role='empresa')`; queda inactiva hasta confirmar email |
| R4 | Un candidato se registra solo | Crea `profiles(role='candidato')` + `candidate_profiles`; sin `company_id` |
| R5 | Un candidato es único y puede interesar a varias empresas | `company_candidates` relaciona 1 candidato con N empresas, con estado propio por relación |
| R6 | El candidato gestiona su perfil y su CV | Edita sus datos y sube un archivo a Storage |
| R7 | El candidato se postula a vacantes | Crea una fila en `applications`; la empresa lo ve en su pool |

---

## 2. Problema del modelo actual

`candidates.company_id` ata cada candidato a **una** empresa. Con cuentas de candidato eso obliga a
duplicar la persona una vez por empresa interesada, cada copia con su estado y su historial. No existe
una identidad única del candidato.

### Modelo objetivo

```
profiles                       (identidad + rol, 1:1 con auth.users)
  id · email · full_name · role · company_id(nullable) · suspended

candidate_profiles             (datos del candidato-usuario)
  id · profile_id → profiles · position · experience_years
  expected_salary · location · phone · cv_url · linkedin_url · visible

company_candidates             (PUENTE: el estado vive aquí)
  company_id → companies · candidate_profile_id → candidate_profiles
  status ('seguimiento'|'en_contacto'|'rechazado') · source · created_at
  UNIQUE (company_id, candidate_profile_id)

applications                   (postulación explícita del candidato)
  candidate_profile_id · vacancy_id · company_id · status · created_at
```

El estado deja de ser un atributo de la persona y pasa a ser un atributo de **la relación** entre
persona y empresa. Ana puede estar `en_contacto` en la empresa A y `rechazado` en la B sin duplicarse.

### Estrategia de transición (importante)

`candidates` se conserva y sigue funcionando. Motivo: el chat, el Kanban, los reportes y seis políticas
RLS dependen de ella, y ya están probados. Romper todo de golpe es el camino corto al desastre.

1. Se crean las tablas nuevas y se **rellena** `company_candidates` desde `candidates.company_id`.
2. `candidates.company_id` queda marcada como deprecada pero **sigue siendo válida** durante la transición.
3. Los candidatos que llegan por scraping/n8n siguen entrando en `candidates` (no tienen cuenta).
4. Los candidatos **con cuenta** viven en `candidate_profiles` + `company_candidates`.
5. Una migración posterior unificará ambos orígenes cuando el flujo nuevo esté validado en uso.

Es deuda técnica deliberada y anotada, no un descuido: mantiene la aplicación funcionando mientras el
modelo nuevo se estabiliza.

---

## 3. Diseño por perspectivas

### 3.1 Backend

**`POST /api/register/company`** — público, sin autenticación
```
body: { company_name, industry?, full_name, email, password }
1. Valida con Zod (email, password ≥ 8 alfanumérica, nombres 2..120)
2. Rechaza si el nombre de empresa ya existe (409)
3. Crea el usuario en Supabase Auth con email_confirm: FALSE  → envía correo
4. Crea companies
5. Crea profiles { role: 'empresa', company_id }   ← rol FIJADO por el endpoint
6. Rollback del usuario de Auth si cualquier paso falla
201 → { company_id, email, requires_confirmation: true }
```

**`POST /api/register/candidate`** — público, sin autenticación
```
body: { full_name, email, password, position?, location?, experience_years? }
1. Valida con Zod
2. Crea el usuario en Auth con email_confirm: FALSE
3. Crea profiles { role: 'candidato', company_id: NULL }
4. Crea candidate_profiles
201 → { email, requires_confirmation: true }
```

**Portal del candidato** — requiere sesión y `role='candidato'`
```
GET   /api/me/profile        → su candidate_profile
PATCH /api/me/profile        → edita sus datos (nunca role ni company_id)
GET   /api/me/applications   → sus postulaciones con la vacante y el estado
POST  /api/me/applications   → { vacancy_id } se postula (idempotente por UNIQUE)
```

El CV se sube desde el cliente a Supabase Storage (bucket `resumes`, ruta `<profile_id>/cv.<ext>`), y el
`PATCH` guarda la URL. La política del bucket restringe la escritura a la carpeta del propio usuario.

**Middleware.** `companyAuthMiddleware` ya resuelve rol y empresa. Se añade `requireRole(...roles)` para
no repetir la comprobación en cada handler, y se acepta que un `candidato` tenga `companyId` nulo — hoy
varias rutas lo tratan como error.

### 3.2 Frontend

| Ruta | Rol | Contenido |
|---|---|---|
| `/register` | público | Elige: soy empresa / soy candidato |
| `/register/company` | público | Formulario de alta de empresa |
| `/register/candidate` | público | Formulario de alta de candidato |
| `/candidate/profile` | candidato | Sus datos + subida de CV |
| `/candidate/applications` | candidato | Sus postulaciones y vacantes abiertas |

`AppShell` ya refresca el perfil en cada carga; se le añade la redirección por rol: un `candidato` que
entre a `/candidates` o `/recruiters` va a su portal. El `Sidebar` gana su propio bloque de navegación.

`authService.login` no cambia: **ya** resuelve el rol desde `profiles`. Es el mecanismo que pide R2.

### 3.3 Seguridad

| Riesgo | Mitigación |
|---|---|
| Auto-asignación de rol en el registro | El rol lo fija el endpoint según la ruta; el body no puede influir |
| Escalada posterior vía `profiles` | Ya cubierto por la migración 013 (trigger que congela `role`, `company_id`, `suspended`) |
| Registro masivo automatizado | Rate limit por IP en ambos endpoints: 5 altas / 15 min |
| Enumeración de cuentas | Mensaje de error idéntico exista o no el email |
| Candidato leyendo datos de otros | RLS: `candidate_profiles` visible solo al dueño, o a las empresas relacionadas vía `company_candidates` |
| Candidato viendo su estado interno | `company_candidates.status` **no** se expone al candidato; solo el estado de su `application` |
| Subida de archivos maliciosos | Extensión y tamaño validados en cliente y en la política de Storage; ruta forzada a su `profile_id` |
| Fuga de PII en respuestas | Esquemas de salida explícitos; ningún `select('*')` hacia el cliente |

---

## 4. Orden de implementación

| Paso | Entregable | Depende de |
|---|---|---|
| 1 | Migración 014: rol `candidato` + `candidate_profiles` + RLS | 013 aplicada |
| 2 | Migración 015: `company_candidates` + backfill + RLS | 014 |
| 3 | Migración 016: `vacancies.company_id` + `applications` + RLS | 015 |
| 4 | `routes/register.ts` + `middlewares/requireRole.ts` | 014 |
| 5 | `routes/candidate-portal.ts` | 014, 016 |
| 6 | Frontend: `/register/*` | 4 |
| 7 | Frontend: portal del candidato | 5 |
| 8 | Navegación por rol en `AppShell`/`Sidebar` | 6, 7 |
| 9 | Completar FASE 5: edición de reclutador desde la UI | — |

---

## 5. Pruebas de aceptación

| Prueba | Esperado |
|---|---|
| `POST /api/register/company` con rol inyectado en el body | El rol guardado es `empresa`, se ignora el body |
| `POST /api/register/candidate` con `role:'empresa'` en el body | El rol guardado es `candidato` |
| Registro con email ya existente | Mismo mensaje que con email nuevo (sin enumeración) |
| Login de candidato | Aterriza en su portal, no en el panel de empresa |
| Candidato pide `GET /api/recruiters` | 403 |
| Candidato pide `GET /api/candidates` | 403 |
| Candidato se postula dos veces a la misma vacante | Una sola fila (UNIQUE), sin error 500 |
| Candidato consulta su perfil | No aparece `company_candidates.status` |
| Empresa A consulta `candidate_profiles` | Solo los candidatos relacionados con A |
| 6 registros seguidos desde una IP | El sexto recibe 429 |
