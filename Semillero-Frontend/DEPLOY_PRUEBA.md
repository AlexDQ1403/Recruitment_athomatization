# Despliegue de prueba (gratis) en Render

Backend, frontend y n8n quedan en internet con una URL pública para compartir.
No hay que crear túneles ni que quien prueba configure nada: solo abre el enlace.

| Servicio | URL |
|---|---|
| App (frontend) | https://kmella-web.onrender.com |
| Backend | https://kmella-api.onrender.com/health |
| n8n | https://kmella-n8n.onrender.com |

Si Render asigna otra URL porque el nombre ya estaba ocupado, ver «Si cambian las URL» al final.

## Qué hay que saber del plan gratuito

- Cada servicio **se duerme tras ~15 minutos sin uso** y tarda **~1 minuto en despertar**.
  La primera carga del día es lenta; después va normal.
- La base de datos de n8n (Postgres gratis de Render) **vence a los 30 días**. Los datos de
  la app no se pierden: están en Supabase.
- Las cuentas, candidatos y vacantes son los **mismos de Supabase** que se usan en local.

## Pasos (una sola vez)

1. Crea una cuenta en https://render.com con GitHub (gratis, no pide tarjeta).
2. En Render: **New → Blueprint** → elige el repositorio `Recruitment_athomatization`
   y la rama `Desarrollo`. En «Blueprint path» escribe `Semillero-Frontend/render.yaml`.
3. Render pide las claves marcadas como secretas. Cópialas de tus archivos locales:

   | Variable en Render | De dónde sale |
   |---|---|
   | `SUPABASE_URL` | `backend/.env` |
   | `SUPABASE_ANON_KEY` | `backend/.env` |
   | `SUPABASE_SERVICE_ROLE_KEY` (en kmella-api y kmella-web) | `backend/.env` |
   | `OPENROUTER_API_KEY` | `backend/.env` |
   | `SERPAPI_API_KEY` | `backend/.env` |
   | `N8N_WEBHOOK_SECRET` | `backend/.env` |
   | `NEXT_PUBLIC_SUPABASE_URL` | `frontend/.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `frontend/.env.local` |

4. **Apply**. El primer despliegue tarda ~10 minutos.
5. Abre https://kmella-n8n.onrender.com y crea la cuenta de dueño de n8n.
   En **Settings → n8n API** crea una API key. Con ella se importa el flujo de reclutamiento
   (las credenciales de OpenRouter, OpenAI y el secreto del backend se crean por la API;
   Google Sheets queda fuera del despliegue de prueba).
6. En Supabase → **Authentication → URL Configuration**, agrega
   `https://kmella-web.onrender.com` en «Redirect URLs» para que funcione «Olvidé mi contraseña».

## Si cambian las URL

Si un servicio quedó con otra URL, actualiza en Render (Environment) y vuelve a desplegar:

- `kmella-api`: `CORS_ORIGIN` (URL de la app) y `N8N_WEBHOOK_URL` (URL de n8n + `/webhook/procesoReclutamiento`).
- `kmella-web`: `NEXT_PUBLIC_API_URL` (URL del backend + `/api`) y `NEXT_PUBLIC_WS_URL`.
- En n8n, los nodos que llaman al backend deben apuntar a la URL real del backend.
