import type { Metadata } from 'next';
import { LoginForm } from '../../components/auth/LoginForm';
import { SiteShell } from '../../components/landing/SiteShell';

export const metadata: Metadata = {
  title: 'Iniciar sesión — Kmella',
};

export default function LoginPage() {
  return (
    <SiteShell>
      <LoginForm />
    </SiteShell>
  );
}
