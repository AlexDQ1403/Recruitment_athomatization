'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatMessage, Candidate, CandidateObservation, CandidateObservationCode, CandidateDecision, CandidateDecisionState, SOURCE_LABELS } from '../../types';
import { supabase } from '../../lib/supabase';
import { chatService, ChatSession, MAX_SESSIONS } from '../../services/chatService';
import { candidateService } from '../../services/candidateService';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Icon } from '../ui/Icon';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

const tempId = () => Math.random().toString(36).slice(2);

// Búsqueda externa (n8n): el backend agrega un mensaje a la sesión cuando termina.
// Mientras tanto se consulta la sesión cada SEARCH_POLL_MS, máximo SEARCH_POLL_MAX_MS.
const SEARCH_DONE_PREFIX = 'Terminé la búsqueda';
const SEARCH_POLL_MS = 8000;
const SEARCH_POLL_MAX_MS = 3 * 60 * 1000;

const isSearchDone = (m: ChatMessage) => m.role === 'assistant' && m.content.startsWith(SEARCH_DONE_PREFIX);

export const ChatView = () => {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(searchParams.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  // Búsqueda externa en curso: sesión y avisos de "terminé" que ya existían al empezar.
  // Estado vigente de cada candidato mostrado: undefined = cargando, null = no se puede decidir sobre él
  const [decisions, setDecisions] = useState<Record<string, CandidateDecisionState | null>>({});
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Candidate | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const requestedDecisionIds = useRef(new Set<string>());
  const [pendingSearch, setPendingSearch] = useState<{ sessionId: string; knownDoneIds: string[] } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setToken(session.access_token);
    });
  }, []);

  // Carga las sesiones y selecciona la más reciente
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    chatService
      .listSessions()
      .then((list) => {
        setSessions(list);
        if (list.length > 0) setActiveSessionId(list[0].id);
      })
      .catch((err) => setSessionError(err instanceof Error ? err.message : 'Error al cargar sesiones'))
      .finally(() => setLoadingSessions(false));
  }, []);

  // Carga los mensajes de la sesión activa
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    chatService
      .getMessages(activeSessionId)
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [activeSessionId]);

  // Las tarjetas guardan una captura del candidato al momento del mensaje; el estado
  // real (aprobado, seguimiento, rechazado) se consulta aparte para no mostrar acciones obsoletas.
  useEffect(() => {
    const ids = messages
      .flatMap((m) => m.candidates ?? [])
      .map((c) => c.id)
      .filter((id) => !requestedDecisionIds.current.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => requestedDecisionIds.current.add(id));

    candidateService
      .getDecisions(ids)
      .then((found) => {
        setDecisions((prev) => {
          const next = { ...prev };
          for (const id of ids) next[id] = found[id] ?? null;
          return next;
        });
      })
      .catch(() => {
        // se reintenta la próxima vez que cambien los mensajes
        ids.forEach((id) => requestedDecisionIds.current.delete(id));
      });
  }, [messages]);

  const applyDecision = useCallback(async (c: Candidate, decision: CandidateDecision) => {
    setDecidingId(c.id);
    setDecisionError(null);
    try {
      const result = await candidateService.decide(c.id, decision);
      setDecisions((prev) => ({ ...prev, [c.id]: { status: result.status, presented: result.presented } }));
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : 'No se pudo aplicar la decisión');
    } finally {
      setDecidingId(null);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingSearch]);

  // Si el usuario cambia de sesión, deja de esperar la de la anterior
  useEffect(() => {
    setPendingSearch((prev) => (prev && prev.sessionId !== activeSessionId ? null : prev));
  }, [activeSessionId]);

  // Espera el aviso de n8n: cuando aparece un mensaje "Terminé la búsqueda…" nuevo, recarga la sesión
  useEffect(() => {
    if (!pendingSearch) return;
    const { sessionId, knownDoneIds } = pendingSearch;
    const startedAt = Date.now();
    let stopped = false;

    const stop = () => {
      stopped = true;
      clearInterval(timer);
    };

    const timer = setInterval(async () => {
      if (stopped) return;
      if (Date.now() - startedAt > SEARCH_POLL_MAX_MS) {
        stop();
        setPendingSearch(null);
        setMessages((prev) => [...prev, {
          id: tempId(),
          role: 'assistant',
          content: 'La búsqueda externa está tardando más de lo normal. Vuelve a consultar en unos minutos.',
          created_at: new Date().toISOString(),
        }]);
        return;
      }
      try {
        const list = await chatService.getMessages(sessionId);
        if (stopped) return;
        if (list.some((m) => isSearchDone(m) && !knownDoneIds.includes(m.id))) {
          stop();
          setMessages(list);
          setPendingSearch(null);
        }
      } catch {
        // se reintenta en el siguiente ciclo
      }
    }, SEARCH_POLL_MS);

    return stop;
  }, [pendingSearch]);

  const handleNewSession = useCallback(async () => {
    if (sessions.length >= MAX_SESSIONS) {
      setSessionError(`Máximo ${MAX_SESSIONS} búsquedas guardadas. Elimina una para crear otra.`);
      return;
    }
    try {
      const created = await chatService.createSession();
      setSessions((prev) => [created, ...prev]);
      setActiveSessionId(created.id);
      setMessages([]);
      setSessionError(null);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Error al crear sesión');
    }
  }, [sessions.length]);

  const handleDeleteSession = useCallback(async (session: ChatSession) => {
    try {
      await chatService.deleteSession(session.id);
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== session.id);
        if (activeSessionId === session.id) {
          setActiveSessionId(remaining[0]?.id ?? null);
        }
        return remaining;
      });
      setSessionError(null);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Error al eliminar sesión');
    }
  }, [activeSessionId]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !token) return;

    const content = input.trim();
    setInput('');
    setLoading(true);

    setMessages((prev) => [...prev, {
      id: tempId(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // Sin session_id el backend abre una sesión nueva y devuelve la suya
        body: JSON.stringify({ message: content, session_id: activeSessionId ?? undefined }),
      });

      const body = await res.json();

      if (!res.ok) {
        setMessages((prev) => [...prev, {
          id: tempId(),
          role: 'assistant',
          content: body?.error ?? `Error ${res.status}`,
          created_at: new Date().toISOString(),
        }]);
      } else {
        // El backend pudo crear la sesión: adoptamos su id
        if (body.session_id && body.session_id !== activeSessionId) {
          setActiveSessionId(body.session_id);
          chatService.listSessions().then(setSessions).catch(() => null);
        }
        setMessages((prev) => [...prev, {
          id: tempId(),
          role: 'assistant',
          content: body.message ?? 'No se pudo obtener respuesta.',
          candidates: body.candidates,
          created_at: new Date().toISOString(),
        }]);
        // n8n está buscando: quedamos a la espera de su aviso en esta sesión
        if (body.external_search && body.session_id) {
          const sessionId = body.session_id as string;
          chatService
            .getMessages(sessionId)
            .then((list) => setPendingSearch({ sessionId, knownDoneIds: list.filter(isSearchDone).map((m) => m.id) }))
            .catch(() => null);
        }
      }
    } catch {
      setMessages((prev) => [...prev, {
        id: tempId(),
        role: 'assistant',
        content: 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.',
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, token, activeSessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      sendMessage();
    }
  };

  return (
    <div>
      {rejectTarget && (
        <ConfirmModal
          message={`¿Rechazar a ${rejectTarget.full_name}? Es definitivo: no se podrá reactivar ni aprobar después.`}
          confirmLabel="Rechazar"
          onConfirm={() => { applyDecision(rejectTarget, 'rechazar'); setRejectTarget(null); }}
          onCancel={() => setRejectTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          message={`¿Eliminar la búsqueda "${deleteTarget.name}"? Se perderán sus mensajes.`}
          confirmLabel="Eliminar"
          onConfirm={() => { handleDeleteSession(deleteTarget); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Búsqueda por chat</h1>
          <p>Pide candidatos en lenguaje natural — el sistema los busca automáticamente</p>
        </div>
        <button
          className="btn-primary"
          style={{ width: 'auto', padding: '10px 20px' }}
          onClick={handleNewSession}
          disabled={loadingSessions || sessions.length >= MAX_SESSIONS}
          title={sessions.length >= MAX_SESSIONS ? `Máximo ${MAX_SESSIONS} búsquedas` : undefined}
        >
          + Nueva búsqueda
        </button>
      </div>

      {decisionError && (
        <div className="form-error" style={{ marginBottom: 12 }} role="alert">{decisionError}</div>
      )}

      {sessionError && (
        <div className="form-error" style={{ marginBottom: 12 }}>{sessionError}</div>
      )}

      <div className="chat-layout">
        <aside className="chat-sessions" aria-label="Búsquedas guardadas">
          <p className="nav-section-label">
            Búsquedas ({sessions.length}/{MAX_SESSIONS})
          </p>
          {loadingSessions ? (
            <div className="skeleton" style={{ height: 32, marginBottom: 8 }} />
          ) : sessions.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '4px 2px' }}>
              Escribe abajo para empezar
            </p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`session-item${s.id === activeSessionId ? ' active' : ''}`}
              >
                <button
                  className="session-name"
                  onClick={() => setActiveSessionId(s.id)}
                  title={s.name}
                >
                  {s.name}
                </button>
                <button
                  className="btn-danger-sm"
                  onClick={() => setDeleteTarget(s)}
                  aria-label={`Eliminar ${s.name}`}
                  title="Eliminar"
                >×</button>
              </div>
            ))
          )}
        </aside>

        <div className="chat-room">
          <div className="chat-messages">
            {messages.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)' }}>
                <span className="empty-icon"><Icon name="search" size={22} /></span>
                <p style={{ fontSize: 15, marginBottom: 6, color: 'var(--text-2)' }}>Empieza una búsqueda</p>
                <p style={{ fontSize: 13 }}>Ej: &quot;Necesito un desarrollador Python con 3 años de experiencia en Bogotá&quot;</p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id}>
                <div className={`chat-message ${msg.role === 'user' ? 'own' : 'other'}`}>
                  <div className="bubble">
                    <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                    <span className="timestamp">{formatTime(msg.created_at)}</span>
                  </div>
                </div>
                {msg.candidates && msg.candidates.length > 0 && (
                  <CandidateCards
                    candidates={msg.candidates}
                    decisions={decisions}
                    decidingId={decidingId}
                    onDecide={applyDecision}
                    onRequestReject={setRejectTarget}
                  />
                )}
              </div>
            ))}

            {loading && (
              <div className="chat-message other">
                <div className="bubble">
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
                    {[0, 1, 2].map((i) => (
                      <span key={i} style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'var(--text-3)',
                        animation: `dotRise .9s ${i * 0.15}s infinite`,
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {pendingSearch && (
              <div className="chat-message other" role="status" aria-live="polite">
                <div className="bubble">
                  <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Buscando en fuentes externas…</p>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-area">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Ej: "Busca un ingeniero de sistemas con experiencia en React en Medellín"'
              rows={1}
              disabled={loading}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              aria-label="Enviar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const MAX_OBSERVATION_TAGS = 3;

const years = (n: number | string | undefined) => `${n} ${Number(n) === 1 ? 'año' : 'años'}`;
const money = (n: number | string | undefined) => `$${Number(n).toLocaleString('es-CO')}`;

// Único mapa de textos; los códigos desconocidos (mensajes viejos o nuevos) se ignoran.
const OBSERVATION_LABELS: Record<CandidateObservationCode, (o: CandidateObservation) => string> = {
  experience_missing: () => 'Experiencia no encontrada',
  salary_missing: () => 'Salario no encontrado',
  location_missing: () => 'Ubicación no encontrada',
  experience_below: (o) => `Tiene ${years(o.found)}; pediste ${o.requested}`,
  salary_above: (o) => `Aspira ${money(o.found)}; tu máximo ${money(o.requested)}`,
  location_mismatch: (o) => `Está en ${o.found}; pediste ${o.requested}`,
  unverified_profile: () => 'Perfil sin verificar',
};

const observationTags = (c: Candidate): { key: string; text: string; warn: boolean }[] => {
  const tags: { key: string; text: string; warn: boolean }[] = [];
  if (c.fit === 'partial') tags.push({ key: 'fit', text: 'Coincidencia parcial', warn: true });
  const known = (c.observations ?? []).filter((o) => o.code in OBSERVATION_LABELS);
  const ordered = [...known.filter((o) => o.severity === 'warn'), ...known.filter((o) => o.severity !== 'warn')];
  for (const o of ordered) tags.push({ key: o.code, text: OBSERVATION_LABELS[o.code](o), warn: o.severity === 'warn' });
  return tags.slice(0, MAX_OBSERVATION_TAGS);
};

const CandidateCards = ({ candidates, decisions, decidingId, onDecide, onRequestReject }: {
  candidates: Candidate[];
  decisions: Record<string, CandidateDecisionState | null>;
  decidingId: string | null;
  onDecide: (c: Candidate, decision: CandidateDecision) => void;
  onRequestReject: (c: Candidate) => void;
}) => (
  <div style={{ padding: '8px 0 8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
    {candidates.map((c) => (
      <div key={c.id} style={{
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '12px 16px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'flex-start', marginBottom: c.match_reason ? 8 : 0 }}>
          <div>
            <p style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{c.full_name}</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              {c.position}{c.location ? ` · ${c.location}` : ''}{c.experience_years ? ` · ${c.experience_years} años exp.` : ''}
            </p>
            {c.expected_salary && (
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                Salario esperado: ${c.expected_salary.toLocaleString('es-CO')}
              </p>
            )}
          </div>
          <span className={`badge ${c.source === 'internal' ? 'badge-hired' : 'badge-pending'}`} style={{ fontSize: 11 }}>
            {SOURCE_LABELS[c.source] ?? c.source}
          </span>
        </div>
        {c.resume_url && (
          <a href={c.resume_url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11.5, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: c.match_reason ? 8 : 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Ver hoja de vida
          </a>
        )}
        {c.match_reason && (
          <div style={{
            fontSize: 11.5, color: 'var(--accent-text)', background: 'var(--accent-glow)',
            borderRadius: 6, padding: '5px 10px', display: 'flex', alignItems: 'flex-start', gap: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 1 }}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            {c.match_reason}
          </div>
        )}
        {observationTags(c).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {observationTags(c).map((t) => (
              <span key={t.key} className={`badge ${t.warn ? 'badge-pending' : ''}`} style={{ fontSize: 11 }}>
                {t.text}
              </span>
            ))}
          </div>
        )}
        <DecisionBar
          candidate={c}
          state={decisions[c.id]}
          busy={decidingId === c.id}
          onDecide={onDecide}
          onRequestReject={onRequestReject}
        />
      </div>
    ))}
  </div>
);

const DECISION_BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500,
  padding: '5px 11px', borderRadius: 7, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer',
};

/** Aprobar · Seguimiento · Rechazar. Sin estado conocido (cargando o candidato no gestionable) no muestra nada. */
const DecisionBar = ({ candidate: c, state, busy, onDecide, onRequestReject }: {
  candidate: Candidate;
  state: CandidateDecisionState | null | undefined;
  busy: boolean;
  onDecide: (c: Candidate, decision: CandidateDecision) => void;
  onRequestReject: (c: Candidate) => void;
}) => {
  if (!state) return null;

  if (state.status === 'rechazado') {
    return (
      <div style={{ marginTop: 10 }}>
        <span className="badge badge-rejected" style={{ fontSize: 11 }}>Rechazado</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
      {state.presented && <span className="badge badge-hired" style={{ fontSize: 11 }}>Aceptado</span>}
      <span style={{ flex: 1 }} />
      <button
        type="button"
        style={{ ...DECISION_BTN, ...(state.presented ? {} : { color: 'var(--green)', borderColor: 'color-mix(in srgb, var(--green) 40%, transparent)' }) }}
        onClick={() => onDecide(c, 'aprobar')}
        disabled={busy || state.presented}
        aria-busy={busy}
        title="Pasa a la lista de candidatos aceptados de la empresa"
      >
        <Icon name="check" size={13} /> Aprobar
      </button>
      <button
        type="button"
        style={DECISION_BTN}
        onClick={() => onDecide(c, 'seguimiento')}
        disabled={busy || (!state.presented && state.status === 'seguimiento')}
        aria-busy={busy}
        title="Lo sigue considerando sin descartarlo (sale de la lista de aceptados)"
      >
        <Icon name="clock" size={13} /> Seguimiento
      </button>
      <button
        type="button"
        style={{ ...DECISION_BTN, color: 'var(--red)', borderColor: 'color-mix(in srgb, var(--red) 40%, transparent)' }}
        onClick={() => onRequestReject(c)}
        disabled={busy}
        aria-busy={busy}
        title="Lo descarta definitivamente"
      >
        <Icon name="xCircle" size={13} /> Rechazar
      </button>
    </div>
  );
};
