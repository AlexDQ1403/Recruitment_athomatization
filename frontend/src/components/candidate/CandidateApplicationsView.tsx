'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApplicationStage, candidatePortalService, ExternalApplication, MyApplication, VacancyMatch,
} from '../../services/candidatePortalService';
import { ToastContainer } from '../ui/Toast';
import { useToast } from '../../hooks/useToast';
import { Icon, IconName } from '../ui/Icon';
import { MatchBadge, SkillsFit } from './MatchBadge';
import { ApplyModal } from './ApplyModal';
import { ExternalJobsTab } from './ExternalJobsTab';
import { AddExternalApplication, ExternalApplicationCard } from './ExternalApplicationCard';

const formatSalary = (min: number | null, max: number | null) => {
  if (!min && !max) return null;
  const fmt = (n: number) => `$${n.toLocaleString('es-CO')}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max)!);
};
const daysAgo = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
};
const daysLeft = (deadline: string | null) => {
  if (!deadline) return null;
  const d = Math.ceil((new Date(`${deadline.slice(0, 10)}T23:59:59-05:00`).getTime() - Date.now()) / 86400000);
  return d < 0 ? null : d === 0 ? 'cierra hoy' : d === 1 ? 'cierra mañana' : `cierra en ${d} días`;
};
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Qué significa cada etapa para el candidato y qué hacer. */
const STAGES: Record<ApplicationStage, { label: string; step: number; hint: string; tone: string }> = {
  enviada: { label: 'Enviada', step: 0, tone: 'badge-pending', hint: 'La empresa aún no revisa tu postulación.' },
  en_revision: { label: 'En revisión', step: 1, tone: 'badge-interviewed', hint: 'Un reclutador está revisando tu perfil.' },
  contactado: { label: 'Te contactaron', step: 1, tone: 'badge-interviewed', hint: 'Un reclutador te contactó: revisa tu correo y WhatsApp.' },
  preseleccionado: { label: 'Preseleccionado', step: 2, tone: 'badge-interviewed', hint: 'Tu perfil fue presentado a la empresa y está decidiendo.' },
  siguiente_fase: { label: 'Siguiente fase', step: 3, tone: 'badge-hired', hint: 'La empresa te autorizó para la siguiente fase: te contactará para entrevistas o pruebas.' },
  no_continua: { label: 'No continúa', step: -1, tone: 'badge-rejected', hint: 'Esta vez no sigues en el proceso. Usa los consejos de HV en tus próximas postulaciones.' },
};
const STEPS = ['Enviada', 'En revisión', 'Preseleccionado', 'Siguiente fase'];

/** Vacante abierta en el modal de ajuste y postulación. */
type Selected = {
  vacancy: { id: string; title: string; company: { name: string } };
  match: VacancyMatch;
  applied: boolean;
  external?: { jobId: string; url: string; sourceLabel: string };
};

type AppFilter = 'activas' | 'siguiente' | 'finalizadas' | 'todas';
/** Postulación de la plataforma o de otro sitio, en una sola lista. */
type AnyApp = { kind: 'interna'; app: MyApplication } | { kind: 'externa'; app: ExternalApplication };
const isClosed = (a: MyApplication) => a.stage === 'no_continua' || (a.stage !== 'siguiente_fase' && a.vacancy.status !== 'active');
const groupOf = (x: AnyApp): Exclude<AppFilter, 'todas'> => {
  if (x.kind === 'externa') return x.app.status === 'oferta' ? 'siguiente' : x.app.status === 'no_seleccionado' ? 'finalizadas' : 'activas';
  return x.app.stage === 'siguiente_fase' ? 'siguiente' : isClosed(x.app) ? 'finalizadas' : 'activas';
};
const appliedAt = (x: AnyApp) => (x.kind === 'externa' ? x.app.applied_at : x.app.created_at);
const scoreOf = (x: AnyApp) => (x.kind === 'externa' ? x.app.match_score ?? -1 : x.app.match.score);

export const CandidateApplicationsView = () => {
  const [tab, setTab] = useState<'recommended' | 'external' | 'mine'>('recommended');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [query, setQuery] = useState('');
  const [onlyFit, setOnlyFit] = useState(false);
  const [filter, setFilter] = useState<AppFilter>('activas');
  const [sort, setSort] = useState<'recent' | 'match'>('recent');
  const toast = useToast();

  const recs = useQuery({ queryKey: ['recommendations'], queryFn: () => candidatePortalService.recommendations() });
  const apps = useQuery({ queryKey: ['my-applications'], queryFn: () => candidatePortalService.listApplications() });

  const external = useQuery({ queryKey: ['external-applications'], queryFn: () => candidatePortalService.listExternalApplications() });

  const all = useMemo<AnyApp[]>(() => [
    ...(apps.data?.applications ?? []).map((app) => ({ kind: 'interna' as const, app })),
    ...(external.data?.applications ?? []).map((app) => ({ kind: 'externa' as const, app })),
  ], [apps.data, external.data]);
  const counts = useMemo(() => {
    const c = { activas: 0, siguiente: 0, finalizadas: 0, todas: all.length };
    for (const a of all) c[groupOf(a)]++;
    return c;
  }, [all]);

  const vacancies = useMemo(() => {
    const q = fold(query.trim());
    return (recs.data?.vacancies ?? [])
      .filter((v) => !onlyFit || v.match.score >= 50)
      .filter((v) => !q || fold(`${v.title} ${v.company.name} ${v.location ?? ''} ${(v.skills ?? []).join(' ')}`).includes(q));
  }, [recs.data, query, onlyFit]);

  const shownApps = useMemo(() => all
    .filter((a) => filter === 'todas' || groupOf(a) === filter)
    .sort((a, b) => (sort === 'match' ? scoreOf(b) - scoreOf(a) : appliedAt(b).localeCompare(appliedAt(a)))),
  [all, filter, sort]);

  const strength = recs.data?.profile_strength;

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.remove} />
      {selected && (
        <ApplyModal
          vacancy={selected.vacancy}
          match={selected.match}
          applied={selected.applied}
          external={selected.external}
          onClose={() => setSelected(null)}
          onApplied={() => {
            toast.success(selected.external
              ? 'Postulación registrada. Actualiza su estado en "Mis postulaciones" cuando te respondan.'
              : 'Postulación enviada. Síguela en "Mis postulaciones".');
            setSelected(null);
          }}
        />
      )}

      <div className="page-header">
        <h1>Vacantes y postulaciones</h1>
        <p>Las vacantes que más se ajustan a tu perfil, aquí y en otros sitios, y el estado de cada proceso</p>
      </div>

      <div className="cp-tabs" role="tablist" style={{ marginBottom: 18 }}>
        <button type="button" role="tab" aria-selected={tab === 'recommended'} className={`cp-tab${tab === 'recommended' ? ' active' : ''}`} onClick={() => setTab('recommended')}>
          Recomendadas para ti
        </button>
        <button type="button" role="tab" aria-selected={tab === 'external'} className={`cp-tab${tab === 'external' ? ' active' : ''}`} onClick={() => setTab('external')}>
          Otros sitios web
        </button>
        <button type="button" role="tab" aria-selected={tab === 'mine'} className={`cp-tab${tab === 'mine' ? ' active' : ''}`} onClick={() => setTab('mine')}>
          Mis postulaciones ({all.length})
        </button>
      </div>

      {tab === 'recommended' ? (
        <>
          {strength && (!recs.data?.has_cv || strength.missing.length > 0) && (
            <div className="cand-strength" role="note">
              <div>
                <strong>{!recs.data?.has_cv ? 'Sube tu hoja de vida para recomendaciones más precisas' : `Tu perfil está ${Math.round((strength.filled / strength.total) * 100)} % completo`}</strong>
                <span>
                  {strength.missing.length > 0
                    ? `El porcentaje de cada vacante se calcula con tu perfil. Te falta: ${strength.missing.join(', ').toLowerCase()}.`
                    : 'La IA llena tu perfil a partir de la HV y tú revisas antes de guardar.'}
                </span>
              </div>
              <Link href="/candidate/profile" className="btn-save">{!recs.data?.has_cv ? 'Subir mi HV' : 'Completar perfil'}</Link>
            </div>
          )}

          <div className="cand-toolbar">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por cargo, empresa, ciudad o habilidad"
              aria-label="Buscar vacantes"
            />
            <label className="cand-check">
              <input type="checkbox" checked={onlyFit} onChange={(e) => setOnlyFit(e.target.checked)} />
              Solo afines (50 % o más)
            </label>
          </div>

          {recs.isError && <p className="form-error">{recs.error instanceof Error ? recs.error.message : 'Error al cargar vacantes'}</p>}
          {recs.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 110, marginBottom: 10 }} />)
          ) : vacancies.length === 0 ? (
            <EmptyState
              icon="clipboard"
              title={recs.data?.vacancies.length ? 'Ninguna vacante coincide con el filtro' : 'No hay vacantes abiertas'}
              hint={recs.data?.vacancies.length ? 'Quita el filtro o prueba con otra palabra.' : 'Vuelve más tarde: las empresas publican nuevas ofertas con frecuencia.'}
            />
          ) : (
            <div className="cand-list">
              {vacancies.map((v) => (
                <article key={v.id} className="cand-card">
                  <div className="cand-card-main">
                    <div className="cand-card-head">
                      <h2>{v.title}</h2>
                      <MatchBadge score={v.match.score} />
                    </div>
                    <p className="cand-meta">
                      {v.company.name}{v.location ? ` · ${v.location}` : ''}{v.modality ? ` · ${v.modality}` : ''}
                      {formatSalary(v.salary_min, v.salary_max) && ` · ${formatSalary(v.salary_min, v.salary_max)}`}
                      {daysLeft(v.deadline) && ` · ${daysLeft(v.deadline)}`}
                    </p>
                    <SkillsFit match={v.match} />
                  </div>
                  <div className="cand-card-actions">
                    {v.applied ? (
                      <>
                        <span className="badge badge-interviewed">Ya postulado</span>
                        <button type="button" className="btn-secondary-sm" onClick={() => setSelected({ vacancy: v, match: v.match, applied: true })}>Consejos de HV</button>
                      </>
                    ) : (
                      <button type="button" className="btn-save" onClick={() => setSelected({ vacancy: v, match: v.match, applied: false })}>
                        Ver ajuste y postularme
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : tab === 'external' ? (
        <ExternalJobsTab
          onSelect={(j) => setSelected({
            vacancy: { id: j.id, title: j.title, company: { name: j.company ?? j.source_label } },
            match: j.match,
            applied: false,
            external: { jobId: j.id, url: j.url, sourceLabel: j.source_label },
          })}
        />
      ) : (
        <>
          <div className="cand-toolbar">
            <div className="report-range" role="group" aria-label="Filtrar postulaciones" style={{ marginBottom: 0 }}>
              {([['activas', 'En proceso'], ['siguiente', 'Siguiente fase'], ['finalizadas', 'Finalizadas'], ['todas', 'Todas']] as [AppFilter, string][]).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={filter === k} className={`report-chip${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>
                  {label} ({counts[k]})
                </button>
              ))}
            </div>
            <label className="cand-sort">
              Ordenar
              <select value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'match')}>
                <option value="recent">Más recientes</option>
                <option value="match">Mayor ajuste</option>
              </select>
            </label>
          </div>

          {external.data?.enabled === false ? (
            <p className="cp-note">Registrar postulaciones de otros sitios estará disponible cuando se aplique una actualización pendiente de la base de datos.</p>
          ) : adding ? (
            <AddExternalApplication onDone={() => setAdding(false)} onError={(m) => toast.error(m)} />
          ) : (
            <button type="button" className="result-link ext-add-toggle" onClick={() => setAdding(true)}>+ Registrar una postulación que hice en otro sitio</button>
          )}

          {apps.isError && <p className="form-error">{apps.error instanceof Error ? apps.error.message : 'Error al cargar postulaciones'}</p>}
          {apps.isLoading || external.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 120, marginBottom: 10 }} />)
          ) : all.length === 0 ? (
            <EmptyState icon="mail" title="Aún no te has postulado" hint="En «Recomendadas para ti» y «Otros sitios web» están las vacantes que más se ajustan a tu perfil." />
          ) : shownApps.length === 0 ? (
            <p className="dash-empty">No tienes postulaciones en este grupo.</p>
          ) : (
            <div className="cand-list">
              {shownApps.map((x) => x.kind === 'externa' ? (
                <ExternalApplicationCard key={`e-${x.app.id}`} application={x.app} onError={(m) => toast.error(m)} />
              ) : (
                <ApplicationCard
                  key={x.app.id}
                  application={x.app}
                  notesEnabled={apps.data?.notes_enabled !== false}
                  onAdvice={() => setSelected({ vacancy: { ...x.app.vacancy, company: x.app.company }, match: x.app.match, applied: true })}
                  onError={(m) => toast.error(m)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
};

const ApplicationCard = ({ application: a, notesEnabled, onAdvice, onError }: {
  application: MyApplication;
  notesEnabled: boolean;
  onAdvice: () => void;
  onError: (message: string) => void;
}) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(a.note ?? '');
  const stage = STAGES[a.stage];
  const closedVacancy = a.vacancy.status !== 'active' && a.stage !== 'siguiente_fase' && a.stage !== 'no_continua';

  const save = useMutation({
    mutationFn: () => candidatePortalService.updateApplicationNote(a.id, note.trim() || null),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['my-applications'] });
    },
    onError: (err) => onError(err instanceof Error ? err.message : 'No se pudo guardar la nota'),
  });

  return (
    <article className="cand-card app-card">
      <div className="cand-card-main">
        <div className="cand-card-head">
          <h2>{a.vacancy.title}</h2>
          <span className={`badge ${stage.tone}`}>{stage.label}</span>
        </div>
        <p className="cand-meta">
          {a.company.name}{a.vacancy.location ? ` · ${a.vacancy.location}` : ''} · te postulaste {daysAgo(a.created_at)}
          {' · '}<MatchBadge score={a.match.score} />
        </p>

        {a.stage === 'no_continua' ? null : (
          <ol className="app-steps" aria-label={`Etapa: ${stage.label}`}>
            {STEPS.map((label, i) => (
              <li key={label} className={i < stage.step ? 'done' : i === stage.step ? 'current' : ''}>
                {i === stage.step && a.stage === 'contactado' ? 'Te contactaron' : label}
              </li>
            ))}
          </ol>
        )}
        <p className="app-hint">{closedVacancy ? 'La empresa cerró esta vacante.' : stage.hint}</p>

        {notesEnabled && (editing ? (
          <div className="app-note-edit">
            <label className="sr-only" htmlFor={`note-${a.id}`}>Mi nota</label>
            <textarea
              id={`note-${a.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="p. ej. Entrevista el martes 10 a. m. con Laura; llevar portafolio"
              autoFocus
            />
            <div className="cp-actions">
              <button type="button" className="btn-secondary-sm" onClick={() => { setNote(a.note ?? ''); setEditing(false); }}>Cancelar</button>
              <button type="button" className="btn-save" onClick={() => save.mutate()} disabled={save.isPending}>Guardar nota</button>
            </div>
          </div>
        ) : a.note ? (
          <p className="app-note">
            <span>Mi nota:</span> {a.note}{' '}
            <button type="button" className="result-link" onClick={() => setEditing(true)}>Editar</button>
          </p>
        ) : null)}
      </div>
      <div className="cand-card-actions">
        <button type="button" className="btn-secondary-sm" onClick={onAdvice}>Consejos de HV</button>
        {notesEnabled && !editing && !a.note && (
          <button type="button" className="btn-secondary-sm" onClick={() => setEditing(true)}>Agregar nota</button>
        )}
      </div>
    </article>
  );
};

const EmptyState = ({ icon, title, hint }: { icon: IconName; title: string; hint: string }) => (
  <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)' }}>
    <span className="empty-icon"><Icon name={icon} size={22} /></span>
    <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 6 }}>{title}</p>
    <p style={{ fontSize: 13 }}>{hint}</p>
  </div>
);
