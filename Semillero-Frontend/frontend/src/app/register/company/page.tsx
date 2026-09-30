import type { Metadata } from 'next';
import { RegisterForm } from '../../../components/auth/RegisterForm';
import { SiteShell } from '../../../components/landing/SiteShell';

export const metadata: Metadata = {
  title: 'Registrar empresa — Semillero',
};

export default function RegisterCompanyPage() {
  return (
    <SiteShell>
      <RegisterForm variant="company" />
    </SiteShell>
  );
}
