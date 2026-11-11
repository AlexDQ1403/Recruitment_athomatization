import { supabase } from '../lib/supabase';
import { CompanyDashboard, DashboardFilters, RecruiterDashboard } from '../types';

export const dashboardService = {
  /** Dashboard del reclutador (empresa de la sesión): embudo, qué hacer hoy, vacantes y orígenes. */
  async recruiter(filters: DashboardFilters = { period: '30d' }): Promise<RecruiterDashboard> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autorizado');

    const params = new URLSearchParams({ period: filters.period });
    if (filters.vacancyId) params.set('vacancy_id', filters.vacancyId);
    if (filters.source) params.set('source', filters.source);

    const res = await fetch(`/api/dashboard/recruiter?${params}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar el dashboard');
    return body as RecruiterDashboard;
  },

  /** Dashboard de la empresa: decisiones pendientes, vacantes y equipo de reclutamiento. */
  async company(): Promise<CompanyDashboard> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autorizado');

    const res = await fetch('/api/company/dashboard', { headers: { Authorization: `Bearer ${session.access_token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'No se pudo cargar el dashboard');
    return body as CompanyDashboard;
  },
};
