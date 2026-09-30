'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { candidatePortalService, SkillCategory } from '../../services/candidatePortalService';
import { useToast } from '../../hooks/useToast';

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  tecnica: 'Técnicas', blanda: 'Blandas', idioma: 'Idiomas', herramienta: 'Herramientas',
};
const CATEGORIES = Object.keys(CATEGORY_LABELS) as SkillCategory[];

export const CandidateSkillsSection = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<SkillCategory>('tecnica');

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ['my-skills'],
    queryFn: () => candidatePortalService.listSkills(),
  });

  const addMutation = useMutation({
    mutationFn: () => candidatePortalService.addSkill(name.trim(), category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-skills'] });
      setName('');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al guardar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => candidatePortalService.deleteSkill(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-skills'] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al eliminar'),
  });

  return (
    <section>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>Habilidades</h2>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
        Tecnologías, herramientas, idiomas y habilidades blandas — esto es lo que usa la búsqueda de las empresas.
      </p>

      {isLoading && <div className="skeleton" style={{ height: 40 }} />}

      {!isLoading && CATEGORIES.map((cat) => {
        const items = skills.filter((s) => s.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {CATEGORY_LABELS[cat]}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {items.map((s) => (
                <span key={s.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
                  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999,
                  padding: '4px 6px 4px 12px', color: 'var(--text-1)',
                }}>
                  {s.name}
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(s.id)}
                    disabled={deleteMutation.isPending}
                    aria-label={`Eliminar ${s.name}`}
                    style={{ width: 16, height: 16, borderRadius: '50%', fontSize: 11, color: 'var(--text-3)', lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: React, Inglés B2, Trabajo en equipo..."
          maxLength={80}
          style={{ flex: 1 }}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { e.preventDefault(); addMutation.mutate(); } }}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value as SkillCategory)} style={{ width: 'auto' }}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <button
          type="button"
          className="btn-primary"
          style={{ width: 'auto', marginTop: 0, padding: '8px 16px' }}
          disabled={!name.trim() || addMutation.isPending}
          onClick={() => addMutation.mutate()}
        >
          + Agregar
        </button>
      </div>
    </section>
  );
};
