'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatMessage, Candidate } from '../../types';
import { supabase } from '../../lib/supabase';
import { chatService, ChatSession, MAX_SESSIONS } from '../../services/chatService';
import { ConfirmModal } from '../ui/ConfirmModal';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

const tempId = () => Math.random().toString(36).slice(2);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
          content: `⚠️ ${body?.error ?? `Error ${res.status}`}`,
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
      }
    } catch {
      setMessages((prev) => [...prev, {
        id: tempId(),
        role: 'assistant',
        content: '⚠️ Sin conexión al servidor. Verifica tu red e intenta de nuevo.',
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
                <p style={{ fontSize: 32, marginBottom: 12 }}>🔍</p>
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
                  <CandidateCards candidates={msg.candidates} />
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
                        animation: `bounce .9s ${i * 0.15}s infinite`,
                      }} />
                    ))}
                  </div>
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

const CandidateCards = ({ candidates }: { candidates: Candidate[] }) => (
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
            {c.source === 'internal' ? 'BD interna' : 'Web'}
          </span>
        </div>
        {c.match_reason && (
          <div style={{
            fontSize: 11.5, color: 'var(--accent)', background: 'var(--accent-glow)',
            borderRadius: 6, padding: '5px 10px', display: 'flex', alignItems: 'flex-start', gap: 6,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 1 }}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            {c.match_reason}
          </div>
        )}
      </div>
    ))}
  </div>
);
