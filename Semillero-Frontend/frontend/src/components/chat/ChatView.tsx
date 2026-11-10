'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatMessage, Candidate, CandidateRejection, ContactChannel, Vacancy, CandidateObservation, CandidateObservationCode, CandidateDecision, CandidateDecisionState, SOURCE_LABELS } from '../../types';
import { supabase } from '../../lib/supabase';
import { chatService, ChatSession } from '../../services/chatService';
import { candidateService } from '../../services/candidateService';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Icon } from '../ui/Icon';
import { CandidateProfileModal, ProfileTab } from './CandidateProfileModal';
import { AffinityBadge } from './AffinityBadge';
import { DecisionBar } from './DecisionBar';
import { RejectForRoleModal } from './RejectForRoleModal';
import { VacancySuggestion } from './VacancySuggestion';
import { roleFromQuery, isSearchAnswer, isFollowUp } from '../../lib/searchRole';
import { vacancyService } from '../../services/vacancyService';
import { candidateProfileService } from '../../services/candidateProfileService';

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
  const focusMessageId = useRef<string | null>(searchParams.get('m'));
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
  // Rechazo por puesto: a quién y con qué puesto sugerido; y los rechazados en esta visita
  const [rejectTarget, setRejectTarget] = useState<{ candidate: Candidate; suggestedRole: string } | null>(null);
  const [rejectedHere, setRejectedHere] = useState<Record<string, CandidateRejection>>({});
  const requestReject = useCallback((candidate: Candidate, suggestedRole: string) => setRejectTarget({ candidate, suggestedRole }), []);
  // Relación chat ↔ vacantes: tras contactar, dar seguimiento, aprobar o rechazar a alguien
  // de una respuesta, se propone crear (o ver) la vacante de ese cargo.
  const [actedOn, setActedOn] = useState<string[]>([]);
  // Candidatos concretos trabajados: se asocian a la vacante que se cree o exista para la búsqueda
  const [actedCandidates, setActedCandidates] = useState<string[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>([]);
  // Vacante activa de cada cargo buscado (undefined = consultando, null = no existe).
  // Aprobar y dar seguimiento la exigen: sin vacante esos botones quedan deshabilitados.
  const [vacancyByRole, setVacancyByRole] = useState<Record<string, Pick<Vacancy, 'id' | 'title'> | null>>({});
  const requestedRoles = useRef(new Set<string>());
  const markActed = useCallback((candidateId: string) => {
    const msg = messages.find((m) => m.candidates?.some((c) => c.id === candidateId));
    if (msg) setActedOn((prev) => (prev.includes(msg.id) ? prev : [...prev, msg.id]));
    setActedCandidates((prev) => (prev.includes(candidateId) ? prev : [...prev, candidateId]));
  }, [messages]);
  const undoReject = useCallback(async (c: Candidate) => {
    const rejection = rejectedHere[c.id];
    if (!rejection) return;
    try {
      await candidateProfileService.undoReject(rejection.kind, c.id, rejection.id);
      setRejectedHere((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : 'No se pudo deshacer el rechazo');
    }
  }, [rejectedHere]);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const requestedDecisionIds = useRef(new Set<string>());
  const [pendingSearch, setPendingSearch] = useState<{ sessionId: string; knownDoneIds: string[] } | null>(null);
  // Perfil completo abierto desde una tarjeta, y a quién se le escribió en esta visita
  const [profileTarget, setProfileTarget] = useState<{ candidate: Candidate; tab: ProfileTab } | null>(null);
  const [contacted, setContacted] = useState<Record<string, ContactChannel>>({});
  const openProfile = useCallback((candidate: Candidate, tab: ProfileTab) => setProfileTarget({ candidate, tab }), []);
  const closeProfile = useCallback(() => setProfileTarget(null), []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
        // Desde el historial: /chat?session=…&m=… abre esa búsqueda (aunque sea antigua)
        const fromHistory = searchParams.get('session');
        if (fromHistory) setActiveSessionId(fromHistory);
        else if (list.length > 0) setActiveSessionId(list[0].id);
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

  const applyDecision = useCallback(async (c: Candidate, decision: CandidateDecision, vacancyId?: string) => {
    setDecidingId(c.id);
    setDecisionError(null);
    try {
      const result = await candidateService.decide(c.id, decision, undefined, vacancyId);
      setDecisions((prev) => ({ ...prev, [c.id]: { status: result.status, presented: result.presented, vacancy_id: result.vacancy_id ?? vacancyId ?? null } }));
      markActed(c.id);
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : 'No se pudo aplicar la decisión');
    } finally {
      setDecidingId(null);
    }
  }, [markActed]);

  useEffect(() => {
    // Si se llegó desde el historial, se muestra ese mensaje en vez de ir al final
    const target = focusMessageId.current && document.getElementById(`msg-${focusMessageId.current}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.add('turn-focus');
      focusMessageId.current = null;
      return;
    }
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
        if (body.session_id && body.session_id !== activeSessionId) setActiveSessionId(body.session_id);
        // Siempre: la primera búsqueda le da nombre a la sesión ("Contadora pública · Bogotá")
        chatService.listSessions().then(setSessions).catch(() => null);
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

  // El campo crece con el texto hasta su alto máximo (definido en CSS)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const pickExample = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  // La sugerencia de vacante va siempre en la última respuesta de búsqueda (y en las
  // anteriores donde el reclutador ya trabajó con algún candidato)
  const lastSearchAnswerId = [...messages].reverse().find(isSearchAnswer)?.id;

  // Consulta (una vez por cargo) si existe la vacante de cada búsqueda con candidatos
  useEffect(() => {
    messages.forEach((m, i) => {
      if (!m.candidates?.length) return;
      const query = messages.slice(0, i).reverse().find((x) => x.role === 'user')?.content ?? '';
      const role = roleOfAnswer(m, query);
      if (!role || requestedRoles.current.has(role)) return;
      requestedRoles.current.add(role);
      vacancyService.match(role)
        .then((v) => setVacancyByRole((prev) => ({ ...prev, [role]: v })))
        .catch(() => {
          requestedRoles.current.delete(role); // se reintenta en el próximo cambio
          setVacancyByRole((prev) => ({ ...prev, [role]: null }));
        });
    });
  }, [messages]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="search-page">
      {rejectTarget && (
        <RejectForRoleModal
          candidate={rejectTarget.candidate}
          suggestedRole={rejectTarget.suggestedRole}
          onClose={() => setRejectTarget(null)}
          onRejected={(rejection) => {
            setRejectedHere((prev) => ({ ...prev, [rejectTarget.candidate.id]: rejection }));
            markActed(rejectTarget.candidate.id);
            setRejectTarget(null);
          }}
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
      {profileTarget && (
        <CandidateProfileModal
          key={profileTarget.candidate.id}
          candidate={profileTarget.candidate}
          initialTab={profileTarget.tab}
          onClose={closeProfile}
          onContacted={(id, contact) => {
            setContacted((prev) => ({ ...prev, [id]: contact.channel }));
            markActed(id);
          }}
          onRejectionUndone={(id) => setRejectedHere((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          })}
        />
      )}

      <h1 className="sr-only">Búsqueda de candidatos</h1>

      <div className="search-workspace">
        <aside className="search-rail" aria-label="Búsquedas guardadas">
          <div className="search-rail-head">
            <span>Búsquedas</span>
            <span className="search-rail-count">{sessions.length}</span>
          </div>
          <button
            type="button"
            className="search-new"
            onClick={handleNewSession}
            disabled={loadingSessions}
          >
            <Icon name="plus" size={14} /> Nueva búsqueda
          </button>

          <div className="search-rail-list">
            {loadingSessions ? (
              [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 30, margin: '4px 0' }} />)
            ) : sessions.length === 0 ? (
              <p className="search-rail-empty">Tus búsquedas aparecerán aquí.</p>
            ) : (
              sessions.map((s) => (
                <div key={s.id} className={`search-rail-item${s.id === activeSessionId ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="search-rail-name"
                    onClick={() => setActiveSessionId(s.id)}
                    aria-current={s.id === activeSessionId ? 'true' : undefined}
                    title={s.name}
                  >
                    <span>{s.name}</span>
                    <time dateTime={s.updated_at}>{formatDay(s.updated_at)}</time>
                  </button>
                  <button
                    type="button"
                    className="search-rail-delete"
                    onClick={() => setDeleteTarget(s)}
                    aria-label={`Eliminar ${s.name}`}
                    title="Eliminar búsqueda"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="search-thread" aria-label="Conversación">
          <header className="search-thread-head">
            <p className="search-thread-title">{activeSession?.name ?? 'Búsqueda nueva'}</p>
            {(decisionError || sessionError) && (
              <p className="search-thread-error" role="alert">{decisionError ?? sessionError}</p>
            )}
          </header>

          <div className="search-log">
            {messages.length === 0 && !loading && <EmptyThread onPick={pickExample} />}

            {messages.map((msg, i) => {
              // La consulta que originó esta respuesta
              const query = messages.slice(0, i).reverse().find((m) => m.role === 'user')?.content ?? '';
              const role = roleOfAnswer(msg, query);
              // Una pregunta sobre resultados ya mostrados ("de esos…") no es un cargo nuevo
              const suggestion = query && !isFollowUp(query) && isSearchAnswer(msg) && !dismissedSuggestions.includes(msg.id)
                && (actedOn.includes(msg.id) || msg.id === lastSearchAnswerId)
                ? (actedOn.includes(msg.id) ? 'accion' : msg.candidates?.length ? 'busqueda' : 'sin-resultados')
                : null;
              return (
                <article key={msg.id} id={`msg-${msg.id}`} className={`turn ${msg.role === 'user' ? 'turn-query' : 'turn-answer'}`}>
                  <p className="turn-meta">
                    {msg.role === 'user' ? 'Tú' : 'Kmella'} · <time dateTime={msg.created_at}>{formatTime(msg.created_at)}</time>
                  </p>
                  <p className="turn-text">{msg.content}</p>
                  {msg.candidates && msg.candidates.length > 0 && (
                    <CandidateResults
                      candidates={msg.candidates}
                      decisions={decisions}
                      decidingId={decidingId}
                      onDecide={applyDecision}
                      vacancy={vacancyByRole[role]}
                      onRequestReject={requestReject}
                      onUndoReject={undoReject}
                      rejectedHere={rejectedHere}
                      // Sin cargo detectado (mensajes viejos), el puesto sugerido es la consulta que originó la respuesta
                      query={query}
                      onOpenProfile={openProfile}
                      contacted={contacted}
                    />
                  )}
                  {suggestion && (
                    <VacancySuggestion
                      role={role}
                      query={query}
                      reason={suggestion}
                      onCreated={(v) => setVacancyByRole((prev) => ({ ...prev, [role]: v }))}
                      related={(msg.candidates ?? []).filter((c) => actedCandidates.includes(c.id) && !rejectedHere[c.id])}
                      onDismiss={() => setDismissedSuggestions((prev) => [...prev, msg.id])}
                    />
                  )}
                </article>
              );
            })}

            {loading && <Working text="Buscando en la base de candidatos…" />}
            {pendingSearch && <Working text="Buscando en fuentes externas. Los resultados aparecerán aquí al terminar; puede tardar un par de minutos." />}
            <div ref={bottomRef} />
          </div>

          <form
            className="search-composer"
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          >
            <label htmlFor="search-input" className="sr-only">Describe el perfil que buscas</label>
            <textarea
              id="search-input"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Cargo, ciudad, años de experiencia, salario máximo…"
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={loading}
            />
            <div className="search-composer-bar">
              <span className="search-composer-hint">
                <kbd>Enter</kbd> busca · <kbd>Shift</kbd>+<kbd>Enter</kbd> nueva línea
              </span>
              {input.length > MAX_MESSAGE_LENGTH * 0.8 && (
                <span className="search-composer-count">{input.length}/{MAX_MESSAGE_LENGTH}</span>
              )}
              <button type="submit" className="btn-save" disabled={loading || !input.trim()}>
                Buscar
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};

/** Respuesta final sin candidatos ("No encontré…", "Terminé la búsqueda y no encontré…"). */
/** Cargo de una respuesta: el que entendió la IA, o el aproximado de la consulta. */
const roleOfAnswer = (msg: ChatMessage, query: string) =>
  msg.candidates?.find((c) => c.matched_role)?.matched_role || roleFromQuery(query);

// Mismo tope que valida el backend en /api/chat
const MAX_MESSAGE_LENGTH = 1000;

const formatDay = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? formatTime(iso)
    : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
};

const EXAMPLES = [
  'Desarrollador backend con Python, 3 años de experiencia, en Bogotá',
  'Auxiliar contable en Medellín con salario hasta 2.500.000',
  'Diseñador UX con portafolio, remoto',
];

const EmptyThread = ({ onPick }: { onPick: (text: string) => void }) => (
  <div className="search-empty">
    <p className="search-empty-title">Describe el perfil que necesitas</p>
    <p className="search-empty-text">
      Escríbelo como se lo pedirías a un colega. Entre más concreto (cargo, ciudad, experiencia, salario),
      más preciso el filtro. Si en la base no hay suficientes, se busca también en fuentes externas.
    </p>
    <p className="search-empty-label">Por ejemplo</p>
    <ul className="search-examples">
      {EXAMPLES.map((ex) => (
        <li key={ex}>
          <button type="button" onClick={() => onPick(ex)}>{ex}</button>
        </li>
      ))}
    </ul>
  </div>
);

const Working = ({ text }: { text: string }) => (
  <div className="turn turn-answer" role="status">
    <p className="turn-meta">Kmella</p>
    <p className="turn-text turn-working">{text}</p>
    <span className="search-progress" aria-hidden="true" />
  </div>
);

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

const CONTACTED_LABELS: Record<ContactChannel, string> = {
  whatsapp: 'Le escribiste por WhatsApp',
  email: 'Le escribiste por correo',
  linkedin: 'Le escribiste por LinkedIn',
};

const CandidateResults = ({ candidates, decisions, decidingId, onDecide, vacancy, onRequestReject, onUndoReject, rejectedHere, query, onOpenProfile, contacted }: {
  candidates: Candidate[];
  decisions: Record<string, CandidateDecisionState | null>;
  decidingId: string | null;
  onDecide: (c: Candidate, decision: CandidateDecision, vacancyId?: string) => void;
  /** Vacante del cargo de esta búsqueda (undefined = consultando, null = no existe). */
  vacancy: Pick<Vacancy, 'id' | 'title'> | null | undefined;
  onRequestReject: (c: Candidate, suggestedRole: string) => void;
  onUndoReject: (c: Candidate) => void;
  rejectedHere: Record<string, CandidateRejection>;
  query: string;
  onOpenProfile: (c: Candidate, tab: ProfileTab) => void;
  contacted: Record<string, ContactChannel>;
}) => (
  <div className="results">
    <p className="results-count">
      {candidates.length} {candidates.length === 1 ? 'candidato' : 'candidatos'}
    </p>
    {/* Una sola vez, no en cada tarjeta: sin vacante del cargo no se aprueba ni se da seguimiento */}
    {vacancy === null && candidates.some((c) => !decisions[c.id]?.vacancy_id) && (
      <p className="results-note">
        Para aprobar o dar seguimiento, primero crea la vacante de este cargo (te la propongo al final de la lista).
      </p>
    )}
    <ol className="results-list">
      {candidates.map((c) => {
        const tags = observationTags(c);
        const facts = [
          c.location,
          c.experience_years ? years(c.experience_years) : null,
          c.expected_salary ? `aspira a ${money(c.expected_salary)}` : null,
        ].filter(Boolean);
        return (
          <li key={c.id} className="result">
            <div className="result-main">
              <div>
                <p className="result-name">
                  <button type="button" className="result-name-btn" onClick={() => onOpenProfile(c, 'perfil')}>
                    {c.full_name}
                  </button>
                </p>
                <p className="result-role">{c.position || c.headline}</p>
              </div>
              <span className="result-source">{SOURCE_LABELS[c.source] ?? c.source}</span>
            </div>
            {facts.length > 0 && <p className="result-facts">{facts.join(' · ')}</p>}
            {typeof c.affinity === 'number' && <AffinityBadge score={c.affinity} parts={c.affinity_parts} />}
            {c.match_reason && <p className="result-reason">{c.match_reason}</p>}
            {tags.length > 0 && (
              <ul className="result-flags">
                {tags.map((t) => <li key={t.key} className={t.warn ? 'warn' : undefined}>{t.text}</li>)}
              </ul>
            )}
            {c.rejected_for && c.rejected_for.length > 0 && (
              <p className="result-rejected-before">
                Rechazado antes para: {c.rejected_for.map((r) => (r.reason ? `${r.role} (${r.reason})` : r.role)).join(' · ')}
              </p>
            )}
            {rejectedHere[c.id] && (
              <p className="result-rejected-now" role="status">
                Rechazado para «{rejectedHere[c.id].role_label}». No volverá a salir en búsquedas de ese puesto.
                <button type="button" onClick={() => onUndoReject(c)}>Deshacer</button>
              </p>
            )}
            <div className="result-foot">
              <button type="button" className="result-contact" onClick={() => onOpenProfile(c, 'contactar')}>
                <Icon name="phone" size={13} /> Contactar
              </button>
              <button type="button" className="result-link" onClick={() => onOpenProfile(c, 'perfil')}>
                Ver perfil completo
              </button>
              {contacted[c.id] && (
                <span className="result-contacted"><Icon name="check" size={12} /> {CONTACTED_LABELS[contacted[c.id]]}</span>
              )}
              {!rejectedHere[c.id] && (
                <DecisionBar
                  candidate={c}
                  state={decisions[c.id]}
                  vacancy={vacancy}
                  busy={decidingId === c.id}
                  onDecide={onDecide}
                />
              )}
              {!rejectedHere[c.id] && decisions[c.id]?.status !== 'rechazado' && (
                <button
                  type="button"
                  className="result-reject"
                  // El cargo, no la frase completa ("Necesito una contadora en Bogotá…" → "contadora"):
                  // la clave del rechazo con "bogota" o "niif" no reconocería el mismo puesto después
                  onClick={() => onRequestReject(c, c.matched_role || roleFromQuery(query))}
                  title="Lo descarta para este puesto; sigue disponible para otros"
                >
                  Rechazar para este puesto
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  </div>
);
