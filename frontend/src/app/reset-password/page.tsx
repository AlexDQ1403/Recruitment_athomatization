import type { Metadata } from 'next';
import { ResetPasswordForm } from '../../components/auth/ResetPasswordForm';
import { SiteShell } from '../../components/landing/SiteShell';

export const metadata: Metadata = {
  title: 'Nueva contraseña — Kmella',
};

export default function ResetPasswordPage() {
  return (
    <SiteShell>
      <ResetPasswordForm />
    </SiteShell>
  );
}
