import Link from 'next/link';
import { CANDIDATE_FEATURES, COMPANY_FEATURES, FeatureList, JobSearchMock } from './Audience';
import { ChatDemo } from './ChatDemo';
import { Constellation } from './Constellation';
import { NavActions } from './NavActions';
import { Logo } from './Logo';
import { Mascot } from './Mascot';
import { MobileMenu } from './MobileMenu';
import { MotionToggle } from './MotionToggle';
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
            <a href="#empresas" className={styles.navLink}>Para empresas</a>
            <a href="#candidatos" className={styles.navLink}>Para candidatos</a>
            <a href="#pipeline" className={styles.navLink}>Cómo funciona</a>
          </nav>
          <div className={styles.navActions}>
            <MotionToggle />
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
                Kmella une a las empresas que buscan talento con las personas que
                buscan empleo. Las empresas encuentran candidatos escribiendo lo que
                necesitan; los candidatos suben su hoja de vida y ven primero las
                vacantes que más se ajustan a ellos.
              </p>
            </Reveal>
            <Reveal delay={620}>
              <div className={styles.ctaRow}>
                <Link href="/register/company" className={styles.pill}>Soy empresa</Link>
                <Link href="/register/candidate" className={styles.pillGhost}>Busco empleo</Link>
                <Link href="/login" className={styles.textLink}>Ya tengo cuenta</Link>
              </div>
            </Reveal>
          </div>
          <div className={styles.heroVisual}>
            <Constellation className={styles.canvas} captionClassName={styles.shapeCaption} />
          </div>
        </section>

        {/* ─── Para empresas y reclutadores ─────────────── */}
        <section id="empresas" className={styles.section}>
          <Reveal>
            <p className={styles.eyebrow}>Para empresas y reclutadores</p>
            <h2 className={styles.headingLg}>Encuentra, contacta y decide en un solo lugar.</h2>
          </Reveal>
          <FeatureList items={COMPANY_FEATURES} />
        </section>

        {/* ─── Búsqueda por chat ────────────────────────── */}
        <section id="chat" className={`${styles.split} ${styles.reverse}`}>
          <div className={styles.splitText}>
            <Reveal>
              <h2 className={styles.headingLg}>Sin filtros ni casillas.</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className={styles.body}>
                Una frase basta. La búsqueda entiende cargo, ciudad, años de
                experiencia y salario, y ordena los perfiles por afinidad. Desde el
                mismo resultado contactas por WhatsApp, correo o LinkedIn con un
                mensaje ya redactado, y cada búsqueda queda en tu historial.
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
                El reclutador contacta y presenta a cada candidato para una vacante;
                la empresa decide quién pasa a la siguiente fase y deja el motivo. El
                dashboard muestra qué hacer hoy y dónde se pierden candidatos.
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

        {/* ─── Para quienes buscan empleo ───────────────── */}
        <section id="candidatos" className={styles.split}>
          <div className={styles.splitText}>
            <Reveal>
              <p className={styles.eyebrow}>Para quienes buscan empleo</p>
              <h2 className={styles.headingLg}>Tu búsqueda de empleo, en orden.</h2>
            </Reveal>
            <FeatureList items={CANDIDATE_FEATURES} />
            <Reveal delay={320}>
              <div className={styles.ctaRow}>
                <Link href="/register/candidate" className={styles.pill}>Crear mi perfil</Link>
              </div>
            </Reveal>
          </div>
          <JobSearchMock />
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
                minutos. Si buscas empleo, sube tu hoja de vida: verás qué vacantes
                encajan contigo y cómo ajustar tu HV para cada una.
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
              Reclutamiento con IA para empresas, reclutadores y personas que
              buscan empleo en Colombia.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <nav className={styles.footerCol} aria-label="Explorar">
              <p className={styles.footerTitle}>Producto</p>
              <a href="#empresas">Para empresas</a>
              <a href="#candidatos">Para candidatos</a>
              <a href="#pipeline">Cómo funciona</a>
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
