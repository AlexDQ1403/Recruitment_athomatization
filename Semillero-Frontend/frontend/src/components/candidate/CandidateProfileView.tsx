'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidatePortalService, MyProfile } from '../../services/candidatePortalService';
import { ToastContainer } from '../ui/Toast';
import { useToast } from '../../hooks/useToast';
import { CandidateExperienceSection } from './CandidateExperienceSection';
import { CandidateEducationSection } from './CandidateEducationSection';
import { CandidateSkillsSection } from './CandidateSkillsSection';
import { CandidateSearchPreferencesSection } from './CandidateSearchPreferencesSection';
import { CvImport } from './CvImport';

export const CandidateProfileView = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Partial<MyProfile> | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => candidatePortalService.getProfile(),
  });

  const saveMutation = useMutation({
    mutationFn: (updates: Partial<MyProfile>) => candidatePortalService.updateProfile(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      setForm(null);
      toast.success('Perfil actualizado');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar'),
  });

  if (isLoading) {
    return (
      <div>
        <div className="page-header"><h1>Mi perfil</h1></div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 48, marginBottom: 10 }} />
        ))}
      </div>
    );
  }

  if (!profile) {
    return <div className="form-error">No se pudo cargar tu perfil.</div>;
  }

  const current = { ...profile, ...form };
  const dirty = form !== null;

  const set = <K extends keyof MyProfile>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const value =
        e.target.type === 'number' ? (raw === '' ? null : Number(raw)) : raw;
      setForm((f) => ({ ...(f ?? {}), [key]: value }));
    };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (form) saveMutation.mutate(form);
  };

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />
      <div className="page-header">
        <h1>Mi perfil</h1>
        <p>Los datos que las empresas verán cuando te encuentren, y con los que te recomendamos vacantes</p>
      </div>

      <CvImport profile={profile} onMessage={(kind, text) => (kind === 'success' ? toast.success(text) : toast.error(text))} />

      <form onSubmit={handleSave} style={{ maxWidth: 620 }}>
        <div className="form-group">
          <label>Nombre</label>
          <input value={current.full_name} disabled />
        </div>

        <div className="form-group">
          <label>Correo</label>
          <input value={current.email} disabled />
        </div>

        <div className="form-group">
          <label htmlFor="position">Cargo o especialidad</label>
          <input
            id="position"
            value={current.position ?? ''}
            onChange={set('position')}
            placeholder="Desarrollador Backend"
            maxLength={120}
          />
        </div>

        <div className="form-group">
          <label htmlFor="professional_title">Titular profesional</label>
          <input
            id="professional_title"
            value={current.professional_title ?? ''}
            onChange={set('professional_title')}
            placeholder="Ej: Desarrollador Full Stack | React · Node.js"
            maxLength={160}
          />
        </div>

        <div className="form-group">
          <label htmlFor="professional_summary">Extracto / Acerca de</label>
          <textarea
            id="professional_summary"
            value={current.professional_summary ?? ''}
            onChange={(e) => setForm((f) => ({ ...(f ?? {}), professional_summary: e.target.value }))}
            placeholder="Un resumen breve de tu perfil profesional"
            maxLength={2000}
            rows={4}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label htmlFor="experience_years">Años de experiencia</label>
            <input
              id="experience_years"
              type="number"
              min={0}
              max={60}
              value={current.experience_years ?? ''}
              onChange={set('experience_years')}
            />
          </div>
          <div className="form-group">
            <label htmlFor="expected_salary">Salario esperado (COP)</label>
            <input
              id="expected_salary"
              type="number"
              min={0}
              value={current.expected_salary ?? ''}
              onChange={set('expected_salary')}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label htmlFor="location">Ubicación</label>
            <input
              id="location"
              value={current.location ?? ''}
              onChange={set('location')}
              placeholder="Medellín"
              maxLength={120}
            />
          </div>
          <div className="form-group">
            <label htmlFor="phone">Teléfono</label>
            <input
              id="phone"
              value={current.phone ?? ''}
              onChange={set('phone')}
              placeholder="+57 300 000 0000"
              maxLength={40}
            />
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="linkedin_url">LinkedIn</label>
          <input
            id="linkedin_url"
            type="url"
            value={current.linkedin_url ?? ''}
            onChange={set('linkedin_url')}
            placeholder="https://linkedin.com/in/tu-perfil"
          />
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={current.visible ?? true}
              onChange={(e) => setForm((f) => ({ ...(f ?? {}), visible: e.target.checked }))}
              style={{ width: 'auto' }}
            />
            Visible para las empresas
          </label>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Si lo desactivas, dejas de aparecer en las búsquedas de las empresas.
          </p>
        </div>

        <button type="submit" className="btn-primary" disabled={!dirty || saveMutation.isPending}>
          {saveMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>

      <div style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 28, marginTop: 28 }}>
        <CandidateExperienceSection />
        <CandidateEducationSection />
        <CandidateSkillsSection />
        <CandidateSearchPreferencesSection />
      </div>
    </>
  );
};
