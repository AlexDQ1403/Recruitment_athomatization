import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteShell } from '../landing/SiteShell';
import { Logo } from '../landing/Logo';
import { ThemeToggle } from '../landing/ThemeToggle';
import landing from '../landing/landing.module.css';
import styles from './legal.module.css';
import { LEGAL } from '../../lib/legal';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Página legal pública: índice a la izquierda y el texto completo, con el estilo de la web pública */
export function LegalLayout({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <SiteShell>
      <div className={`${landing.page} ${styles.page}`}>
        <header className={styles.top}>
          {/* Logo ya es un enlace a la página de inicio */}
          <Logo height={34} />
          <nav className={styles.topLinks} aria-label="Documentos legales">
            <Link href="/privacidad">Tratamiento de datos</Link>
            <Link href="/terminos">Términos</Link>
            <ThemeToggle />
          </nav>
        </header>

        <main className={styles.main}>
          <p className={styles.kicker}>Versión {LEGAL.version} · Vigente desde el {LEGAL.effectiveDate}</p>
          <h1 className={styles.title}>{title}</h1>
          <div className={styles.intro}>{intro}</div>

          <div className={styles.grid}>
            <nav className={styles.toc} aria-label="Contenido">
              <p className={styles.tocTitle}>Contenido</p>
              <ol>
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <article className={styles.doc}>
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} className={styles.section}>
                  <h2>
                    {i + 1}. {s.title}
                  </h2>
                  {s.body}
                </section>
              ))}
            </article>
          </div>
        </main>

        <footer className={styles.foot}>
          <p>
            ¿Dudas sobre tus datos? Escríbenos a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
          </p>
          <Link href="/">← Volver a la página de inicio</Link>
        </footer>
      </div>
    </SiteShell>
  );
}
