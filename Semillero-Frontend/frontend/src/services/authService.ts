import { supabase } from '../lib/supabase';
import { User, UserRole } from '../types';

export const authService = {
  async login(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role, company_id')
      .eq('id', data.user.id)
      .single();

    if (profileError) throw new Error('No se pudo cargar el perfil');

    return { id: data.user.id, email: data.user.email!, full_name: profile.full_name, role: profile.role, company_id: profile.company_id || '' };
  },

  async logout() {
    await supabase.auth.signOut();
  },

  async sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
  },

  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },

  async createUser(email: string, password: string, fullName: string, role: UserRole) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autorizado');

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email, password, full_name: fullName, role }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Error al crear usuario');
    }
    return res.json();
  },

  async deleteUser(userId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autorizado');

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) throw new Error('Error al eliminar usuario');
  },

  async listUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, email, company_id')
      .order('full_name');
    if (error) throw new Error(error.message);
    return (data || []).map(d => ({ ...d, company_id: d.company_id || '' })) as User[];
  },
};
