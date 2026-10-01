'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AuthLayout, SemiState, useIdleTips, useSemiEyes, useSemiRefs } from './AuthLayout';
import styles from './auth.module.css';

type Option = 'none' | 'company' | 'candidate';

const OPTIONS = [
  {
    key: 'company' as const,
    href: '/register/company',
    title: 'Soy una empresa',
    desc: 'Publica vacantes, gestiona tu equipo de reclutadores y busca candidatos con la IA.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      </svg>
    ),
  },
  {
    key: 'candidate' as const,
    href: '/register/candidate',
    title: 'Busco empleo',
    desc: 'Crea tu perfil profesional, sube tu hoja de vida y postúlate a vacantes.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
];

const SAY: Record<Option, SemiState> = {
  none: { pose: 'roles', mood: 'happy', say: '¡Hola! ¿Qué tipo de cuenta quieres crear?' },
  company: { pose: 'chat', mood: 'happy', say: '¡Genial! Publicarás vacantes y buscarás talento conmigo.' },
  candidate: { pose: 'empezar', mood: 'love', say: '¡A buscar empleo! Te ayudo a que las empresas te encuentren.' },
};

const IDLE_TIPS: SemiState[] = [
  { pose: 'roles', mood: 'normal', say: '¿Tienes una empresa y buscas personal? Elige "Soy una empresa".' },
  { pose: 'inicio', mood: 'happy', say: '¿Buscas trabajo? Elige "Busco empleo" y crea tu perfil.' },
  { pose: 'chat', mood: 'normal', say: 'Si ya tienes cuenta, inicia sesión con el enlace de abajo.' },
];

export function RegisterChoice() {
  const [hover, setHover] = useState<Option>('none');
  const { eyesRef, semiRef } = useSemiRefs();
  const tip = useIdleTips(hover === 'none');
  useSemiEyes(eyesRef, semiRef, null);

  const semi = hover === 'none' && tip >= 0 ? IDLE_TIPS[tip % IDLE_TIPS.length] : SAY[hover];

  return (
    <AuthLayout
      heading="Empecemos por conocerte."
      semi={semi}
      eyesRef={eyesRef}
      semiRef={semiRef}
    >
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Crear una cuenta</h2>
        <p className={styles.cardSubtitle}>Elige el tipo de cuenta que necesitas</p>

        <div className={styles.choices}>
          {OPTIONS.map((o) => (
            <Link
              key={o.key}
              href={o.href}
              className={styles.choice}
              onMouseEnter={() => setHover(o.key)}
              onMouseLeave={() => setHover('none')}
              onFocus={() => setHover(o.key)}
              onBlur={() => setHover('none')}
            >
              <span className={styles.choiceIcon}>{o.icon}</span>
              <span className={styles.choiceText}>
                <span className={styles.choiceTitle}>{o.title}</span>
                <span className={styles.choiceDesc}>{o.desc}</span>
              </span>
              <span className={styles.choiceArrow} aria-hidden="true">→</span>
            </Link>
          ))}
        </div>

        <p className={styles.switch}>
          ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
