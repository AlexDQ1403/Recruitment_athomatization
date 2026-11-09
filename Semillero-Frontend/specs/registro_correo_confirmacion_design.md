# Registro: envío del correo de confirmación

## Problema
`supabaseAdmin.auth.admin.createUser({ email_confirm: false })` NO envía correo.
El usuario veía "Revisa tu correo" y nunca llegaba nada; sin confirmar no puede entrar.

## Criterios de aceptación
- Tras registrar empresa o candidato se envía el correo de confirmación.
- El enlace del correo lleva a `${CORS_ORIGIN}/login`.
- Si el correo no se puede enviar, se hace rollback (no quedan cuentas huérfanas sin aviso) y se responde error.

## Diseño
- [Backend] `sendConfirmationEmail(email)` en `routes/register.ts`: `auth.resend({ type: 'signup', email, options: { emailRedirectTo } })`
  con un cliente de clave anon (no service role: mínimo privilegio). Se llama tras crear usuario y perfil, dentro del try existente.
- [Frontend] Sin cambios: ya muestra `requires_confirmation`.
- [Supabase] Añadir `http://localhost:3002/login` (y el dominio de producción) a Auth > URL Configuration > Redirect URLs.

## Seguridad
- Endpoint público con rate limit 5/15min por IP (existente) → acota también el envío de correos.
- Respuesta genérica sin enumeración de cuentas (se mantiene).
- El destino de redirección sale de config del servidor, nunca del body.
- Se registra el fallo de envío (sin datos sensibles) con correlationId.
