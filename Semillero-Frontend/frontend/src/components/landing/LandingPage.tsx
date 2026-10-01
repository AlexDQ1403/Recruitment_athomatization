import Link from 'next/link';
import { ChatDemo } from './ChatDemo';
import { Constellation } from './Constellation';
import { NavActions } from './NavActions';
import { Logo } from './Logo';
import { Mascot } from './Mascot';
import { MobileMenu } from './MobileMenu';
import { PipelineStages } from './PipelineStages';
import { Reveal, SplitWords } from './Reveal';
import { RoleShowcase } from './RoleShowcase';
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
            <MobileMenu />
          </div>
        </div>
      </header>

      <main>
        {/* ─── Hero ─────────────────────────────────────── */}
        <section id="inicio" className={styles.hero}>
          <div className={styles.heroText}>
            <Reveal variant="words">
              <h1 className={styles.display}>
                <SplitWords text="Busca candidatos como le hablarías a un colega." />
              </h1>
            </Reveal>
            <Reveal delay={500}>
              <p className={styles.body}>
                Escribe «desarrolladora Python, tres años, Bogotá» y Kmella revisa tu
                base de candidatos por ti. Vacantes, postulaciones y tu equipo de
                reclutamiento quedan en el mismo lugar.
              </p>
            </Reveal>
            <Reveal delay={620}>
              <div className={styles.ctaRow}>
                <Link href="/register" className={styles.pill}>Crear cuenta</Link>
                <Link href="/login" className={styles.textLink}>Ya tengo cuenta</Link>
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
              <h2 className={styles.headingLg}>Sin filtros ni casillas.</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className={styles.body}>
                Una frase basta. La búsqueda entiende ciudad, años de experiencia y
                habilidades, te muestra los perfiles más cercanos y guarda cada
                consulta en tu historial para retomarla después.
              </p>
            </Reveal>
          </div>
          <ChatDemo />
        </section>

        {/* ─── Pipeline ─────────────────────────────────── */}
        <section id="pipeline" className={styles.split}>
          <div className={styles.splitText}>
            <Reveal>
              <h2 className={styles.headingLg}>Del primer mensaje a la decisión.</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className={styles.body}>
                Mueve a cada persona entre etapas desde la tabla o el tablero, deja
                notas y revisa quién cambió qué. El dashboard te dice cómo va el
                proceso sin abrir una hoja de cálculo.
              </p>
            </Reveal>
          </div>
          <PipelineStages />
        </section>

        {/* ─── Roles ────────────────────────────────────── */}
        <section id="roles" className={styles.section}>
          <Reveal>
            <h2 className={`${styles.headingLg} ${styles.rolesHeading}`}>Una entrada para cada quien.</h2>
          </Reveal>
          <RoleShowcase />
        </section>

        {/* ─── Cierre ───────────────────────────────────── */}
        <section id="empezar" className={`${styles.split} ${styles.closing}`}>
          <div className={styles.splitText}>
            <Reveal>
              <h2 className={styles.headingLg}>Empieza con una vacante o con tu hoja de vida.</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className={styles.body}>
                Las empresas crean su cuenta e invitan a sus reclutadores en pocos
                minutos. Si buscas empleo, sube tu hoja de vida y mira qué vacantes
                encajan contigo.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <div className={styles.ctaRow}>
                <Link href="/register/company" className={styles.pill}>Registrar mi empresa</Link>
                <Link href="/register/candidate" className={styles.textLink}>Crear mi perfil</Link>
              </div>
            </Reveal>
          </div>
          <Sprout />
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <Reveal className={styles.footerBrand}>
            <Logo height={44} variant="onred" />
            <p className={styles.bodyMuted}>
              Vacantes, candidatos y equipos de reclutamiento en un mismo lugar,
              con búsqueda en lenguaje natural.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <nav className={styles.footerCol} aria-label="Explorar">
              <p className={styles.footerTitle}>Producto</p>
              <a href="#chat">Búsqueda por chat</a>
              <a href="#pipeline">Pipeline de candidatos</a>
              <a href="#roles">Para quién es</a>
            </nav>
          </Reveal>

          <Reveal delay={200}>
            <nav className={styles.footerCol} aria-label="Únete">
              <p className={styles.footerTitle}>Cuentas</p>
              <Link href="/register/company">Registrar empresa</Link>
              <Link href="/register/candidate">Crear perfil de candidato</Link>
            </nav>
          </Reveal>
        </div>

        <div className={styles.footerBottom}>
          <p className={styles.caption}>© 2026 Kmella · Hecho en Colombia</p>
          <a href="#inicio" className={styles.backTop}>
            Volver arriba <span aria-hidden="true">↑</span>
          </a>
        </div>
      </footer>

      <Mascot />
    </div>
  );
}
