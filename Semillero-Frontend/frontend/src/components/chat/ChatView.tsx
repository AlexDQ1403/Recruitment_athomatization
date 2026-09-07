'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatMessage, Candidate } from '../../types';
import { supabase } from '../../lib/supabase';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

export const ChatView = () => {
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(searchParams.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Obtener sesión una sola vez al montar
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      setUserId(session.user.id);
      setToken(session.access_token);
    });
  }, []);

  // Cargar historial cuando tengamos userId
  useEffect(() => {
    if (!userId || initialized.current) return;
    initialized.current = true;
    supabase
      .from('chat_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50)
      .then(({ data }) => {
        if (data && data.length > 0) setMessages(data as ChatMessage[]);
      });
  }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !token) return;

    const content = input.trim();
    setInput('');
    setLoading(true);

    const tempId = Math.random().toString(36).slice(2);
    const userMsg: ChatMessage = {
      id: tempId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: content }),
      });

      const body = await res.json();

      if (!res.ok) {
        const errText = body?.error ?? `Error ${res.status}`;
        setMessages((prev) => [...prev, {
          id: Math.random().toString(36).slice(2),
          role: 'assistant',
          content: `⚠️ ${errText}`,
          created_at: new Date().toISOString(),
        }]);
      } else {
        setMessages((prev) => [...prev, {
          id: Math.random().toString(36).slice(2),
          role: 'assistant',
          content: body.message ?? 'No se pudo obtener respuesta.',
          candidates: body.candidates,
          created_at: new Date().toISOString(),
        }]);
      }
    } catch {
      setMessages((prev) => [...prev, {
        id: Math.random().toString(36).slice(2),
        role: 'assistant',
        content: '⚠️ Sin conexión al servidor. Verifica tu red e intenta de nuevo.',
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, token]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      sendMessage();
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Búsqueda por chat</h1>
        <p>Pide candidatos en lenguaje natural — el sistema los busca automáticamente</p>
      </div>

      <div className="chat-room" style={{ height: 'calc(100vh - 200px)' }}>
        <div className="chat-messages">
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>🔍</p>
              <p style={{ fontSize: 15, marginBottom: 6, color: 'var(--text-2)' }}>Empieza una búsqueda</p>
              <p style={{ fontSize: 13 }}>Ej: "Necesito un desarrollador Python con 3 años de experiencia en Bogotá"</p>
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
