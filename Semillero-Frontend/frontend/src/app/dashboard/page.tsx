'use client';
import dynamic from 'next/dynamic';
import { AppShell } from '../../components/layout/AppShell';
import { getStoredUser } from '../../lib/auth';

// Cada rol ve un solo dashboard: cargarlos por separado evita que reclutadores
// y empresas descarguen recharts, que solo usa la vista de superAdmin.
const loading = () => <div className="skeleton" style={{ height: 320 }} />;
const DashboardView = dynamic(() => import('../../components/dashboard/DashboardView').then((m) => m.DashboardView), { loading });
const RecruiterDashboardView = dynamic(() => import('../../components/dashboard/RecruiterDashboardView').then((m) => m.RecruiterDashboardView), { loading });
const EmpresaDashboardView = dynamic(() => import('../../components/company/EmpresaDashboardView').then((m) => m.EmpresaDashboardView), { loading });

export default function DashboardPage() {
  const user = getStoredUser();

  return (
    <AppShell>
      {user?.role === 'empresa'
        ? <EmpresaDashboardView />
        : user?.role === 'recruiter'
          ? <RecruiterDashboardView />
          : <DashboardView />}
    </AppShell>
  );
}
