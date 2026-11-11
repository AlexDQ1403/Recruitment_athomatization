import type { Metadata } from 'next';
import { LandingPage } from '../components/landing/LandingPage';
import { SiteShell } from '../components/landing/SiteShell';

export const metadata: Metadata = {
  title: 'Kmella — Reclutamiento con IA',
  description:
    'Vacantes, candidatos y reclutadores en un solo lugar. Encuentra talento describiendo el perfil en lenguaje natural.',
};

export default function Home() {
  return (
    <SiteShell>
      <LandingPage />
    </SiteShell>
  );
}
