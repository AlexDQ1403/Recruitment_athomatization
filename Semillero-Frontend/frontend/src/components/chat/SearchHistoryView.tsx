'use client';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { SearchHistory } from '../../types';
import { useRouter } from 'next/navigation';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

async function fetchSearchHistory(): Promise<SearchHistory[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('search_history')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data as SearchHistory[];
}

export const SearchHistoryView = () => {
  const router = useRouter();

  const { data: history = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['search-history'],
    queryFn: fetchSearchHistory,
  });

  return (
    <div>
      <div className="page-header">
        <h1>Historial de búsquedas</h1>
        <p>Búsquedas realizadas con el asistente IA</p>
      </div>

      <div className="candidate-table-wrapper">
        {isError && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--red)', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }} role="alert">
            <span>No se pudo cargar el historial.</span>
            <button onClick={() => refetch()} style={{ fontSize: 13, color: 'var(--accent)', padding: '6px 16px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              Reintentar
            </button>
          </div>
        )}

        {!isError && (
          <table className="candidate-table">
            <thead>
              <tr>
                <th>Búsqueda</th>
                <th>Resultados</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {[1, 2, 3, 4].map((j) => <td key={j}><div className="skeleton" /></td>)}
                    </tr>
                  ))
                : history.length === 0
                  ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-3)' }}>
                        <p style={{ fontSize: 28, marginBottom: 8 }}>🔍</p>
                        <p style={{ fontSize: 14, marginBottom: 4, color: 'var(--text-2)' }}>Sin búsquedas aún</p>
                        <p style={{ fontSize: 12 }}>Las búsquedas con el chat IA aparecerán aquí</p>
                      </td>
                    </tr>
                  )
                  : history.map((item) => (
                    <tr key={item.id} className="table-row">
                      <td style={{ color: 'var(--text-1)', fontWeight: 500, maxWidth: 360 }}>
                        <span style={{
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>
                          {item.query}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '2px 10px', borderRadius: 4,
                          background: item.candidates_found > 0 ? 'rgba(93,184,122,.1)' : 'rgba(90,90,90,.1)',
                          color: item.candidates_found > 0 ? 'var(--green)' : 'var(--text-3)',
                          fontSize: 12, fontWeight: 700,
                        }}>
                          {item.candidates_found > 0 && (
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                          )}
                          {item.candidates_found} {item.candidates_found === 1 ? 'candidato' : 'candidatos'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {fmtDate(item.created_at)}
                      </td>
                      <td>
                        <button
                          onClick={() => router.push(`/chat?q=${encodeURIComponent(item.query)}`)}
                          title="Repetir búsqueda"
                          style={{
                            padding: '5px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                            background: 'var(--surface-2)', border: '1px solid var(--border)',
                            color: 'var(--text-3)', transition: 'color 120ms, border-color 120ms',
                          }}
                          onMouseEnter={(e) => { (e.currentTarget).style.color = 'var(--accent)'; (e.currentTarget).style.borderColor = 'var(--accent)'; }}
                          onMouseLeave={(e) => { (e.currentTarget).style.color = 'var(--text-3)'; (e.currentTarget).style.borderColor = 'var(--border)'; }}
                        >
                          Repetir →
                        </button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        )}

        {history.length > 0 && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              {history.length} búsqueda{history.length !== 1 ? 's' : ''} en total
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
