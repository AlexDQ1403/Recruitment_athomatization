'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { candidatePortalService, CvDraft, MyProfile, SkillCategory } from '../../services/candidatePortalService';
import { Icon } from '../ui/Icon';

type FieldKey = 'position' | 'professional_title' | 'professional_summary' | 'experience_years' | 'location' | 'phone' | 'linkedin_url';
const FIELDS: { key: FieldKey; label: string; multiline?: boolean; number?: boolean }[] = [
  { key: 'position', label: 'Cargo o especialidad' },
  { key: 'professional_title', label: 'Titular profesional' },
  { key: 'professional_summary', label: 'Acerca de', multiline: true },
  { key: 'experience_years', label: 'Años de experiencia', number: true },
  { key: 'location', label: 'Ciudad' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'linkedin_url', label: 'LinkedIn' },
];
const CATEGORY_LABELS: Record<SkillCategory, string> = { tecnica: 'Técnica', blanda: 'Blanda', idioma: 'Idioma', herramienta: 'Herramienta' };

const fold = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const blank = (v: unknown) => v === null || v === undefined || v === '';

type Exp = CvDraft['experience'][number] & { use: boolean };
type Edu = CvDraft['education'][number] & { use: boolean };
type Skill = CvDraft['skills'][number] & { use: boolean };

/** Revisión del borrador que la IA sacó de la HV */
export const CvReviewModal = ({ draft, profile, onClose, onSaved }: {
  draft: CvDraft;
  profile: MyProfile;
  onClose: () => void;
  onSaved: (summary: string) => void;
}) => {
  const queryClient = useQueryClient();
  const existing = useQuery({
    queryKey: ['cv-review-existing'],
    queryFn: async () => {
      const [experience, education, skills] = await Promise.all([
        candidatePortalService.listExperience(), candidatePortalService.listEducation(), candidatePortalService.listSkills(),
      ]);
      return { experience, education, skills };
    },
    staleTime: 0,
  });

  const [fields, setFields] = useState(() => Object.fromEntries(FIELDS.map(({ key }) => {
    const value = draft[key];
    // Solo se propone cambiar lo que la HV trae y es distinto de lo que ya tiene
    return [key, { value: value ?? '', use: !blank(value) && fold(String(value)) !== fold(String(profile[key] ?? '')) }];
  })) as Record<FieldKey, { value: string | number; use: boolean }>);
  const [experience, setExperience] = useState<Exp[]>(() => draft.experience.map((e) => ({ ...e, use: true })));
  const [education, setEducation] = useState<Edu[]>(() => draft.education.map((e) => ({ ...e, use: true })));
  const [skills, setSkills] = useState<Skill[]>(() => draft.skills.map((s) => ({ ...s, use: true })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cuando llega el perfil actual, se desmarca lo que ya está
  useEffect(() => {
    if (!existing.data) return;
    const { experience: ex, education: ed, skills: sk } = existing.data;
    setExperience((list) => list.map((e) => ({ ...e, use: e.use && !ex.some((x) => fold(x.company_name) === fold(e.company_name) && fold(x.role_title) === fold(e.role_title)) })));
    setEducation((list) => list.map((e) => ({ ...e, use: e.use && !ed.some((x) => fold(x.institution) === fold(e.institution) && fold(x.degree) === fold(e.degree)) })));
    setSkills((list) => list.map((s) => ({ ...s, use: s.use && !sk.some((x) => fold(x.name) === fold(s.name)) })));
  }, [existing.data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const missingDates = experience.filter((e) => e.use && !e.start_date).length;
  const chosen = FIELDS.filter((f) => fields[f.key].use).length + experience.filter((e) => e.use).length
    + education.filter((e) => e.use).length + skills.filter((s) => s.use).length;

  const save = async () => {
    setSaving(true);
    setError(null);
    const failed: string[] = [];
    try {
      const updates: Partial<MyProfile> = {};
      for (const f of FIELDS) {
        if (!fields[f.key].use) continue;
        const raw = fields[f.key].value;
        (updates as Record<string, unknown>)[f.key] = f.number ? (raw === '' ? null : Number(raw)) : String(raw).trim() || null;
      }
      if (Object.keys(updates).length) await candidatePortalService.updateProfile(updates);

      // Uno por uno: si una entrada falla (fecha mal escrita), las demás se guardan
      for (const e of experience.filter((x) => x.use)) {
        await candidatePortalService.addExperience({
          company_name: e.company_name, role_title: e.role_title, start_date: e.start_date!, end_date: e.end_date || null, description: e.description || null,
        }).catch(() => failed.push(`${e.role_title} en ${e.company_name}`));
      }
      for (const e of education.filter((x) => x.use)) {
        await candidatePortalService.addEducation({
          institution: e.institution, degree: e.degree, start_date: e.start_date || null, end_date: e.end_date || null,
        }).catch(() => failed.push(e.degree));
      }
      for (const s of skills.filter((x) => x.use)) {
        await candidatePortalService.addSkill(s.name, s.category).catch(() => failed.push(s.name));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
      setSaving(false);
      return;
    }
    for (const key of ['my-profile', 'my-experience', 'my-education', 'my-skills', 'recommendations']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
    setSaving(false);
    if (failed.length) {
      setError(`Se guardó lo demás, pero no: ${failed.join(', ')}. Revisa esos datos y agrégalos a mano.`);
      return;
    }
    onSaved('Tu perfil se actualizó con tu hoja de vida. Ya puedes ver las vacantes que más se ajustan.');
  };

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal cp cv-review" role="dialog" aria-modal="true" aria-labelledby="cv-review-title" onClick={(e) => e.stopPropagation()}>
        <header className="cp-head">
          <div className="cp-id">
            <h2 id="cv-review-title">Revisa lo que leímos de tu hoja de vida</h2>
            <p className="cp-title">Corrige lo que esté mal y desmarca lo que no quieras guardar. Nada se guarda hasta que confirmes.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar" disabled={saving}>
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="cp-body">
          <section className="cp-section">
            <h3>Datos generales</h3>
            {FIELDS.filter((f) => !blank(draft[f.key])).length === 0 && <p className="cp-item-sub">La HV no trae datos generales.</p>}
            {FIELDS.filter((f) => !blank(draft[f.key])).map((f) => {
              const current = profile[f.key];
              const st = fields[f.key];
              return (
                <div key={f.key} className="cv-row">
                  <label className="cv-use">
                    <input type="checkbox" checked={st.use} onChange={(e) => setFields((x) => ({ ...x, [f.key]: { ...st, use: e.target.checked } }))} />
                    <span>{f.label}</span>
                  </label>
                  {f.multiline ? (
                    <textarea aria-label={f.label} rows={3} maxLength={2000} value={String(st.value)} disabled={!st.use}
                      onChange={(e) => setFields((x) => ({ ...x, [f.key]: { ...st, value: e.target.value } }))} />
                  ) : (
                    <input aria-label={f.label} type={f.number ? 'number' : 'text'} value={String(st.value)} disabled={!st.use}
                      onChange={(e) => setFields((x) => ({ ...x, [f.key]: { ...st, value: e.target.value } }))} />
                  )}
                  {!blank(current) && fold(String(current)) !== fold(String(st.value)) && (
                    <p className="cv-current">Ahora en tu perfil: {String(current).slice(0, 140)}{String(current).length > 140 ? '…' : ''}</p>
                  )}
                </div>
              );
            })}
          </section>

          {experience.length > 0 && (
            <section className="cp-section">
              <h3>Experiencia ({experience.filter((e) => e.use).length} de {experience.length})</h3>
              {experience.map((e, i) => {
                const upd = (patch: Partial<Exp>) => setExperience((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <fieldset key={i} className={`cv-item${e.use ? '' : ' off'}`}>
                    <legend>
                      <label className="cv-use">
                        <input type="checkbox" checked={e.use} onChange={(ev) => upd({ use: ev.target.checked })} />
                        <span>{e.role_title} · {e.company_name}</span>
                      </label>
                    </legend>
                    {e.use && (
                      <div className="cv-grid">
                        <label>Cargo<input value={e.role_title} onChange={(ev) => upd({ role_title: ev.target.value })} /></label>
                        <label>Empresa<input value={e.company_name} onChange={(ev) => upd({ company_name: ev.target.value })} /></label>
                        <label>Desde<input type="date" value={e.start_date ?? ''} onChange={(ev) => upd({ start_date: ev.target.value || null })} aria-invalid={!e.start_date} /></label>
                        <label>Hasta<input type="date" value={e.end_date ?? ''} onChange={(ev) => upd({ end_date: ev.target.value || null })} /><small>Vacío = trabajo actual</small></label>
                        <label className="wide">Qué hiciste<textarea rows={2} maxLength={2000} value={e.description ?? ''} onChange={(ev) => upd({ description: ev.target.value })} /></label>
                        {!e.start_date && <p className="cp-error-inline wide">Falta la fecha de inicio: la HV no la trae.</p>}
                      </div>
                    )}
                  </fieldset>
                );
              })}
            </section>
          )}

          {education.length > 0 && (
            <section className="cp-section">
              <h3>Formación ({education.filter((e) => e.use).length} de {education.length})</h3>
              {education.map((e, i) => {
                const upd = (patch: Partial<Edu>) => setEducation((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <fieldset key={i} className={`cv-item${e.use ? '' : ' off'}`}>
                    <legend>
                      <label className="cv-use">
                        <input type="checkbox" checked={e.use} onChange={(ev) => upd({ use: ev.target.checked })} />
                        <span>{e.degree} · {e.institution}</span>
                      </label>
                    </legend>
                    {e.use && (
                      <div className="cv-grid">
                        <label>Título<input value={e.degree} onChange={(ev) => upd({ degree: ev.target.value })} /></label>
                        <label>Institución<input value={e.institution} onChange={(ev) => upd({ institution: ev.target.value })} /></label>
                        <label>Desde<input type="date" value={e.start_date ?? ''} onChange={(ev) => upd({ start_date: ev.target.value || null })} /></label>
                        <label>Hasta<input type="date" value={e.end_date ?? ''} onChange={(ev) => upd({ end_date: ev.target.value || null })} /></label>
                      </div>
                    )}
                  </fieldset>
                );
              })}
            </section>
          )}

          {skills.length > 0 && (
            <section className="cp-section">
              <h3>Habilidades ({skills.filter((s) => s.use).length} de {skills.length})</h3>
              <p className="cp-item-sub">Toca una habilidad para quitarla o volver a incluirla.</p>
              <div className="cv-skills">
                {skills.map((s, i) => (
                  <button key={s.name} type="button" aria-pressed={s.use} className={`match-chip ${s.use ? 'have' : 'off'}`}
                    title={CATEGORY_LABELS[s.category]}
                    onClick={() => setSkills((l) => l.map((x, j) => (j === i ? { ...x, use: !x.use } : x)))}>
                    {s.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {error && <p className="cp-error-inline" role="alert">{error}</p>}
          <div className="cp-actions">
            <button type="button" className="btn-secondary-sm" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="button" className="btn-save" onClick={save} disabled={saving || chosen === 0 || missingDates > 0}>
              {saving ? 'Guardando…' : `Guardar en mi perfil (${chosen})`}
            </button>
          </div>
          {missingDates > 0 && <p className="cp-item-sub" style={{ textAlign: 'right' }}>Completa la fecha de inicio de {missingDates} experiencia(s) o desmárcala(s).</p>}
        </div>
      </div>
    </div>
  );
};
