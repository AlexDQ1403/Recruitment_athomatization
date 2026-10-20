import type { Metadata } from 'next';
import { RegisterChoice } from '../../components/auth/RegisterChoice';
import { SiteShell } from '../../components/landing/SiteShell';

export const metadata: Metadata = {
  title: 'Crear cuenta — Kmella',
};

export default function RegisterChoicePage() {
  return (
    <SiteShell>
      <RegisterChoice />
    </SiteShell>
  );
}
