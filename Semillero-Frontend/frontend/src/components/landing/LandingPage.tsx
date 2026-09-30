import Link from 'next/link';
import { ChatDemo } from './ChatDemo';
import { Constellation } from './Constellation';
import { NavActions } from './NavActions';
import { Logo } from './Logo';
import { Mascot } from './Mascot';
import { PipelineStages } from './PipelineStages';
import { Reveal, SplitWords } from './Reveal';
import { Sprout } from './Sprout';
import { ThemeToggle } from './ThemeToggle';
import styles from './landing.module.css';

export function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={`${styles.navBar} ${styles.navEnter}`}>
        <div className={styles.nav}>
          <Logo />
          <nav className={styles.navLinks} aria-label="Secciones">
            <a href="#chat" className={styles.navLink}>Búsqueda IA</a>
            <a href="#pipeline" className={styles.navLink}>Pipeline</a>
            <a href="#roles" className={styles.navLink}>Para quién</a>
          </nav>
          <div className={styles.navActions}>
            <ThemeToggle />
            <NavActions />
          </div>
        </div>
      </header>

      <main>
        {/* ─── Hero ─────────────────────────────────────── */}
        <section id="inicio" className={styles.hero}>
          <div className={styles.heroText}>
            <Reveal variant="words">
              <h1 className={styles.display}>
                <SplitWords text="Tu próximo talento ya está aquí. Solo pregunta." />
              </h1>
            </Reveal>
            <Reveal delay={550}>
              <p className={styles.label}>Reclutamiento con inteligencia artificial</p>
            </Reveal>
            <Reveal delay={700}>
              <p className={styles.body}>
                Semillero reúne vacantes, candidatos y reclutadores en un solo lugar.
                Describe el perfil que buscas en lenguaje natural y la plataforma
                encuentra a las personas que encajan.
              </p>
            </Reveal>
            <Reveal delay={850}>
              <div className={styles.ctaRow}>
                <Link href="/register" className={styles.pill}>Empezar ahora</Link>
                <Link href="/login" className={styles.ghost}>Ya tengo cuenta →</Link>
              </div>
            </Reveal>
          </div>
          <div className={styles.heroVisual}>
            <Constellation className={styles.canvas} captionClassName={styles.shapeCaption} />
          </div>
        </section>

        {/* ─── Búsqueda por chat ────────────────────────── */}
        <section id="chat" className={`${styles.split} ${styles.reverse}`}>
          <div className={styles.splitText}>
            <Reveal>
              <p className={styles.label}>01 — Búsqueda por chat</p>
            </Reveal>
            <Reveal variant="words">
              <h2 className={styles.headingLg}>
                <SplitWords text="Describe el perfil. Semillero lo encuentra." />
              </h2>
            </Reveal>
            <Reveal delay={250}>
              <p className={styles.body}>
                Nada de filtros interminables. Escribe lo que necesitas como se lo
                dirías a un colega y la IA recorre tu base de candidatos para
                mostrarte los perfiles más cercanos. Cada búsqueda queda en tu
                historial para volver a ella.
              </p>
            </Reveal>
          </div>
          <ChatDemo />
        </section>

        {/* ─── Pipeline ─────────────────────────────────── */}
        <section id="pipeline" className={styles.split}>
          <div className={styles.splitText}>
            <Reveal>
              <p className={styles.label}>02 — Pipeline de candidatos</p>
            </Reveal>
            <Reveal variant="words">
              <h2 className={styles.headingLg}>
                <SplitWords text="Cada candidato, en su lugar." />
              </h2>
            </Reveal>
            <Reveal delay={250}>
              <p className={styles.body}>
                Mueve candidatos entre etapas desde la tabla o el tablero kanban,
                deja notas y consulta el historial de cambios. El dashboard y los
                reportes te muestran cómo avanza el proceso.
              </p>
            </Reveal>
          </div>
          <PipelineStages />
        </section>

        {/* ─── Roles ────────────────────────────────────── */}
        <section id="roles" className={styles.section}>
          <Reveal>
            <p className={styles.label}>03 — Para quién es</p>
          </Reveal>
          <Reveal variant="words">
            <h2 className={styles.headingLg}>
              <SplitWords text="Dos puertas, un mismo proceso." />
            </h2>
          </Reveal>
          <div className={styles.roles}>
            <Reveal delay={100} className={styles.role}>
              <p className={styles.roleTag}>Empresas</p>
              <h3 className={styles.headingSm}>Publica, busca y decide con tu equipo.</h3>
              <p className={styles.bodyMuted}>
                Crea vacantes con salario, modalidad y skills, invita a tus
                reclutadores y gestiona el pipeline completo con búsqueda por IA.
              </p>
              <Link href="/register/company" className={styles.ghost}>Registrar mi empresa →</Link>
            </Reveal>
            <Reveal delay={260} className={styles.role}>
              <p className={styles.roleTag}>Candidatos</p>
              <h3 className={styles.headingSm}>Tu perfil trabaja por ti.</h3>
              <p className={styles.bodyMuted}>
                Crea tu perfil profesional, sube tu hoja de vida y sigue el estado
                de cada una de tus postulaciones desde un solo lugar.
              </p>
              <Link href="/register/candidate" className={styles.ghost}>Crear mi perfil →</Link>
            </Reveal>
          </div>
        </section>

        {/* ─── Cierre ───────────────────────────────────── */}
        <section id="empezar" className={`${styles.split} ${styles.closing}`}>
          <div className={styles.splitText}>
            <Reveal>
              <p className={styles.label}>04 — Empieza hoy</p>
            </Reveal>
            <Reveal variant="words">
              <h2 className={styles.headingLg}>
                <SplitWords text="Tu próximo contratado está a una pregunta de distancia." />
              </h2>
            </Reveal>
            <Reveal delay={250}>
              <p className={styles.body}>
                Crea la cuenta de tu empresa, invita a tus reclutadores y haz tu
                primera búsqueda. Si buscas empleo, arma tu perfil y deja que las
                oportunidades te encuentren.
              </p>
            </Reveal>
            <Reveal delay={400}>
              <div className={styles.ctaRow}>
                <Link href="/register/company" className={styles.pill}>Soy empresa</Link>
                <Link href="/register/candidate" className={styles.ghost}>Busco empleo →</Link>
              </div>
            </Reveal>
          </div>
          <Sprout />
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <Reveal className={styles.footerBrand}>
            <Logo id="semillero-mark-footer" />
            <p className={styles.bodyMuted}>
              Reclutamiento con inteligencia artificial: vacantes, candidatos y
              reclutadores conectados en un solo lugar.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <nav className={styles.footerCol} aria-label="Explorar">
              <p className={styles.footerTitle}>Explora</p>
              <a href="#chat">Búsqueda por chat</a>
              <a href="#pipeline">Pipeline de candidatos</a>
              <a href="#roles">Para quién es</a>
            </nav>
          </Reveal>

          <Reveal delay={200}>
            <nav className={styles.footerCol} aria-label="Únete">
              <p className={styles.footerTitle}>Únete</p>
              <Link href="/register/company">Registrar empresa</Link>
              <Link href="/register/candidate">Crear perfil de candidato</Link>
            </nav>
          </Reveal>
        </div>

        <div className={styles.footerBottom}>
          <p className={styles.caption}>© 2026 Semillero · Hecho en Colombia</p>
          <a href="#inicio" className={styles.backTop}>
            Volver arriba <span aria-hidden="true">↑</span>
          </a>
        </div>
      </footer>

      <Mascot />
    </div>
  );
}
