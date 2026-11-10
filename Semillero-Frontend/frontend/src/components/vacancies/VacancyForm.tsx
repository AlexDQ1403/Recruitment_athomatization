'use client';
import { useEffect, useRef, useState } from 'react';
import { vacancyService, CreateVacancyInput } from '../../services/vacancyService';
import { Vacancy } from '../../types';

const emptyForm = (initial?: Vacancy): CreateVacancyInput => ({
  title: initial?.title ?? '',
  description: initial?.description ?? '',
  location: initial?.location ?? '',
  modality: initial?.modality ?? 'presencial',
  salary_min: initial?.salary_min,
  salary_max: initial?.salary_max,
  experience_years_min: initial?.experience_years_min ?? 0,
  skills: initial?.skills ?? [],
  deadline: initial?.deadline ?? '',
});

/**
 * Formulario de vacante. Al crear, ofrece "Descríbela con tus palabras": la IA
 * propone los campos y el reclutador los revisa y edita antes de crear. Nada se
 * guarda hasta que pulsa "Crear vacante".
 *
 * `initialText` (p. ej. la búsqueda del chat) genera la propuesta al abrir.
 */
export function VacancyForm({ initial, initialText, onSubmit, loading, error }: {
  initial?: Vacancy;
  initialText?: string;
  onSubmit: (d: CreateVacancyInput) => void;
  loading: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<CreateVacancyInput>(emptyForm(initial));
  const [skillInput, setSkillInput] = useState('');
  const [aiText, setAiText] = useState(initialText ?? '');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotes, setAiNotes] = useState<string[] | null>(null);
  const autoDrafted = useRef(false);

  const set = (k: keyof CreateVacancyInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value || undefined }));

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !form.skills?.includes(s)) {
      setForm((f) => ({ ...f, skills: [...(f.skills ?? []), s] }));
    }
    setSkillInput('');
  };

  const removeSkill = (s: string) => setForm((f) => ({ ...f, skills: f.skills?.filter((x) => x !== s) }));

  const propose = async (text = aiText) => {
    if (text.trim().length < 5) {
      setAiError('Describe la vacante con un poco más de detalle');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const { draft, notes } = await vacancyService.draft(text.trim());
      // Reemplaza los campos con la propuesta; la fecha límite nunca la inventa la IA
      setForm((f) => ({ ...emptyForm(), ...draft, deadline: f.deadline, skills: draft.skills ?? [] }));
      setAiNotes(notes);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'No se pudo generar la propuesta');
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (initial || !initialText || autoDrafted.current) return;
    autoDrafted.current = true;
    propose(initialText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <div className="form-error">{error}</div>}

      {!initial && (
        <section className="vacancy-ai" aria-label="Proponer vacante con IA">
          <label htmlFor="vacancy-ai-text">Descríbela con tus palabras</label>
          <textarea
            id="vacancy-ai-text"
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="p. ej. Necesito una contadora en Bogotá, con 2 años de experiencia en NIIF, híbrido, hasta 3 millones"
          />
          <div className="vacancy-ai-bar">
            <span>La IA llena los campos de abajo; revisas y editas antes de crear.</span>
            <button type="button" className="btn-secondary-sm" onClick={() => propose()} disabled={aiLoading}>
              {aiLoading ? 'Proponiendo…' : aiNotes ? 'Volver a proponer' : 'Proponer vacante'}
            </button>
          </div>
          {aiError && <p className="cp-error-inline" role="alert">{aiError}</p>}
          {aiNotes && (
            <div className="vacancy-ai-notes" role="status">
              <strong>Propuesta lista. Revisa antes de crear{aiNotes.length > 0 ? ':' : '.'}</strong>
              {aiNotes.length > 0 && <ul>{aiNotes.map((n) => <li key={n}>{n}</li>)}</ul>}
            </div>
          )}
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="vacancy-title">Título del cargo *</label>
          <input id="vacancy-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Desarrollador Frontend React" required />
        </div>
        <div className="form-group">
          <label htmlFor="vacancy-modality">Modalidad</label>
          <select id="vacancy-modality" value={form.modality} onChange={(e) => setForm((f) => ({ ...f, modality: e.target.value as CreateVacancyInput['modality'] }))}>
            <option value="presencial">Presencial</option>
            <option value="remoto">Remoto</option>
            <option value="híbrido">Híbrido</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="vacancy-location">Ciudad / Ubicación</label>
          <input id="vacancy-location" value={form.location ?? ''} onChange={set('location')} placeholder="Bogotá, Colombia" />
        </div>
        <div className="form-group">
          <label htmlFor="vacancy-exp">Experiencia mínima (años)</label>
          <input id="vacancy-exp" type="number" min={0} value={form.experience_years_min ?? ''} onChange={(e) => setForm((f) => ({ ...f, experience_years_min: e.target.value ? Number(e.target.value) : 0 }))} placeholder="2" />
        </div>
        <div className="form-group">
          <label htmlFor="vacancy-smin">Salario mínimo (COP)</label>
          <input id="vacancy-smin" type="number" min={0} value={form.salary_min ?? ''} onChange={(e) => setForm((f) => ({ ...f, salary_min: e.target.value ? Number(e.target.value) : undefined }))} placeholder="3000000" />
        </div>
        <div className="form-group">
          <label htmlFor="vacancy-smax">Salario máximo (COP)</label>
          <input id="vacancy-smax" type="number" min={0} value={form.salary_max ?? ''} onChange={(e) => setForm((f) => ({ ...f, salary_max: e.target.value ? Number(e.target.value) : undefined }))} placeholder="6000000" />
        </div>
        <div className="form-group">
          <label htmlFor="vacancy-deadline">Fecha límite</label>
          <input id="vacancy-deadline" type="date" value={form.deadline ?? ''} onChange={set('deadline')} />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="vacancy-description">Descripción del cargo</label>
        <textarea id="vacancy-description" value={form.description ?? ''} onChange={set('description')} placeholder="Describe las responsabilidades, requisitos y beneficios del cargo..." rows={aiNotes ? 8 : 4} style={{ resize: 'vertical' }} />
      </div>

      <div className="form-group">
        <label htmlFor="vacancy-skill">Habilidades / Herramientas</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="vacancy-skill" value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
            placeholder="NIIF, Excel, React..." style={{ flex: 1 }} />
          <button type="button" onClick={addSkill}
            style={{ padding: '9px 14px', borderRadius: 'var(--radius)', background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13, whiteSpace: 'nowrap' }}>
            + Agregar
          </button>
        </div>
        {form.skills && form.skills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
            {form.skills.map((s) => (
              <span key={s} style={{
                fontSize: 11.5, padding: '3px 10px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--surface-3)', border: '1px solid var(--border-2)', color: 'var(--text-2)',
                fontFamily: 'var(--font-mono)',
              }}>
                {s}
                <button type="button" onClick={() => removeSkill(s)} aria-label={`Quitar ${s}`} style={{ color: 'var(--text-3)', lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      <button type="submit" className="btn-primary" disabled={loading || aiLoading} style={{ padding: '11px' }}>
        {loading ? 'Guardando...' : initial ? 'Guardar cambios' : 'Crear vacante'}
      </button>
    </form>
  );
}
