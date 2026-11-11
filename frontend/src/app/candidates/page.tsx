'use client';
import { AppShell } from '../../components/layout/AppShell';
import { CandidatesView } from '../../components/candidates/CandidatesView';
import { CompanyCandidatesHistoryView } from '../../components/company/CompanyCandidatesHistoryView';
import { getStoredUser } from '../../lib/auth';

export default function CandidatesPage() {
  const user = getStoredUser();

  return (
    <AppShell>
      {user?.role === 'empresa' ? <CompanyCandidatesHistoryView /> : <CandidatesView />}
    </AppShell>
  );
}
