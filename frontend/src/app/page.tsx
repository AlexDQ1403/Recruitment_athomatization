import type { Metadata } from 'next';
import { LandingPage } from '../components/landing/LandingPage';
import { SiteShell } from '../components/landing/SiteShell';

export const metadata: Metadata = {
  title: 'Kmella — Reclutamiento con IA',
  description:
    'Reclutamiento con IA: busca candidatos escribiendo lo que necesitas, con afinidad y búsqueda en LinkedIn. Si buscas empleo, sube tu hoja de vida y ve las vacantes que más se ajustan a ti.',
};

export default function Home() {
  return (
    <SiteShell>
      <LandingPage />
    </SiteShell>
  );
}
