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

/** Reporte de resultados (GET /api/reports/results). Ver backend/src/services/companyReport.ts */
export interface CompanyReport {
  range: { from: string; to: string };
  totals: {
    found: number;
    contacted: number;
    presented: number;
    authorized: number;
    discarded: number;
    avg_days_to_decide: number | null;
    avg_days_to_first_presented: number | null;
    pending_now: number;
  };
  vacancies: {
    id: string; title: string; status: string; created_at: string;
    found: number; contacted: number; presented: number; authorized: number; discarded: number;
    days_to_first_presented: number | null;
  }[];
  unassigned: { found: number; contacted: number };
  discard_reasons: { reason: string; count: number }[];
  discarded_without_reason: number;
  recruiters: {
    id: string; full_name: string; contacted: number; presented: number; authorized: number; discarded: number; hit_rate: number | null;
  }[];
}

const csvCell = (cell: unknown) => `"${String(cell ?? '').replace(/"/g, '""')}"`;

export const reportService = {
  /** from/to: 'YYYY-MM-DD' (hora de Colombia). */
  async getResults(from: string, to: string): Promise<CompanyReport> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No autorizado');

    const res = await fetch(`/api/reports/results?${new URLSearchParams({ from, to })}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'Error al cargar el reporte');
    return body as CompanyReport;
  },

  /** Un solo CSV con una sección por tabla, para abrir en Excel. */
  resultsToCsv(r: CompanyReport, from: string, to: string): string {
    const n = (v: number | null) => (v === null ? '' : v);
    const rows: unknown[][] = [
      ['Reporte de resultados', `${from} a ${to}`],
      [],
      ['Resumen'],
      ['Encontrados', 'Contactados', 'Presentados a la empresa', 'Autorizados a siguiente fase', 'Descartados', 'Días promedio en decidir', 'Días promedio al primer presentado', 'Pendientes hoy'],
      [r.totals.found, r.totals.contacted, r.totals.presented, r.totals.authorized, r.totals.discarded, n(r.totals.avg_days_to_decide), n(r.totals.avg_days_to_first_presented), r.totals.pending_now],
      [],
      ['Por vacante'],
      ['Vacante', 'Estado', 'Encontrados', 'Contactados', 'Presentados', 'Autorizados', 'Descartados', 'Días al primer presentado'],
      ...r.vacancies.map((v) => [v.title, v.status, v.found, v.contacted, v.presented, v.authorized, v.discarded, n(v.days_to_first_presented)]),
      ...(r.unassigned.found || r.unassigned.contacted ? [['Sin vacante (búsquedas)', '', r.unassigned.found, r.unassigned.contacted, '', '', '', '']] : []),
      [],
      ['Motivos de descarte'],
      ['Motivo', 'Veces'],
      ...r.discard_reasons.map((d) => [d.reason, d.count]),
      ...(r.discarded_without_reason ? [['Sin motivo', r.discarded_without_reason]] : []),
      [],
      ['Por reclutador'],
      ['Reclutador', 'Contactados', 'Presentados', 'Autorizados', 'Descartados', 'Acierto %'],
      ...r.recruiters.map((m) => [m.full_name, m.contacted, m.presented, m.authorized, m.discarded, n(m.hit_rate)]),
    ];
    return rows.map((row) => row.map(csvCell).join(',')).join('\n');
  },


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
