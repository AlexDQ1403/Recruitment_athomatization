import type { Metadata } from 'next';
import { RegisterForm } from '../../../components/auth/RegisterForm';
import { SiteShell } from '../../../components/landing/SiteShell';

export const metadata: Metadata = {
  title: 'Crear perfil de candidato — Semillero',
};

export default function RegisterCandidatePage() {
  return (
    <SiteShell>
      <RegisterForm variant="candidate" />
    </SiteShell>
  );
}
