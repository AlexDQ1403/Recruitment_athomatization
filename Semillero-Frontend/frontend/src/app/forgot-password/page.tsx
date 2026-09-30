import type { Metadata } from 'next';
import { ForgotPasswordForm } from '../../components/auth/ForgotPasswordForm';
import { SiteShell } from '../../components/landing/SiteShell';

export const metadata: Metadata = {
  title: 'Recuperar contraseña — Semillero',
};

export default function ForgotPasswordPage() {
  return (
    <SiteShell>
      <ForgotPasswordForm />
    </SiteShell>
  );
}
