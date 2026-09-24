import { supabase } from '../lib/supabase';

export interface ContactedCandidate {
  candidate_id: string;
  full_name: string;
  position: string | null;
  email: string | null;
  contacted_at: string;
  reason: string | null;
  current_status: string;
}

export interface RecruiterGroup {
  recruiter_id: string | null;
  recruiter_name: string;
  recruiter_email: string | null;
  candidates: ContactedCandidate[];
}

export interface DailyContactedReport {
  period_days: number;
  since: string;
  total: number;
  recruiters: RecruiterGroup[];
}

export const reportService = {
  async getDailyContacted(days = 1): Promise<DailyContactedReport> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autorizado');

    const res = await fetch(`/api/reports/daily-contacted?days=${days}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Error al cargar el reporte');
    }
    return res.json();
  },

  toCsv(report: DailyContactedReport): string {
    const rows = [['Reclutador', 'Candidato', 'Cargo', 'Email', 'Contactado', 'Estado actual']];
    for (const group of report.recruiters) {
      for (const c of group.candidates) {
        rows.push([
          group.recruiter_name,
          c.full_name,
          c.position ?? '',
          c.email ?? '',
          new Date(c.contacted_at).toLocaleString('es-CO'),
          c.current_status,
        ]);
      }
    }
    // Comillas dobles escapadas para no romper celdas con comas
    return rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
  },
};
