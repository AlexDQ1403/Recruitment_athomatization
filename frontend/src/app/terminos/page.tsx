import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalLayout, type LegalSection } from '../../components/legal/LegalLayout';
import { LEGAL, responsablesText } from '../../lib/legal';

export const metadata: Metadata = {
  title: 'Términos y Condiciones — Kmella',
  description: 'Reglas de uso de Kmella para empresas, reclutadores y personas que buscan empleo.',
};

const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

const sections: LegalSection[] = [
  {
    id: 'quienes',
    title: 'Quiénes somos y aceptación',
    body: (
      <>
        <p>
          {LEGAL.brand} ({LEGAL.site}) es una plataforma operada por <strong>{responsablesText()}</strong>, personas naturales con
          domicilio en {LEGAL.domicile}. Contacto: {mail}.
        </p>
        <p>
          Al crear una cuenta o usar la plataforma aceptas estos Términos y la{' '}
          <Link href="/privacidad">Política de Tratamiento de Datos Personales</Link>. Este acuerdo se celebra por medios
          electrónicos y tiene plena validez conforme a la Ley 527 de 1999. Si no estás de acuerdo, no uses el servicio.
        </p>
      </>
    ),
  },
  {
    id: 'servicio',
    title: 'Qué ofrece Kmella',
    body: (
      <>
        <ul>
          <li><strong>Empresas y reclutadores:</strong> búsqueda de candidatos con inteligencia artificial, publicación de vacantes, seguimiento por etapas, decisiones de la empresa y reportes.</li>
          <li><strong>Personas que buscan empleo:</strong> perfil a partir de la hoja de vida, recomendaciones de vacantes con porcentaje de ajuste, consejos para la hoja de vida, ofertas de otros sitios web y seguimiento de postulaciones.</li>
        </ul>
        <p>
          {LEGAL.brand} es una herramienta de apoyo a la búsqueda y preselección. <strong>No es una agencia de empleo, no es parte
          de la relación laboral</strong> entre empresas y candidatos y no garantiza que una persona sea contratada ni que una
          vacante sea cubierta. Las decisiones de contratación, las pruebas, entrevistas y condiciones del empleo son
          responsabilidad exclusiva de cada empresa.
        </p>
        <p>
          El servicio se ofrece actualmente de forma gratuita y «tal como está». Podemos mejorarlo, cambiarlo o suspenderlo,
          avisando con antelación razonable cuando afecte tus datos o tu cuenta.
        </p>
      </>
    ),
  },
  {
    id: 'cuentas',
    title: 'Cuentas',
    body: (
      <ul>
        <li>Debes ser mayor de 18 años y dar información veraz y actualizada.</li>
        <li>Eres responsable de guardar tu contraseña y de lo que se haga con tu cuenta. Avísanos si sospechas un uso no autorizado.</li>
        <li>La cuenta de empresa la crea su representante o una persona autorizada por ella. La empresa responde por los reclutadores que invite y puede retirarles el acceso.</li>
        <li>Puedes dejar de usar el servicio y pedir la eliminación de tu cuenta en cualquier momento escribiendo a {mail}.</li>
      </ul>
    ),
  },
  {
    id: 'empresas',
    title: 'Compromisos de empresas y reclutadores',
    body: (
      <>
        <p>Al usar {LEGAL.brand} para reclutar, la empresa y sus reclutadores se comprometen a:</p>
        <ul>
          <li>Publicar solo vacantes reales, lícitas y con información veraz sobre el cargo y sus condiciones.</li>
          <li>No discriminar por sexo, raza, origen nacional o familiar, lengua, religión, opinión política o filosófica, orientación sexual, discapacidad, edad u otra condición (Ley 1482 de 2011 y Ley 1752 de 2015).</li>
          <li>No cobrar a los candidatos por postularse ni por participar en un proceso de selección.</li>
          <li>Usar los datos de los candidatos solo para el proceso de selección para el que los obtuvieron, actuando como responsables de ese tratamiento y respetando la Ley 1581 de 2012.</li>
          <li>Contactar a las personas de forma respetuosa, identificándose y respetando su decisión de no seguir en el proceso.</li>
          <li>No descargar, copiar ni reutilizar masivamente la información de la plataforma fuera de ella.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'candidatos',
    title: 'Compromisos de las personas que buscan empleo',
    body: (
      <ul>
        <li>Subir información propia, cierta y que tengas derecho a compartir.</li>
        <li>Revisar lo que la inteligencia artificial llene en tu perfil antes de guardarlo: tú eres responsable de su contenido.</li>
        <li>Entender que el porcentaje de ajuste y los consejos son orientaciones automáticas, no una evaluación definitiva.</li>
        <li>Las ofertas de otros sitios web se muestran como referencia: al abrirlas sales de {LEGAL.brand} y aplican las condiciones de ese sitio. No controlamos ni respondemos por su contenido o veracidad.</li>
      </ul>
    ),
  },
  {
    id: 'prohibido',
    title: 'Usos prohibidos',
    body: (
      <ul>
        <li>Publicar contenido falso, engañoso, ofensivo, discriminatorio o ilegal.</li>
        <li>Suplantar a otra persona o empresa.</li>
        <li>Usar la plataforma para enviar publicidad no solicitada o para fines distintos a la búsqueda de empleo y talento.</li>
        <li>Intentar acceder a datos de otras empresas o cuentas, vulnerar la seguridad o automatizar el uso sin autorización.</li>
        <li>Manipular el asistente de inteligencia artificial para que revele información o actúe fuera de su propósito.</li>
      </ul>
    ),
  },
  {
    id: 'ia',
    title: 'Inteligencia artificial',
    body: (
      <p>
        Las respuestas, perfiles, vacantes y porcentajes generados con IA pueden contener errores u omisiones. Son una ayuda para
        decidir, no una decisión. Verifica la información importante antes de actuar con base en ella.
      </p>
    ),
  },
  {
    id: 'propiedad',
    title: 'Propiedad intelectual',
    body: (
      <p>
        La marca {LEGAL.brand}, su logo, el personaje Semi, el diseño y el software de la plataforma pertenecen a sus creadores. Los
        contenidos que subas (hoja de vida, vacantes) siguen siendo tuyos; nos das permiso de usarlos solo para prestarte el
        servicio.
      </p>
    ),
  },
  {
    id: 'responsabilidad',
    title: 'Responsabilidad',
    body: (
      <>
        <p>
          Trabajamos para que la plataforma esté disponible y sea segura, pero puede tener interrupciones (por ejemplo, el
          servidor puede tardar unos segundos en responder tras un tiempo sin uso). En la medida permitida por la ley, no
          respondemos por decisiones de contratación, por la información que publiquen empresas o candidatos, ni por el contenido
          de sitios externos.
        </p>
        <p>
          Nada de lo anterior limita los derechos que te reconoce el Estatuto del Consumidor (Ley 1480 de 2011) cuando te sea
          aplicable.
        </p>
      </>
    ),
  },
  {
    id: 'suspension',
    title: 'Suspensión de cuentas',
    body: (
      <p>
        Podemos suspender o cerrar cuentas que incumplan estos Términos o la ley, informando el motivo. Si crees que fue un error,
        escríbenos a {mail}.
      </p>
    ),
  },
  {
    id: 'pqrs',
    title: 'Peticiones, quejas y reclamos',
    body: (
      <p>
        Atendemos peticiones, quejas, reclamos y sugerencias en {mail}. Las solicitudes sobre tus datos personales siguen el
        procedimiento y los plazos de la <Link href="/privacidad#procedimiento">Política de Tratamiento de Datos</Link>.
      </p>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios, ley aplicable y vigencia',
    body: (
      <p>
        Podemos actualizar estos Términos; los cambios importantes te los informaremos y te pediremos aceptarlos de nuevo al
        ingresar. Estos Términos se rigen por las leyes de la República de Colombia y cualquier controversia se resolverá ante
        los jueces competentes de Colombia. Versión {LEGAL.version}, vigente desde el {LEGAL.effectiveDate}.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Términos y Condiciones de uso"
      intro={
        <p>
          Estas son las reglas para usar {LEGAL.brand}. Te pedimos leerlas: explican qué hace la plataforma, qué no hace y qué
          esperamos de quienes la usan.
        </p>
      }
      sections={sections}
    />
  );
}
