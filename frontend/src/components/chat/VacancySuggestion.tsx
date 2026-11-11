'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { Candidate, Vacancy } from '../../types';
import { vacancyService, CreateVacancyInput } from '../../services/vacancyService';
import { VacancyForm } from '../vacancies/VacancyForm';

type Match = Pick<Vacancy, 'id' | 'title'>;
type LinkResult = Awaited<ReturnType<typeof vacancyService.linkCandidates>>;

/** Resumen de la asociación, en una frase. */
const linkSummary = (r: LinkResult): string => {
  const parts: string[] = [];
  if (r.linked.length) parts.push(`${r.linked.length} ${r.linked.length === 1 ? 'candidato asociado' : 'candidatos asociados'}`);
  const own = r.skipped.filter((s) => s.reason === 'cuenta_propia').length;
  const other = r.skipped.filter((s) => s.reason === 'otra_vacante').length;
  if (own) parts.push(`${own} con cuenta propia: compárteles el enlace de la vacante para que se postulen`);
  if (other) parts.push(`${other} ya ${other === 1 ? 'estaba' : 'estaban'} en otra vacante`);
  return parts.join(' · ');
};

/** Une la búsqueda del chat con las vacantes */
export const VacancySuggestion = ({ role, query, reason, related = [], onCreated, onDismiss }: {
  /** Cargo de la búsqueda (para buscar vacantes existentes). */
  role: string;
  /** Lo que escribió el reclutador: semilla de la propuesta de vacante. */
  query: string;
  reason: 'sin-resultados' | 'busqueda' | 'accion';
  /** Candidatos de esta respuesta que contactó, dejó en seguimiento o aprobó (no rechazados). */
  related?: Candidate[];
  /** La vacante quedó creada: el chat habilita aprobar y dar seguimiento para este cargo. */
  onCreated?: (vacancy: Match) => void;
  onDismiss: () => void;
}) => {
  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Match | null>(null);
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    vacancyService.match(role)
      .then((v) => !cancelled && setMatch(v))
      .catch(() => !cancelled && setMatch(null));
    return () => { cancelled = true; };
  }, [role]);

  const linkTo = async (vacancyId: string) => {
    if (related.length === 0) return;
    try {
      setLinkResult(await vacancyService.linkCandidates(vacancyId, related.map((c) => ({ kind: c.kind ?? 'legacy', id: c.id }))));
      setLinkError(null);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'No se pudieron asociar los candidatos');
    }
  };

  const create = useMutation({
    mutationFn: (d: CreateVacancyInput) => vacancyService.create(d),
    onSuccess: async (v) => {
      setCreated({ id: v.id, title: v.title });
      setCreating(false);
      onCreated?.({ id: v.id, title: v.title });
      await linkTo(v.id);
    },
  });

  // Mientras consulta no se muestra nada (evita parpadeos entre "existe" y "crear")
  if (match === undefined) return null;
  if (match && related.length === 0 && !linkResult) return null;

  const linkNote = (
    <>
      {linkResult && <p className="vacancy-suggest-note">{linkSummary(linkResult) || 'No había candidatos para asociar.'}</p>}
      {linkError && <p className="cp-error-inline" role="alert">{linkError}</p>}
    </>
  );

  if (created) {
    return (
      <div className="vacancy-suggest done" role="status">
        <div>
          <p>Vacante «{created.title}» creada.</p>
          {linkNote}
        </div>
        <Link href="/vacancies" className="result-link">Ver vacantes</Link>
      </div>
    );
  }

  return (
    <>
      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal" style={{ maxWidth: 600 }} role="dialog" aria-modal="true" aria-label="Nueva vacante"
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Nueva vacante</h3>
              <button onClick={() => setCreating(false)} className="modal-close" aria-label="Cerrar">×</button>
            </div>
            {related.length > 0 && (
              <p className="vacancy-suggest-note" style={{ marginBottom: 12 }}>
                Al crearla se asociarán {related.length === 1 ? 'el candidato' : `los ${related.length} candidatos`} que ya
                trabajaste en esta búsqueda: {related.map((c) => c.full_name).join(', ')}.
              </p>
            )}
            <VacancyForm
              initialText={query}
              onSubmit={(d) => create.mutate(d)}
              loading={create.isPending}
              error={create.error instanceof Error ? create.error.message : null}
            />
          </div>
        </div>
      )}

      {match ? (
        <div className="vacancy-suggest" role="status">
          <div>
            <p>Esta búsqueda corresponde a tu vacante <strong>«{match.title}»</strong>.</p>
            {linkNote}
          </div>
          <div className="vacancy-suggest-actions">
            {related.length > 0 && !linkResult && (
              <button type="button" className="btn-save" onClick={() => linkTo(match.id)}>
                Asociar {related.length === 1 ? '1 candidato' : `${related.length} candidatos`}
              </button>
            )}
            <Link href="/vacancies" className="result-link">Ver vacante</Link>
            <button type="button" className="vacancy-suggest-dismiss" onClick={onDismiss} aria-label="Ocultar">×</button>
          </div>
        </div>
      ) : (
        <div className="vacancy-suggest" role="status">
          <p>
            {reason === 'sin-resultados'
              ? <>No hay candidatos para esto todavía. ¿Quieres crear una vacante para <strong>«{role}»</strong> y recibir postulaciones?</>
              : reason === 'busqueda'
                ? <>Aún no tienes una vacante para <strong>«{role}»</strong>. ¿La creo con IA a partir de esta búsqueda?</>
                : <>¿Quieres crear una vacante para <strong>«{role}»</strong>? Te propongo una con lo que escribiste.</>}
          </p>
          <div className="vacancy-suggest-actions">
            <button type="button" className="btn-save" onClick={() => setCreating(true)}>Crear vacante con IA</button>
            <button type="button" className="btn-secondary-sm" onClick={onDismiss}>Ahora no</button>
          </div>
        </div>
      )}
    </>
  );
};
