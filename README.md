# Kmella

Plataforma de reclutamiento que conecta empresas, reclutadores y candidatos. Los reclutadores encuentran perfiles conversando con un asistente de IA, las empresas deciden sobre los candidatos que les presentan y los candidatos llevan su hoja de vida y sus postulaciones en un solo lugar.

**Aplicación:** [kmella-web.onrender.com](https://kmella-web.onrender.com)

## Funcionalidades

**Empresas**
- Publicación y gestión de vacantes
- Administración de su equipo de reclutadores
- Revisión de los candidatos presentados y decisión de contratación con motivo
- Tablero de decisiones pendientes y reporte de resultados

**Reclutadores**
- Búsqueda de candidatos en lenguaje natural, con afinidad por perfil
- Búsqueda automática de perfiles externos en LinkedIn
- Contacto, seguimiento por etapas, notas y rechazos por cargo
- Redacción de vacantes asistida por IA

**Candidatos**
- Carga de hoja de vida con lectura automática y revisión de los datos
- Vacantes recomendadas con su porcentaje de ajuste
- Sugerencias para adaptar la hoja de vida a cada vacante
- Ofertas de otros portales y seguimiento de todas sus postulaciones

## Tecnologías

| Capa | |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript, TanStack Query |
| Backend | Node.js, Express, Zod, Winston |
| Datos | Supabase (PostgreSQL, Auth, Storage) con Row Level Security |
| IA | Modelos de lenguaje vía OpenRouter |
| Automatización | n8n y SerpApi |
| Calidad | Vitest, GitHub Actions |
| Infraestructura | Render |

## Estructura

```
├── backend/                API REST (Express)
│   └── src/
│       ├── routes/         Endpoints por módulo
│       ├── services/       Lógica de negocio e integraciones
│       ├── middlewares/    Autenticación, roles y empresa
│       └── db/migrations/  Esquema de la base de datos
├── frontend/               Aplicación web (Next.js)
│   └── src/
│       ├── app/            Páginas y rutas API
│       ├── components/     Componentes por módulo
│       └── services/       Acceso a datos
├── deploy/n8n/             Imagen de n8n
├── specs/                  Documentos de diseño
└── render.yaml             Infraestructura del despliegue
```

## Desarrollo local

Requiere Node.js 22 y un proyecto de Supabase con las migraciones de `backend/src/db/migrations` aplicadas en orden. Las variables de entorno están descritas en `backend/.env.example` y `frontend/.env.local.example`.

```bash
cd backend && npm install && npm run dev               # http://localhost:3001
cd frontend && npm install && npm run dev -- -p 3002   # http://localhost:3002
```

Ambos proyectos incluyen `npm run test` y `npm run typecheck`.
