import { supabase } from '../lib/supabase';
import { ChatMessage } from '../types';

export const MAX_SESSIONS = 5;

export interface ChatSession {
  id: string;
  name: string;
  company_id: string;
  created_at: string;
  updated_at: string;
}

export const chatService = {
  /** Las 5 sesiones más recientes del usuario (el backend aplica el mismo tope). */
  async listSessions(): Promise<ChatSession[]> {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id, name, company_id, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(MAX_SESSIONS);
    if (error) throw new Error(error.message);
    return (data ?? []) as ChatSession[];
  },

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, role, content, candidates, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ChatMessage[];
  },

  async createSession(name?: string): Promise<ChatSession> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autorizado');

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (!profile?.company_id) throw new Error('Tu usuario no tiene empresa asignada');

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: user.id,
        company_id: profile.company_id,
        name: name ?? `Búsqueda ${new Date().toLocaleDateString('es-CO')}`,
      })
      .select('id, name, company_id, created_at, updated_at')
      .single();
    if (error) throw new Error(error.message);
    return data as ChatSession;
  },

  async renameSession(sessionId: string, name: string): Promise<void> {
    const { error } = await supabase
      .from('chat_sessions')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    if (error) throw new Error(error.message);
  },

  /** Los mensajes caen en cascada por la FK de chat_messages. */
  async deleteSession(sessionId: string): Promise<void> {
    const { error } = await supabase.from('chat_sessions').delete().eq('id', sessionId);
    if (error) throw new Error(error.message);
  },
};
