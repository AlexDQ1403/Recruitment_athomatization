# Semillero — Manual de Funcionalidades

Plataforma de reclutamiento que automatiza el proceso de contratación: desde publicar una vacante hasta contratar al candidato, con búsqueda por inteligencia artificial y notificaciones automáticas por email.

---

## Roles de usuario

| Rol | Descripción |
|---|---|
| **superAdmin** | Acceso total: gestiona usuarios, vacantes, candidatos y puede eliminar cualquier registro |
| **recruiter** | Gestiona vacantes y candidatos, usa el chat IA, agrega notas |

---

## 1. Autenticación

**Rutas:** `/login` · `/forgot-password` · `/reset-password`

- Inicio de sesión con email y contraseña
- Recuperación de contraseña por email (Supabase envía el link automáticamente)
- Restablecimiento de contraseña desde el link recibido
- Cierre de sesión desde la barra lateral
- Sesión persistente — si cierras el navegador y vuelves, sigues autenticado
- Logout automático cuando la sesión expira

---

## 2. Dashboard

**Ruta:** `/dashboard`

Vista general del estado del proceso de reclutamiento en tiempo real.

**Métricas:**
- Total de candidatos registrados
- Candidatos por etapa: Pendientes, Entrevistados, Contratados, Rechazados
- Porcentaje de cada etapa sobre el total
- Tasa de contratación (contratados / total)

**Gráficos:**
- Torta: distribución de candidatos por etapa
- Barras: comparación entre etapas

**Actividad reciente:**
- Tabla con los últimos 8 candidatos registrados
- Datos: nombre, cargo, ubicación, estado, fecha de registro

> Los datos se actualizan automáticamente cada 30 segundos.

---

## 3. Vacantes

**Ruta:** `/vacancies`

Gestión de las posiciones abiertas que el semillero maneja para sus clientes.

**Crear una vacante:**
- Título del cargo
- Empresa / cliente
- Modalidad: Presencial, Remoto o Híbrido
- Ciudad / ubicación
- Rango salarial (mínimo y máximo en COP)
- Años de experiencia mínima requerida
- Skills o tecnologías (se agregan como etiquetas)
- Fecha límite de aplicación
- Descripción detallada del cargo

**Acciones por vacante:**
- **Copiar link** — genera la URL pública `/apply/[id]` lista para compartir con candidatos
- **Ver candidatos** — filtra la vista de candidatos mostrando solo los de esa vacante
- **Pausar / Activar** — controla si la vacante aparece en el portal público
- **Editar** — modifica cualquier campo de la vacante
- **Eliminar** — borra la vacante (los candidatos asociados no se eliminan)

**Estados de una vacante:**
- `Activa` — visible en el portal público, acepta aplicaciones
- `Pausada` — oculta en el portal, no acepta aplicaciones nuevas
- `Cerrada` — proceso terminado

**Conteo de aplicantes:** cada card muestra cuántos candidatos han aplicado a esa vacante.

---

## 4. Portal público de aplicación

**Rutas:** `/apply` · `/apply/[id]`

Páginas accesibles sin login — cualquier persona puede verlas y aplicar.

### `/apply` — Lista de vacantes

Muestra todas las vacantes activas con:
- Título y empresa
- Modalidad y ubicación
- Rango salarial
- Skills requeridos
- Fecha límite
- Botón "Aplicar →" que lleva al formulario específico

### `/apply/[id]` — Formulario de aplicación

El candidato ve la información completa de la vacante (descripción, skills, salario) y llena:

**Datos personales:**
- Nombre completo (obligatorio)
- Email
- Teléfono / WhatsApp
- Ciudad

**Perfil profesional:**
- Años de experiencia
- Aspiración salarial
- LinkedIn u otra red profesional

**Documentos:**
- CV en PDF o Word (máx 10MB) — se sube a Supabase Storage
- Carta de presentación (opcional, máx 1500 caracteres)

Al enviar, el candidato queda registrado en la plataforma vinculado a esa vacante con estado `Pendiente`. Si ya existe una aplicación del mismo email al mismo cargo, el sistema avisa en lugar de crear un duplicado.

---

## 5. Candidatos

**Ruta:** `/candidates`

Gestión del pipeline completo de candidatos.

### Vista tabla

Tabla paginada (15 por página) con todos los candidatos.

**Filtros disponibles:**
- Búsqueda de texto: nombre, cargo o ubicación
- Estado: Pendiente, Entrevistado, Contratado, Rechazado
- Fuente: Interno, Web scraping, Aplicante
- Experiencia mínima y máxima (años)
- Salario mínimo y máximo (COP)

**Acciones por candidato:**
- **Cambiar estado** — dropdown inline en la tabla
- **Ver perfil** — abre el panel de detalle
- **Eliminar** — con modal de confirmación

**Exportar CSV:** descarga los candidatos de la página actual con todos sus datos.

### Vista Kanban

Tablero con columnas por etapa del proceso:
- Pendiente → Entrevistado → Contratado / Rechazado

**Drag & drop:** arrastra una tarjeta entre columnas para cambiar el estado. El cambio se guarda automáticamente y queda registrado en el historial del candidato.

Cada tarjeta muestra: nombre, cargo, ubicación, experiencia, salario esperado y fuente.

### Panel de detalle del candidato

Se abre al hacer click en cualquier candidato. Tiene 3 tabs:

#### Tab: Info
- Todos los datos del candidato: email, teléfono, experiencia, salario, ubicación, fuente, fecha de registro
- Link a LinkedIn si existe
- **Editar información** — modifica nombre, cargo, email, teléfono, experiencia, salario y ubicación
- **Ver CV** — abre el archivo subido
- **Subir / Reemplazar CV** — sube un nuevo archivo PDF o Word (máx 10MB)

#### Tab: Notas
- Historial de notas internas del equipo de reclutamiento sobre ese candidato
- Crear nota nueva (máx 2000 caracteres)
- Cada nota muestra quién la escribió y cuándo
- Eliminar nota propia (superAdmin puede eliminar cualquiera)

#### Tab: Historial
- Timeline de todos los cambios de etapa del candidato
- Muestra: etapa anterior → etapa nueva, quién hizo el cambio y cuándo

### Crear candidato manualmente

Botón "+ Nuevo candidato" en la esquina superior derecha. El reclutador llena el formulario con los datos del candidato. Los candidatos creados manualmente tienen fuente `Interno`.

### Notificaciones automáticas por email

Cuando el estado de un candidato cambia a **Entrevistado**, **Contratado** o **Rechazado**, el sistema envía automáticamente un email a su dirección con:
- Mensaje personalizado según el estado
- Nombre del candidato
- Cargo y empresa de la vacante (si aplica)
- Diseño con la identidad visual de Semillero

> Requiere configurar `RESEND_API_KEY` en el entorno. Sin esa clave el sistema funciona igual pero sin emails.

---

## 6. Búsqueda por chat IA

**Ruta:** `/chat`

Búsqueda de candidatos en lenguaje natural usando GPT-4o-mini.

**Cómo funciona:**
1. El reclutador escribe una descripción: *"Necesito un desarrollador React con 3 años de experiencia en Bogotá, salario hasta 5 millones"*
2. El sistema envía la consulta a GPT junto con la base de candidatos (sin datos sensibles)
3. GPT identifica los candidatos que mejor coinciden
4. Se muestran tarjetas con nombre, cargo, experiencia, salario y **razón de match** — una frase explicando por qué ese candidato califica

**Ejemplos de búsquedas:**
- *"Ingenieros de sistemas en Medellín con experiencia en cloud"*
- *"Candidatos baratos para posición junior de frontend"*
- *"Perfiles con más de 5 años y disponibilidad remota"*
- *"Quién tiene experiencia en Python y está en Bogotá"*

**Historial de conversación:** el chat recuerda los últimos 6 mensajes de la sesión para mantener contexto.

**Fallback:** si OpenAI no responde, el sistema hace una búsqueda por palabras clave automáticamente.

**Seguridad:** el sistema nunca expone emails ni teléfonos de candidatos en las respuestas del chat.

---

## 7. Historial de búsquedas

**Ruta:** `/history`

Lista de todas las búsquedas realizadas por el usuario en el chat IA.

- Muestra la consulta, cantidad de candidatos encontrados y fecha/hora
- Botón **Repetir →** abre el chat con la búsqueda pre-cargada para ejecutarla de nuevo

---

## 8. Gestión de usuarios

**Ruta:** `/users` (solo superAdmin)

Administración de las cuentas con acceso al dashboard.

**Ver usuarios:** lista de todos los usuarios con nombre, email y rol.

**Crear usuario:**
- Nombre completo
- Email
- Contraseña (mínimo 8 caracteres alfanuméricos)
- Rol: Reclutador o Super Admin

**Eliminar usuario:** con modal de confirmación. No puedes eliminarte a ti mismo.

> Solo los superAdmin ven esta sección en el menú.

---

## Fuentes de candidatos

| Fuente | Origen | Badge |
|---|---|---|
| **Interno** | Creado manualmente por un reclutador | Verde |
| **Web scraping** | Importado por n8n desde LinkedIn | Amarillo |
| **Aplicante** | Aplicó por el portal público `/apply` | Morado |

---

## Resumen del flujo completo

```
Reclutador crea vacante
        ↓
Comparte el link /apply/[id]
        ↓
Candidato aplica (aparece como "Pendiente")
        ↓
Reclutador usa chat IA para encontrar candidatos adicionales
        ↓
Mueve candidatos por el pipeline (Kanban o tabla)
        ↓
Al cambiar estado → email automático al candidato
        ↓
Candidato contratado → proceso cerrado
```
