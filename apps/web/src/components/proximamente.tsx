import type { ComponentType } from "react";
import { Compass, Lightbulb, MessageSquareText } from "lucide-react";

/**
 * Pantalla de los módulos que todavía se están planificando (Inventario, Instructivos, Liquidación).
 * El código anterior de cada módulo sigue en pages/; para volver a habilitarlo se cambia la ruta en App.tsx
 * y se saca el módulo de MODULOS_PROXIMAMENTE.
 */
export const MODULOS_PROXIMAMENTE = ["/instructivos", "/liquidacion"];

type Props = {
  titulo: string;
  icono: ComponentType<{ size?: number; strokeWidth?: number }>;
  resumen: string;
  ideas: string[];
};

export function Proximamente({ titulo, icono: Icono, resumen, ideas }: Props) {
  return (
    <main className="content-wrap prox">
      <div className="prox-hero">
        <div className="prox-icono" aria-hidden="true">
          <span className="prox-orbita" />
          <Icono size={34} strokeWidth={1.8} />
        </div>
        <div className="prox-chip"><span aria-hidden="true" />Próximamente</div>
        <h1 className="prox-titulo">{titulo}</h1>
        <p className="prox-resumen">{resumen}</p>
      </div>

      <div className="prox-grid">
        <section className="card prox-card">
          <div className="prox-card-cab"><Compass size={18} aria-hidden="true" /><h2>En planificación</h2></div>
          <p>El área de Sistemas está definiendo qué va a hacer este módulo junto con las áreas que lo van a usar. Cuando esté listo va a aparecer acá, sin que tengas que hacer nada.</p>
          <ol className="prox-pasos" aria-label="Etapas">
            <li className="hecho">Idea</li>
            <li className="actual">Planificación</li>
            <li>Desarrollo</li>
            <li>Disponible</li>
          </ol>
        </section>
        <section className="card prox-card">
          <div className="prox-card-cab"><Lightbulb size={18} aria-hidden="true" /><h2>Lo que se está evaluando</h2></div>
          <ul className="prox-ideas">
            {ideas.map((i) => <li key={i}>{i}</li>)}
          </ul>
        </section>
        <section className="card prox-card prox-ancha">
          <div className="prox-card-cab"><MessageSquareText size={18} aria-hidden="true" /><h2>¿Qué te gustaría que haga?</h2></div>
          <p>Si tu área necesita algo puntual de este módulo, contáselo al <strong>área de Sistemas</strong>: las ideas de quienes lo van a usar se tienen en cuenta en la planificación.</p>
        </section>
      </div>
    </main>
  );
}
