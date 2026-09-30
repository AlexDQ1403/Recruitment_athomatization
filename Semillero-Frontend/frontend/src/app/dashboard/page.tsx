'use client';
import { AppShell } from '../../components/layout/AppShell';
import { DashboardView } from '../../components/dashboard/DashboardView';
import { EmpresaDashboardView } from '../../components/company/EmpresaDashboardView';
import { getStoredUser } from '../../lib/auth';

export default function DashboardPage() {
  const user = getStoredUser();

  return (
    <AppShell>
      {user?.role === 'empresa' ? <EmpresaDashboardView /> : <DashboardView />}
    </AppShell>
  );
}
