import { Download, ExternalLink, ScrollText } from 'lucide-react'
import './Reglamento.css'

const PDF_URL = '/docs/reglamento-oficial-torneo-dobles-2026-vertical.pdf'

export default function Reglamento() {
  return (
    <div className='reglamento-page animate-fade-up'>
      <section className='reglamento-toolbar' aria-label='Acciones del reglamento'>
        <div className='reglamento-toolbar-info'>
          <span className='reglamento-toolbar-badge' aria-hidden='true'>
            <ScrollText size={20} />
          </span>
          <div>
            <h1 className='font-bold text-base sm:text-lg' style={{ color: 'var(--text-primary)' }}>
              Reglamento Oficial · Torneo Abierto de Dobles 2026
            </h1>
            <p className='text-xs' style={{ color: 'var(--text-muted)' }}>
              Edición vertical oficial · Subcomité de Tenis del Club Unión Bucaramanga
            </p>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2 w-full sm:w-auto'>
          <a
            href={PDF_URL}
            target='_blank'
            rel='noreferrer'
            className='btn-secondary flex-1 sm:flex-initial justify-center text-xs px-4 py-2'
          >
            <ExternalLink size={15} />
            Abrir PDF
          </a>
          <a
            href={PDF_URL}
            download='REGLAMENTO_OFICIAL_TORNEO_DOBLES_2026_CLUB_UNION_VERTICAL.pdf'
            className='btn-primary flex-1 sm:flex-initial justify-center text-xs px-4 py-2'
          >
            <Download size={15} />
            Descargar PDF vertical
          </a>
        </div>
      </section>

      <article className='reglamento-sheet' aria-label='Estatuto Técnico y Reglamento Oficial de Competencia'>
        <div className='reglamento-watermark' aria-hidden='true' />

        <div className='reglamento-content'>
          {/* Encabezado Institucional */}
          <header className='reglamento-header'>
            <div className='reglamento-brand-left'>
              <img
                src='/branding/legal-branding.png'
                alt='Legal Branding'
                className='reglamento-legal-logo'
              />
            </div>

            <div className='reglamento-title-block'>
              <p className='reglamento-kicker'>
                Club Unión Bucaramanga · Subcomité de Tenis
              </p>
              <h2 className='reglamento-main-title'>
                TORNEO ABIERTO DE DOBLES 2026
              </h2>
              <p className='reglamento-subtitle'>
                Estatuto Técnico y Reglamento Oficial de Competencia
              </p>
            </div>

            <div className='reglamento-crests' aria-label='Escudos institucionales'>
              <img
                src='/branding/logo-tenis-club-union.png'
                alt='Corporación Club Unión Tennis 1917'
              />
              <img
                src='/branding/escudo-club-union.png'
                alt='Escudo Club Unión Bucaramanga'
                className='reglamento-crest-center'
              />
              <img
                src='/branding/subcomite-tenis-club-union.png'
                alt='Subcomité de Tenis Club Unión'
              />
            </div>
          </header>

          <div className='reglamento-divider' aria-hidden='true'>
            <span className='reglamento-divider-diamond' />
          </div>

          {/* CAPÍTULO I */}
          <section className='reglamento-chapter'>
            <div className='reglamento-chapter-header'>
              <h3 className='reglamento-chapter-title'>
                CAPÍTULO I — DISPOSICIONES GENERALES
              </h3>
              <span className='reglamento-chapter-tag'>Régimen Institucional</span>
            </div>

            <p className='reglamento-article'>
              <strong className='reglamento-article-lead'>Artículo 1°. Normatividad aplicable.</strong>{' '}
              El certamen se regulará bajo los estatutos de la{' '}
              <strong>Federación Colombiana de Tenis (FCT)</strong>, su Código de Conducta y
              Régimen Disciplinario, en concurrencia con los reglamentos internos del Subcomité de
              Tenis del Club Unión de Bucaramanga.
            </p>

            <p className='reglamento-article'>
              <strong className='reglamento-article-lead'>Artículo 2°. Categorías habilitadas.</strong>{' '}
              Podrán inscribirse parejas en las siguientes divisiones oficiales:{' '}
              <strong>
                Intermedia, Segunda (2da), Tercera (3ra), Cuarta (4ta), Quinta (5ta), Damas
                Principiantes y Damas Novatas.
              </strong>
            </p>

            <div className='reglamento-grid-2'>
              <p className='reglamento-article'>
                <strong className='reglamento-article-lead'>Artículo 3°. Inscripción y aval.</strong>{' '}
                Toda pareja formalizará su postulación sujeta a{' '}
                <strong>verificación técnica</strong> por parte del Consejo Evaluador del torneo.
              </p>
              <p className='reglamento-article'>
                <strong className='reglamento-article-lead'>Artículo 4°. Pago reglamentario.</strong>{' '}
                El valor total de la inscripción deberá encontrarse debidamente cancelado previo a
                la disputa del primer encuentro oficial.
              </p>
              <p className='reglamento-article'>
                <strong className='reglamento-article-lead'>Artículo 5°. No devoluciones.</strong>{' '}
                Una vez realizado el sorteo o iniciado cualquier partido del cuadro,{' '}
                <strong>no habrá lugar a devolución o reembolso</strong> de dinero bajo concepto
                alguno.
              </p>
              <p className='reglamento-article'>
                <strong className='reglamento-article-lead'>
                  Artículo 6°. Conformación inalterable.
                </strong>{' '}
                Las parejas registradas tienen carácter definitivo e inamovible.{' '}
                <strong>No se autorizará sustitución ni cambio de integrantes</strong> durante el
                desarrollo del certamen.
              </p>
            </div>

            <div className='reglamento-callout'>
              <strong className='reglamento-article-lead'>
                Artículo 7°. Materiales y costos auxiliares.
              </strong>{' '}
              Cada pareja aportará un (1) tubo de pelotas reglamentarias nuevas por confrontación.
              Los honorarios de juzgamiento arbitral y servicios de caddie serán asumidos en cuotas
              iguales por ambas parejas contendientes.
            </div>
          </section>

          {/* CAPÍTULO II */}
          <section className='reglamento-chapter'>
            <div className='reglamento-chapter-header'>
              <h3 className='reglamento-chapter-title'>
                CAPÍTULO II — VERIFICACIÓN DE NIVEL Y PARIDAD TÉCNICA
              </h3>
              <span className='reglamento-chapter-tag'>Garantía Estatutaria</span>
            </div>

            <p className='reglamento-article'>
              <strong className='reglamento-article-lead'>
                Artículo 8°. Inscripción en categoría inferior al nivel real comprobado.
              </strong>{' '}
              En observancia del principio de equidad deportiva y juego limpio, la pareja detectada
              con un nivel tenístico manifiestamente superior al de su categoría formalizada se
              someterá al siguiente procedimiento reglado:
            </p>

            <div className='reglamento-cards-2'>
              <div className='reglamento-box reglamento-box-green'>
                <h4 className='reglamento-box-title'>1. Reubicación Ordinaria</h4>
                <p>
                  El Comité de Verificación técnica evaluará el caso de oficio o por reclamo
                  fundado, procediendo a{' '}
                  <strong>reubicar a la pareja en su categoría correspondiente</strong> sin costo
                  adicional, condicionado a la disponibilidad de cupos en los cuadros.
                </p>
              </div>

              <div className='reglamento-box reglamento-box-danger'>
                <h4 className='reglamento-box-title'>2. Descalificación y Expulsión</h4>
                <p>
                  De encontrarse los cuadros cerrados al 100% o ante desacuerdo manifiesto, se
                  decretará la{' '}
                  <strong>
                    descalificación inmediata y retiro definitivo de la pareja. En este evento no
                    operará restitución económica de la inscripción.
                  </strong>
                </p>
              </div>
            </div>
          </section>

          {/* CAPÍTULO III */}
          <section className='reglamento-chapter'>
            <div className='reglamento-chapter-header'>
              <h3 className='reglamento-chapter-title'>CAPÍTULO III — SISTEMA DE JUEGO</h3>
              <span className='reglamento-chapter-tag'>Formato Oficial</span>
            </div>

            <div className='reglamento-cards-2'>
              <div className='reglamento-box'>
                <h4 className='reglamento-box-title'>Artículo 9°. Fase de Grupos</h4>
                <p>
                  Se disputará por sistema de <strong>todos contra todos (round robin)</strong>. Los
                  partidos se jugarán al mejor de{' '}
                  <strong>dos de tres sets completos con ventaja</strong>; ante igualdad a un set,
                  la definición se librará mediante <strong>Match Tiebreak a diez (10) puntos</strong>{' '}
                  con diferencia de dos.
                </p>
              </div>

              <div className='reglamento-box'>
                <h4 className='reglamento-box-title'>Artículo 10°. Fase Eliminatoria</h4>
                <p>
                  Avanzarán al cuadro de honor el{' '}
                  <strong>primero (1°) y segundo (2°) clasificado de cada grupo</strong>, integrando
                  el cuadro principal de eliminación directa tradicional hasta definir a los
                  campeones y subcampeones del certamen.
                </p>
              </div>
            </div>
          </section>

          {/* CAPÍTULO IV */}
          <section className='reglamento-chapter'>
            <div className='reglamento-chapter-header'>
              <h3 className='reglamento-chapter-title'>
                CAPÍTULO IV — CRITERIOS DE DESEMPATE EN FASE DE GRUPOS
              </h3>
              <span className='reglamento-chapter-tag'>Directriz FCT</span>
            </div>

            <div className='reglamento-cards-2'>
              <div className='reglamento-box'>
                <h4 className='reglamento-box-title'>Art. 11°. Empate entre dos parejas</h4>
                <p>
                  Si dos parejas igualan en partidos ganados dentro de su grupo, la posición se
                  dirimirá de forma exclusiva por el{' '}
                  <strong>resultado del enfrentamiento directo sostenido entre ambas</strong>{' '}
                  (ganador cara a cara).
                </p>
              </div>

              <div className='reglamento-box'>
                <h4 className='reglamento-box-title'>
                  Art. 12°. Empate entre tres o más parejas
                </h4>
                <ol className='reglamento-list'>
                  <li>
                    Mayor porcentaje de <strong>puntos ganados</strong> sobre puntos jugados.
                  </li>
                  <li>
                    Mayor porcentaje de <strong>sets ganados</strong> sobre sets jugados.
                  </li>
                  <li>
                    Mayor porcentaje de <strong>games ganados</strong> sobre games jugados.
                  </li>
                  <li>
                    Si la igualdad persiste, se recurrirá a <strong>sorteo público</strong> formal.
                  </li>
                </ol>
              </div>
            </div>
          </section>

          {/* CAPÍTULO V */}
          <section className='reglamento-chapter'>
            <div className='reglamento-chapter-header'>
              <h3 className='reglamento-chapter-title'>
                CAPÍTULO V — PROGRAMACIÓN OFICIAL Y HORARIOS
              </h3>
              <span className='reglamento-chapter-tag'>Disciplina de Juego</span>
            </div>

            <div className='reglamento-schedule-layout'>
              <div className='reglamento-schedule-stack'>
                <p className='reglamento-article'>
                  <strong className='reglamento-article-lead'>Artículo 13°. Publicación.</strong> La
                  programación oficial será fijada y publicada con{' '}
                  <strong>dos (2) días de antelación</strong>.
                </p>
                <p className='reglamento-article'>
                  <strong className='reglamento-article-lead'>
                    Artículo 14°. Tolerancia reglamentaria.
                  </strong>{' '}
                  El tiempo de espera en cancha es de{' '}
                  <strong>quince (15) minutos improrrogables</strong>. Transcurrido dicho plazo, se
                  declarará el <strong>Walkover (W/O)</strong>.
                </p>
                <p className='reglamento-article'>
                  <strong className='reglamento-article-lead'>
                    Artículo 15°. Reprogramaciones.
                  </strong>{' '}
                  La potestad de reprogramación reside exclusivamente en el{' '}
                  <strong>Comité Organizador</strong> en coordinación con el Juez Árbitro.
                </p>
              </div>

              <div className='reglamento-table-card'>
                <h4 className='reglamento-box-title'>Artículo 16°. Jornadas Oficiales de Juego</h4>
                <table className='reglamento-table' aria-label='Jornadas oficiales de juego'>
                  <thead>
                    <tr>
                      <th>Día / Jornada</th>
                      <th>Hora oficial de inicio</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Martes a Viernes</td>
                      <td>A partir de las 6:00 PM</td>
                    </tr>
                    <tr>
                      <td>Sábados</td>
                      <td>A partir de las 11:00 AM</td>
                    </tr>
                    <tr>
                      <td>Domingos y Festivos</td>
                      <td>A partir de las 8:00 AM</td>
                    </tr>
                  </tbody>
                </table>
                <p className='reglamento-table-note'>
                  * No se autoriza la disputa de partidos en días u horarios diferentes, salvo
                  fuerza mayor debidamente calificada.
                </p>
              </div>
            </div>

            <div className='reglamento-cards-2'>
              <div className='reglamento-box'>
                <p>
                  <strong className='reglamento-article-lead'>
                    Artículo 17°. Asignación de campos.
                  </strong>{' '}
                  Se dispondrá de las <strong>canchas 1 y 2</strong> (sábados en la tarde se
                  habilitarán 3 campos). La categoría de mayor jerarquía tendrá preferencia en el
                  Campo 1.
                </p>
              </div>
              <div className='reglamento-box'>
                <p>
                  <strong className='reglamento-article-lead'>
                    Artículo 18°. Firmeza de partidos.
                  </strong>{' '}
                  La organización <strong>no suspenderá ni postergará</strong> ningún encuentro que
                  haya sido confirmado dentro de las 24 horas previas.
                </p>
              </div>
            </div>
          </section>

          {/* CAPÍTULO VI */}
          <section className='reglamento-chapter'>
            <div className='reglamento-chapter-header'>
              <h3 className='reglamento-chapter-title' style={{ color: 'var(--reg-danger)' }}>
                CAPÍTULO VI — RÉGIMEN DISCIPLINARIO Y FACULTADES
              </h3>
              <span className='reglamento-chapter-tag' style={{ color: 'var(--reg-danger)' }}>
                Potestad Sancionatoria
              </span>
            </div>

            <div className='reglamento-disciplinary-box'>
              <strong className='reglamento-disciplinary-lead'>
                Artículo 19°. Facultad disciplinaria y de veto.
              </strong>{' '}
              El Comité Organizador y el Subcomité de Tenis del Club Unión tienen{' '}
              <strong>plena e inapelable potestad para sancionar, vetar o expulsar</strong> a
              deportistas o parejas que infrinjan el presente reglamento, vulneren el Código de
              Conducta de la FCT o atenten contra los principios éticos, la honorabilidad y las
              tradiciones del Club Unión de Bucaramanga.
            </div>
          </section>

          {/* Ratificación */}
          <section className='reglamento-ratification' aria-label='Ratificación oficial'>
            <h4 className='reglamento-ratification-title'>
              Ratificación y Promulgación Oficial · Subcomité de Tenis Club Unión
            </h4>
            <div className='reglamento-signatures'>
              <div className='reglamento-signature-col'>
                <strong>Juez Árbitro</strong>
                <span>Director Oficial del Torneo</span>
              </div>
              <div className='reglamento-signature-col'>
                <strong>Subcomité de Tenis</strong>
                <span>Club Unión Bucaramanga</span>
              </div>
              <div className='reglamento-signature-col'>
                <strong>Consejo Técnico</strong>
                <span>Comisión de Verificación</span>
              </div>
            </div>
          </section>

          <footer className='reglamento-footer'>
            <span>Club Unión Bucaramanga · Subcomité de Tenis · Torneo Abierto de Dobles 2026</span>
            <strong>DOCUMENTO OFICIAL VERTICAL</strong>
          </footer>
        </div>
      </article>
    </div>
  )
}
