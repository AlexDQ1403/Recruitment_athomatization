'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { candidatePortalService, VacancyMatch } from '../../services/candidatePortalService';
import { Icon } from '../ui/Icon';
import { MatchBadge, MatchBreakdown, SkillsFit } from './MatchBadge';

interface Props {
  vacancy: { id: string; title: string; company: { name: string } };
  match: VacancyMatch;
  /** Ya se postuló: solo se muestran los consejos. */
  applied?: boolean;
  /** Oferta de otro sitio: la postulación se hace allá y aquí solo se registra. */
  external?: { jobId: string; url: string; sourceLabel: string };
  onClose: () => void;
  onApplied?: () => void;
}

export const ApplyModal = ({ vacancy, match, applied = false, external, onClose, onApplied }: Props) => {
  const queryClient = useQueryClient();
  const [coverLetter, setCoverLetter] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  // Abrió la oferta en el otro sitio: falta que confirme si se postuló
  const [openedExternal, setOpenedExternal] = useState(false);

  const advice = useQuery({
    queryKey: ['cv-advice', external?.jobId ?? vacancy.id],
    queryFn: () => (external ? candidatePortalService.externalCvAdvice(external.jobId) : candidatePortalService.cvAdvice(vacancy.id)),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const apply = useMutation({
    mutationFn: () => candidatePortalService.apply(vacancy.id, coverLetter.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-applications'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-dashboard'] });
      onApplied?.();
    },
  });

  const registerExternal = useMutation({
    mutationFn: () => candidatePortalService.addExternalApplication({ job_id: external!.jobId }),
    onSuccess: () => {
      for (const key of ['external-applications', 'external-jobs', 'candidate-dashboard']) queryClient.invalidateQueries({ queryKey: [key] });
      onApplied?.();
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* sin permiso de portapapeles: el texto sigue visible para copiarlo a mano */ }
  };

  const a = advice.data?.advice;
  const m = advice.data?.match ?? match;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal cp apply-modal" role="dialog" aria-modal="true" aria-labelledby="apply-title" onClick={(e) => e.stopPropagation()}>
        <header className="cp-head">
          <div className="cp-id">
            <h2 id="apply-title">{vacancy.title}</h2>
            <p className="cp-title">{vacancy.company.name}</p>
            <MatchBadge score={m.score} />
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="cp-body">
          <section className="cp-section">
            <h3>Por qué tienes este porcentaje</h3>
            <MatchBreakdown match={m} />
            <SkillsFit match={m} max={12} />
          </section>

          <section className="cp-section" aria-live="polite">
            <h3>Ajusta tu hoja de vida para esta vacante</h3>
            <p className="cp-item-sub">Cada empresa busca cosas distintas. Estos cambios hacen que tu HV hable el idioma de esta vacante, sin inventar nada.</p>

            {advice.isLoading && (
              <div aria-busy="true">
                <p className="cp-item-sub">Leyendo la vacante y tu perfil…</p>
                {[90, 70, 80].map((w) => <div key={w} className="skeleton" style={{ height: 12, width: `${w}%`, margin: '10px 0' }} />)}
              </div>
            )}
            {advice.isError && (
              <p className="cp-error-inline" role="alert">
                {advice.error instanceof Error ? advice.error.message : 'No pudimos generar los consejos.'}{' '}
                <button type="button" className="result-link" onClick={() => advice.refetch()}>Reintentar</button>
              </p>
            )}

            {a && (
              <div className="advice">
                {a.headline && (
                  <div className="advice-block">
                    <div className="advice-head">
                      <h4>Titular sugerido</h4>
                      <button type="button" className="btn-secondary-sm" onClick={() => copy('headline', a.headline!)}>{copied === 'headline' ? 'Copiado' : 'Copiar'}</button>
                    </div>
                    <p className="advice-quote">{a.headline}</p>
                  </div>
                )}
                {a.summary && (
                  <div className="advice-block">
                    <div className="advice-head">
                      <h4>Perfil profesional para esta vacante</h4>
                      <button type="button" className="btn-secondary-sm" onClick={() => copy('summary', a.summary!)}>{copied === 'summary' ? 'Copiado' : 'Copiar'}</button>
                    </div>
                    <p className="advice-quote">{a.summary}</p>
                  </div>
                )}
                {a.highlight.length > 0 && (
                  <div className="advice-block">
                    <h4>Pon esto primero</h4>
                    <ul>{a.highlight.map((h) => <li key={h}>{h}</li>)}</ul>
                  </div>
                )}
                {a.keywords.length > 0 && (
                  <div className="advice-block">
                    <h4>Escribe estas palabras tal cual</h4>
                    <p className="cp-item-sub">Las usa la empresa y tú las respaldas con tu experiencia.</p>
                    <p className="match-skills">{a.keywords.map((k) => <span key={k} className="match-chip have">{k}</span>)}</p>
                  </div>
                )}
                {a.gaps.length > 0 && (
                  <div className="advice-block">
                    <h4>Lo que piden y no se ve en tu perfil</h4>
                    <ul>{a.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
                  </div>
                )}
                {a.tips.length > 0 && (
                  <div className="advice-block">
                    <h4>Otros ajustes</h4>
                    <ul>{a.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                  </div>
                )}
                {advice.data && advice.data.profile_strength.missing.length > 0 && (
                  <p className="cp-note">
                    Tu perfil aún no tiene: {advice.data.profile_strength.missing.join(', ').toLowerCase()}. Con eso, el porcentaje y los consejos son más precisos.{' '}
                    <Link href="/candidate/profile" className="result-link">Completar mi perfil</Link>
                  </p>
                )}
              </div>
            )}
          </section>

          {applied ? (
            <p className="cp-note">Ya te postulaste a esta vacante. Puedes usar estos consejos si la empresa te pide la HV actualizada.</p>
          ) : external ? (
            <section className="cp-section">
              <h3>Postularme en {external.sourceLabel}</h3>
              {!openedExternal ? (
                <>
                  <p className="cp-item-sub">
                    Esta oferta está publicada en otro sitio. Ajusta tu HV con los consejos de arriba y postúlate allá: te abrimos la página de la oferta en una pestaña nueva.
                  </p>
                  <div className="cp-actions">
                    <button type="button" className="btn-secondary-sm" onClick={onClose}>Cancelar</button>
                    <a href={external.url} target="_blank" rel="noopener noreferrer" className="btn-save ext-go" onClick={() => setOpenedExternal(true)}>
                      Ir a postularme en {external.sourceLabel} ↗
                    </a>
                  </div>
                </>
              ) : (
                <div className="ext-confirm" role="group" aria-label="Confirmar postulación externa">
                  <p><strong>¿Te postulaste en {external.sourceLabel}?</strong> Si la registras, la verás en «Mis postulaciones» y en tu tablero, y podrás actualizar su estado.</p>
                  {registerExternal.isError && (
                    <p className="cp-error-inline" role="alert">{registerExternal.error instanceof Error ? registerExternal.error.message : 'No se pudo registrar'}</p>
                  )}
                  <div className="cp-actions">
                    <a href={external.url} target="_blank" rel="noopener noreferrer" className="result-link">Abrir la oferta otra vez</a>
                    <button type="button" className="btn-secondary-sm" onClick={onClose}>Todavía no</button>
                    <button type="button" className="btn-save" onClick={() => registerExternal.mutate()} disabled={registerExternal.isPending}>
                      {registerExternal.isPending ? 'Registrando…' : 'Sí, registrarla'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className="cp-section">
              <h3>Postularme</h3>
              <label className="cp-field">
                <span>Mensaje para la empresa (opcional)</span>
                <textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Por qué te interesa esta vacante y qué aportarías"
                />
              </label>
              <p className="cp-item-sub">
                La empresa verá tu perfil de la plataforma y la HV que tengas subida. Si la ajustaste,{' '}
                <Link href="/candidate/profile" className="result-link">súbela de nuevo</Link> antes de postularte.
              </p>
              {apply.isError && (
                <p className="cp-error-inline" role="alert">{apply.error instanceof Error ? apply.error.message : 'No se pudo enviar la postulación'}</p>
              )}
              <div className="cp-actions">
                <button type="button" className="btn-secondary-sm" onClick={onClose}>Cancelar</button>
                <button type="button" className="btn-save" onClick={() => apply.mutate()} disabled={apply.isPending}>
                  {apply.isPending ? 'Enviando…' : 'Enviar postulación'}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
