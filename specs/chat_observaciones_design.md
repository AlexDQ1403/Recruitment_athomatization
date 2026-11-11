# Feature: Candidatos con observaciones en el chat del reclutador

Estado: propuesta (sin implementar). Alcance: backend (`chat.ts`), tipos y `ChatView` del frontend, ajuste menor del flujo n8n y del webhook entrante.

## Problema

Hoy un candidato que no cumple todos los criterios (p. ej. no tiene `experience_years`) se descarta. Resultado en la ejecución 22 de n8n: `AI Agent 1` devolvió `candidatos_filtrados: []` con 10 "Desarrollador Java" guardados, el flujo volvió a SerpApi y reescribió los mismos 10. El chat tampoco puede mostrarlos como "posibles" porque el prompt de `chat.ts` los trata como todo o nada.

Los candidatos de scraping llegan casi siempre sin experiencia, salario, correo ni ubicación (SerpApi solo da nombre, cargo y URL de LinkedIn). Eso es normal: debe mostrarse como observación, no como motivo de descarte.

## Requisitos (EARS)

R1. While el reclutador busca candidatos, when un candidato cumple el criterio principal (cargo o skills) pero le faltan datos secundarios (experiencia, salario, ubicación), the system shall devolverlo en `candidates` con observaciones que indiquen qué falta.

R2. While el reclutador pide un criterio concreto (años de experiencia, salario máximo, ciudad), when el candidato tiene el dato y no lo cumple, the system shall devolverlo igualmente con una observación de incumplimiento, ordenado después de los que sí cumplen.

R3. While se calculan las observaciones, the system shall derivarlas en el backend comparando campos reales; el LLM solo extrae los criterios pedidos y decide la relevancia del cargo.

R4. While llega un candidato desde n8n, when faltan campos, the system shall guardarlo igual (sin cambios en la regla actual de inserción) y las observaciones se calcularán al leerlo.

R5. While el chat muestra un resultado, the frontend shall renderizar las observaciones como etiquetas junto a la tarjeta, sin ocultar el candidato.

R6. While n8n compara contra el pool interno, when el candidato coincide en cargo, the flow shall no excluirlo por experiencia o salario faltantes, para no repetir la búsqueda externa.

## Decisión de diseño

Las observaciones **no se guardan en la base de datos**: se derivan al responder. Así no hay migración, no se desfasan cuando un dato se completa después (el webhook rellena columnas vacías en reenvíos) y quedan registradas en `chat_messages.candidates` (jsonb) como historial de lo que se mostró en ese momento.

Alternativa descartada: columna `data_quality` en `candidates`. Se vuelve obsoleta al editar el candidato y obliga a migración y backfill.

## Arquitectura

### [Backend] `backend/src/routes/chat.ts`

**1. Contrato LLM** (el prompt cambia de "filtra" a "clasifica por relevancia y extrae criterios")

```json
{
  "message": "...",
  "criteria": { "experience_min": 2, "salary_max": 5000000, "location": "Bogotá" },
  "results": [ { "id": "...", "reason": "...", "fit": "full" | "partial" } ]
}
```

- `criteria`: solo lo que el usuario pidió explícitamente; campos ausentes = no pedido. "junior" no es un número: se deja fuera y se menciona en `reason`.
- Regla de prompt: el criterio principal (cargo/skills) excluye; experiencia, salario y ubicación **nunca excluyen por estar vacíos**.
- Se valida con Zod en el backend (`criteria` con números acotados, `fit` enum). Si falla la validación → se usa el camino de keyword actual.

**2. Observaciones calculadas en código** (`candidateObservations(candidate, criteria)`), con códigos fijos:

| Código | Condición | Severidad |
|---|---|---|
| `experience_missing` | `experience_years` null y hay `experience_min` | warn |
| `salary_missing` | `expected_salary` null y hay `salary_max` | warn |
| `location_missing` | `location` null y hay `location` pedida | warn |
| `experience_below` | dato presente y `< experience_min` | warn (incluye `found`, `requested`) |
| `salary_above` | dato presente y `> salary_max` | warn |
| `location_mismatch` | dato presente y distinto (comparación sin tildes/mayúsculas) | warn |
| `unverified_profile` | `source = 'scraping'` | info |

Sin criterios pedidos solo puede aparecer `unverified_profile`; no se llena la tarjeta de avisos por datos que nadie pidió. Si el reclutador no pidió experiencia pero el campo está vacío, la tarjeta ya omite esa línea (comportamiento actual).

**3. Orden de resultados:** sin observaciones `warn` primero, luego por número de avisos ascendente, tope 10.

**4. Disparo de n8n:** hoy `noResultsTriggered` se activa cuando `results` viene vacío. Se mantiene. Además, cuando todos los resultados son `partial` y hay menos de 5, se dispara `candidate_shortage` (con el throttle existente) para complementar con búsqueda externa. El mensaje avisa al reclutador.

**5. Respuesta:** `candidates[i]` gana `observations: { code, severity, found?, requested? }[]` y `fit`. `SAFE_CANDIDATE_FIELDS` no cambia: no se expone email ni teléfono.

### [Frontend]

- `frontend/src/types/index.ts`: añadir `CandidateObservation` y `observations?`, `fit?` en `Candidate`.
- `CandidateCards` en `ChatView.tsx`: una fila de etiquetas bajo `match_reason`. El texto sale de un único mapa `OBSERVATION_LABELS[code](obs)` en el frontend (p. ej. `experience_missing` → "Experiencia no encontrada"; `experience_below` → "Tiene 1 año; pediste 3"). Texto renderizado como nodo de React (escapado), nunca con `dangerouslySetInnerHTML`.
- Colores con las variables existentes (`--accent`, avisos con el tono de warning del tema); `fit: 'partial'` añade la etiqueta "Coincidencia parcial". Accesible: las etiquetas son texto, no solo color.
- `chatService.ts`: pasar los campos nuevos sin transformarlos; ignorar códigos desconocidos (compatibilidad con mensajes viejos sin `observations`).

### [n8n] (con el MCP, después del backend)

- `AI Agent 1` (comparación interna): cambiar su prompt para que experiencia y salario sean criterios blandos. Si el cargo coincide, el candidato cuenta como encontrado. Con eso `Switch4` deja de ir a SerpApi cuando ya hay candidatos suficientes, y no se vuelve a gastar crédito.
- `Guardar candidatos nuevos (backend)`: enviar `Ubicacion` si la consulta trae ciudad. Requiere añadir `Ubicacion` opcional al esquema Zod de `n8n-webhook.ts` y a `candidateData.location` (hoy siempre `null`).
- La consulta a SerpApi conserva `location=Colombia` (Fase 2 del plan).

### [Security]

- **Autenticación/autorización:** sin cambios; `/api/chat` ya exige reclutador y empresa; el pool se limita a `company_id`.
- **Observaciones no vienen del LLM:** el LLM solo aporta `criteria` y `fit`; los códigos se generan en código y el frontend ignora los que no conoce. Un candidato con texto malicioso no puede inyectar observaciones ni HTML.
- **Inyección de prompt vía scraping:** `position` de los candidatos viene de LinkedIn (no confiable) y va al prompt. Se trunca a 120 caracteres y se retiran saltos de línea antes de enviarlo; las reglas de seguridad del system prompt se mantienen y `criteria`/`fit` se validan con Zod.
- **Validación de entrada:** `criteria` acotado (`experience_min` 0–80, `salary_max` ≤ 1e9, `location` ≤ 100 caracteres). Entrada del webhook: `Ubicacion` opcional, string ≤ 200.
- **Datos personales:** las observaciones no incluyen email, teléfono ni URLs; solo números y nombres de campo.
- **Registro:** loguear cuántos resultados fueron `partial` y qué códigos aparecieron, nunca el contenido de la conversación completa.
- **Costo:** sin llamadas adicionales al LLM; una sola llamada como hoy.

## Plan de implementación

- [ ] 1. Tipos compartidos (`CandidateObservation`, `fit`) y esquema Zod de la respuesta del LLM en `chat.ts`.
- [ ] 2. `candidateObservations()` como función pura en `backend/src/services/candidateObservations.ts`, con pruebas unitarias (R2, R3).
- [ ] 3. Nuevo prompt de `chat.ts`, ordenación, y disparo de shortage para resultados parciales (R1, R6 parcial).
- [ ] 4. Ampliar `chat.test.ts`: candidato sin experiencia con `experience_min` → aparece con `experience_missing`; candidato con 1 año vs 3 pedidos → `experience_below`; sin criterios → solo `unverified_profile`; respuesta del LLM inválida → fallback por keywords sin romper el contrato.
- [ ] 5. Frontend: tipos, `OBSERVATION_LABELS`, etiquetas en `CandidateCards`, verificación de `typecheck`.
- [ ] 6. n8n: relajar el prompt de `AI Agent 1`; `Ubicacion` en Guardar y en el esquema Zod (R4, R6). Prueba: repetir la consulta de la ejecución 22 y comprobar que `Switch4` no entra a SerpApi.
- [ ] 7. Prueba end-to-end con una sesión de reclutador: pedir "desarrollador Java con 3 años" y ver los 10 candidatos con "Experiencia no encontrada".

## Criterios de aceptación

- Consulta "desarrollador Java con 3 años de experiencia" sobre los 10 candidatos de scraping de la empresa `874512f9…` → el chat los muestra los 10, cada uno con "Experiencia no encontrada" y "Perfil sin verificar".
- Un candidato con `experience_years = 1` frente a 3 pedidos → etiqueta "Tiene 1 año; pediste 3" y aparece después de los que cumplen.
- Una consulta sin criterios numéricos no muestra etiquetas de datos faltantes.
- La repetición de la consulta en n8n no genera una nueva búsqueda en SerpApi cuando el cargo ya está en el pool.
- `npm run typecheck` limpio y `vitest` en verde en backend; `npm run typecheck` limpio en frontend.
- Respuestas y filas guardadas en `chat_messages.candidates` incluyen `observations` y no contienen email ni teléfono.

## Riesgos y decisiones abiertas

| Tema | Riesgo | Decisión propuesta |
|---|---|---|
| El LLM mide mal `criteria` ("junior", "senior") | Observación equivocada de incumplimiento | "junior/senior" no se convierte a número; se explica en `reason`. Solo números explícitos generan `experience_below` |
| Demasiadas etiquetas | Ruido visual en tarjetas | Máximo 3 etiquetas por tarjeta, las `warn` primero |
| Candidatos de baja calidad ocupan el top 10 | Desplazan a los completos | Orden por avisos ascendente (R2); los completos van antes |
| Mensajes antiguos sin `observations` | Error al renderizar | Campo opcional; el frontend ignora lo desconocido |
| Cálculo en lectura | Dos lecturas pueden dar etiquetas distintas si el dato se completó | Es el comportamiento deseado; el historial conserva lo mostrado en ese momento |
