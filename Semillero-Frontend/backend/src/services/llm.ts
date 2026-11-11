import { config } from '../config';

// OpenRouter expone la misma API que OpenAI; solo cambian URL, clave y el id
// del modelo (con prefijo de proveedor, p. ej. "openai/gpt-4o-mini").
const useOpenRouter = !!config.OPENROUTER_API_KEY;
const LLM_URL = config.LLM_BASE_URL
  ?? (useOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1');
const LLM_KEY = config.OPENROUTER_API_KEY ?? config.OPENAI_API_KEY;
const LLM_MODEL = config.LLM_MODEL ?? (useOpenRouter ? 'openai/gpt-4o-mini' : 'gpt-4o-mini');
// Sin límite, un proveedor colgado deja la petición abierta hasta que Render la corte.
// Holgado: extraer una HV larga (1400 tokens de salida) puede tardar ~30 s.
const LLM_TIMEOUT_MS = 45_000;

export type LLMMessage = { role: 'system' | 'user' | 'assistant' | string; content: string };

/** Chat completion; lanza si el proveedor responde con error (clave, cuota, modelo). */
export async function callLLM(
  messages: LLMMessage[],
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const res = await fetch(`${LLM_URL}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_KEY}`,
      ...(useOpenRouter && { 'X-Title': 'Semillero' }),
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 1000,
    }),
  });
  const data = await res.json() as { error?: { message: string }; choices?: { message: { content: string } }[] };
  if (!res.ok) throw new Error(data.error?.message ?? 'LLM error');
  return data.choices?.[0]?.message?.content ?? '';
}

/** Quita los ``` que a veces agrega el modelo y parsea el JSON (lanza si no es JSON). */
export const parseLLMJson = (raw: string): unknown =>
  JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
