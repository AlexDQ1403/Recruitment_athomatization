'use client';
import { useMemo, useState } from 'react';
import { PipelineRow, PipelineStage } from '../../types';

export const STAGE_LABELS: Record<PipelineStage, string> = {
  sin_revisar: 'Sin revisar',
  seguimiento: 'En seguimiento',
  contactado: 'Contactado',
  aprobado: 'Aprobado',
  contratado: 'Autorizado por la empresa',
  descartado_empresa: 'Descartado por la empresa',
  rechazado: 'Rechazado',
  sin_vacante: 'Sin vacante',
};

// Orden de la tabla: primero lo que pide acción, al final lo cerrado y lo que no está en ninguna vacante
const STAGE_ORDER: PipelineStage[] = ['sin_revisar', 'contactado', 'aprobado', 'seguimiento', 'contratado', 'descartado_empresa', 'rechazado', 'sin_vacante'];
const PAGE = 25;

const ago = (days: number | null) => (days === null ? '' : days === 0 ? 'hoy' : days === 1 ? 'hace 1 día' : `hace ${days} días`);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Quién está en qué etapa de qué vacante: cada fila con el último movimiento (qué,
 * quién, cuándo y por qué) y el siguiente paso. Se filtra por etapa y por nombre.
 */
export const PipelineTable = ({ data, loading, onOpen, vacancies = [], onLink }: {
  data?: { counts: Record<PipelineStage, number>; total: number; rows: PipelineRow[] };
  loading: boolean;
  /** Abre el perfil del candidato (en "contactar" si el siguiente paso es escribirle). */
  onOpen: (row: PipelineRow, tab: 'perfil' | 'contactar') => void;
  /** Vacantes a las que se puede asociar a quien está "sin vacante". */
  vacancies?: { id: string; title: string }[];
  /** Asocia; devuelve un mensaje si no se pudo (p. ej. candidato con cuenta propia). */
  onLink?: (row: PipelineRow, vacancyId: string) => Promise<string | null>;
}) => {
  const [stage, setStage] = useState<PipelineStage | 'todas'>('todas');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const q = fold(query.trim());
    return (data?.rows ?? [])
      .filter((r) => stage === 'todas' || r.stage === stage)
      .filter((r) => !q || fold(`${r.full_name} ${r.title ?? ''} ${r.vacancy_title ?? ''}`).includes(q))
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || (b.days ?? -1) - (a.days ?? -1));
  }, [data, stage, query]);

  const chips: (PipelineStage | 'todas')[] = ['todas', ...STAGE_ORDER.filter((s) => (data?.counts[s] ?? 0) > 0)];

  return (
    <div className="pipe">
      <div className="pipe-tools">
        <div className="pipe-chips" role="tablist" aria-label="Filtrar por etapa">
          {chips.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={stage === s}
              className={`pipe-chip${stage === s ? ' active' : ''}${s !== 'todas' ? ` stage-${s}` : ''}`}
              onClick={() => { setStage(s); setLimit(PAGE); }}
            >
              {s === 'todas' ? 'Todas' : STAGE_LABELS[s]}
              <span>{s === 'todas' ? data?.total ?? 0 : data?.counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
          placeholder="Buscar por nombre, cargo o vacante"
          aria-label="Buscar candidato"
          className="pipe-search"
        />
      </div>

      <div className="candidate-table-wrapper">
        <table className="candidate-table pipe-table">
          <thead>
            <tr>
              <th>Candidato</th>
              <th>Vacante</th>
              <th>Etapa</th>
              <th>Último movimiento</th>
              <th>Siguiente paso</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="skeleton-row">{Array.from({ length: 5 }).map((__, j) => <td key={j}><div className="skeleton" /></td>)}</tr>
                ))
              : rows.length === 0
                ? <tr><td colSpan={5} className="pipe-empty">No hay candidatos {stage === 'todas' ? 'con estos filtros' : `en «${STAGE_LABELS[stage]}»`}.</td></tr>
                : rows.slice(0, limit).map((r) => (
                    <tr key={`${r.kind}-${r.id}-${r.vacancy_id ?? 'none'}`}>
                      <td>
                        <button type="button" className="pipe-name" onClick={() => onOpen(r, 'perfil')}>{r.full_name}</button>
                        {r.title && <span className="pipe-sub">{r.title}</span>}
                      </td>
                      <td>{r.vacancy_title ?? <span className="pipe-muted">Sin vacante</span>}</td>
                      <td><span className={`pipe-stage stage-${r.stage}`}>{STAGE_LABELS[r.stage]}</span></td>
                      <td>
                        <span className="pipe-event">{r.event.label}</span>
                        <span className="pipe-sub">{[r.event.by && `por ${r.event.by}`, ago(r.days)].filter(Boolean).join(' · ')}</span>
                        {r.event.reason && <span className="pipe-reason">Motivo: {r.event.reason}</span>}
                      </td>
                      <td>
                        {r.stage === 'sin_vacante' && onLink && vacancies.length > 0 ? (
                          <LinkToVacancy row={r} vacancies={vacancies} onLink={onLink} />
                        ) : r.next_action ? (
                          r.next_action === 'Contactar' || r.next_action === 'Recontactar o decidir'
                            ? <button type="button" className="btn-secondary-sm" onClick={() => onOpen(r, 'contactar')}>{r.next_action}</button>
                            : <span className={`pipe-next${/Recordar|Revisar|Asociarlo/.test(r.next_action) ? ' urgent' : ''}`}>{r.next_action}</span>
                        ) : <span className="pipe-muted">—</span>}
                      </td>
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" className="pipe-more" onClick={() => setLimit((n) => n + PAGE)}>
          Ver {Math.min(PAGE, rows.length - limit)} más de {rows.length - limit}
        </button>
      )}
    </div>
  );
};

/** Elegir vacante + "Asociar", en la misma fila de quien salió de una búsqueda sin vacante. */
const LinkToVacancy = ({ row, vacancies, onLink }: {
  row: PipelineRow;
  vacancies: { id: string; title: string }[];
  onLink: (row: PipelineRow, vacancyId: string) => Promise<string | null>;
}) => {
  const [vacancyId, setVacancyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="pipe-link">
      <select value={vacancyId} onChange={(e) => setVacancyId(e.target.value)} aria-label={`Vacante para ${row.full_name}`}>
        <option value="">Elegir vacante…</option>
        {vacancies.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
      </select>
      <button
        type="button"
        className="btn-secondary-sm"
        disabled={!vacancyId || busy}
        onClick={async () => { setBusy(true); setNote(await onLink(row, vacancyId)); setBusy(false); }}
      >
        {busy ? 'Asociando…' : 'Asociar'}
      </button>
      {note && <span className="pipe-reason">{note}</span>}
    </div>
  );
};
