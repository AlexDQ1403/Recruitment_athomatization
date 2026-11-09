import { supabase } from '../lib/supabase';
import { RecruiterDashboard } from '../types';

export const dashboardService = {
  /** Resumen del reclutador: pipeline, aprobados, vacantes y actividad reciente (empresa de la sesión). */
  async recruiter(): Promise<RecruiterDashboard> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autorizado');

    const res = await fetch('/api/dashboard/recruiter', { headers: { Authorization: `Bearer ${session.access_token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar el dashboard');
    return body as RecruiterDashboard;
  },
};
