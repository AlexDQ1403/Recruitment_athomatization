'use client';
import { useEffect, useRef, useState } from 'react';
import { Candidate, CandidateRejection, Vacancy } from '../../types';
import { candidateProfileService } from '../../services/candidateProfileService';
import { vacancyService } from '../../services/vacancyService';

interface Props {
  candidate: Candidate;
  /** Puesto sugerido: el cargo que entendió el chat o, si no, la consulta del reclutador. */
  suggestedRole: string;
  onClose: () => void;
  onRejected: (rejection: CandidateRejection) => void;
}

/**
 * Rechazo por puesto: el candidato deja de aparecer en búsquedas de ESE puesto
 * (y de la vacante, si se elige) pero sigue disponible para los demás.
 */
export const RejectForRoleModal = ({ candidate, suggestedRole, onClose, onRejected }: Props) => {
  const [role, setRole] = useState(suggestedRole);
  const [vacancyId, setVacancyId] = useState('');
  const [reason, setReason] = useState('');
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    roleRef.current?.select();
    // Las vacantes son opcionales: si no cargan, se rechaza solo por cargo
    vacancyService.list(1, 50, 'active').then((r) => setVacancies(r.items)).catch(() => setVacancies([]));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pickVacancy = (id: string) => {
    setVacancyId(id);
    const v = vacancies.find((x) => x.id === id);
    if (v && !role.trim()) setRole(v.title);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role.trim() && !vacancyId) {
      setError('Indica el puesto o elige una vacante');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const rejection = await candidateProfileService.reject(candidate.kind ?? 'auto', candidate.id, {
        role: role.trim() || undefined,
        vacancy_id: vacancyId || undefined,
        reason: reason.trim() || undefined,
      });
      onRejected(rejection);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el rechazo');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form
        className="modal reject-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="reject-title">Rechazar a {candidate.full_name}</h2>
        <p className="reject-help">
          Solo para este puesto: no volverá a aparecer en búsquedas de ese cargo, pero sí para otros.
          Puedes deshacerlo desde su perfil.
        </p>

        <label className="cp-field">
          <span>Puesto</span>
          <input
            ref={roleRef}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={160}
            placeholder="p. ej. Contador público"
          />
        </label>

        {vacancies.length > 0 && (
          <label className="cp-field">
            <span>Vacante (opcional)</span>
            <select value={vacancyId} onChange={(e) => pickVacancy(e.target.value)}>
              <option value="">Ninguna</option>
              {vacancies.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
            </select>
          </label>
        )}

        <label className="cp-field">
          <span>Motivo (opcional)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="p. ej. No maneja NIIF; aspiración salarial muy por encima"
          />
        </label>

        {error && <p className="cp-error-inline" role="alert">{error}</p>}

        <div className="cp-actions">
          <button type="button" className="btn-secondary-sm" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-save reject-confirm" disabled={saving}>
            {saving ? 'Guardando…' : 'Rechazar para este puesto'}
          </button>
        </div>
      </form>
    </div>
  );
};
