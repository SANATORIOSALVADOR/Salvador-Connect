import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { ACCIONES, GRUPOS, modulosDe, type Level } from "@/lib/permisos";
import { api, type EstadoModulos } from "./api";
import type { Datos, Nav } from "./Configuracion";
import { Cabecera, Chip, ICONO_MODULO, MUTED, NivelChip } from "./ui";

// Módulos del sistema: cómo están agrupados en el menú, si están activos, quién tiene acceso y qué acciones tiene cada uno.

type Props = { datos: Datos; recargar: () => Promise<void>; nav: Nav };

export function Modulos({ datos, recargar, nav }: Props) {
  const { personas, perfiles, modulos } = datos;
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const activas = personas.filter((p) => p.active && p.role === "usuario");

  const cambiar = async (key: string, label: string, activo: boolean) => {
    if (
      !activo &&
      !(await confirmar({
        titulo: `¿Desactivar ${label}?`,
        mensaje: "Desaparece del menú de todos y nadie (salvo superadmin) puede usarlo. Los datos y los permisos de cada persona se conservan: al activarlo vuelve todo como estaba.",
        accion: "Desactivar",
        peligro: true,
      }))
    )
      return;
    setOcupado(key);
    try {
      await api<EstadoModulos>(`/modulos/${key}`, { method: "PUT", body: { activo } });
      avisar(activo ? `${label} activado.` : `${label} desactivado para todos.`);
      await recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <>
      <Cabecera
        titulo="Módulos"
        texto="Los módulos del sistema agrupados como en el menú. Desde acá se puede desactivar un módulo para todos (por ejemplo, mientras se prepara) sin tocar los permisos de cada persona."
      />
      <div className="cfg-pila">
        {GRUPOS.map((g) => (
          <section key={g.key} className="cfg-mod-grupo">
            <div className="cfg-grupo-cab">
              <span>{g.label}</span>
              <span style={MUTED}>{g.ayuda}</span>
            </div>
            <div className="cfg-mod-cards">
              {modulosDe(g.key).map((m) => {
                const Icono = ICONO_MODULO[m.key];
                const off = modulos.desactivados.includes(m.key);
                const fijo = modulos.noDesactivables.includes(m.key);
                const proximamente = g.key === "proximamente";
                const porNivel = (["ver", "editar", "total"] as Level[]).map((l) => ({ l, n: activas.filter((p) => p.permissions[m.key] === l).length }));
                const total = porNivel.reduce((s, x) => s + x.n, 0);
                const enPerfiles = perfiles.filter((p) => p.permisos[m.key]);
                const ver = abierto === m.key;
                return (
                  <article key={m.key} className={`cfg-mod-card${off ? " off" : ""}`}>
                    <div className="cfg-mod-card-cab">
                      <span className="cfg-mod-ico grande" aria-hidden="true">{Icono && <Icono size={20} />}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong>{m.label}</strong>
                        <span style={{ ...MUTED, display: "block" }}>{m.descripcion}</span>
                      </div>
                      {proximamente ? (
                        <Chip bg="hsl(40 90% 90%)" fg="hsl(35 70% 30%)">Próximamente</Chip>
                      ) : fijo ? (
                        <Chip bg="hsl(155 55% 88%)" fg="hsl(155 60% 24%)" title="Inicio siempre está activo">Siempre activo</Chip>
                      ) : (
                        <label className="cfg-switch" title={off ? "Desactivado: tocá para activarlo" : "Activo: tocá para desactivarlo"}>
                          <input type="checkbox" checked={!off} disabled={ocupado === m.key} onChange={(e) => void cambiar(m.key, m.label, e.target.checked)} />
                          <span aria-hidden="true" />
                          {off ? "Desactivado" : "Activo"}
                        </label>
                      )}
                    </div>
                    <div className="cfg-mod-card-datos">
                      <div>
                        <span className="field-label">Personas con acceso</span>
                        <div className="cfg-mod-niveles">
                          {total === 0 ? <span style={MUTED}>Nadie (además de superadmin)</span> : porNivel.filter((x) => x.n).map((x) => <span key={x.l}><NivelChip nivel={x.l} /> {x.n}</span>)}
                        </div>
                      </div>
                      <div>
                        <span className="field-label">En perfiles</span>
                        <div style={{ fontSize: 13 }}>{enPerfiles.length ? enPerfiles.map((p) => p.nombre).join(", ") : <span style={MUTED}>Ninguno</span>}</div>
                      </div>
                      {m.sectores && <div><span className="field-label">Por sector</span><div style={{ fontSize: 13 }}>Se puede limitar a sectores</div></div>}
                    </div>
                    <div className="cfg-mod-card-pie">
                      <button type="button" className="cfg-link" onClick={() => setAbierto(ver ? null : m.key)} aria-expanded={ver}>
                        {ver ? "Ocultar" : "Ver"} niveles y acciones <ChevronDown size={13} style={{ transform: ver ? "rotate(180deg)" : undefined }} />
                      </button>
                      {total > 0 && <button type="button" className="cfg-link" onClick={() => nav.ir("personas", { modulo: m.key })}>Ver quiénes</button>}
                    </div>
                    {ver && (
                      <div className="cfg-mod-card-detalle">
                        {m.levels.map((l) => (
                          <div key={l} className="cfg-mod-nivel">
                            <NivelChip nivel={l} />
                            <div>
                              <div style={{ fontSize: 13 }}>{m.can[l]}</div>
                              <ul className="cfg-resumen-acciones">
                                {(ACCIONES[m.key] ?? []).filter((a) => a.nivel === l).map((a) => <li key={a.key}>{a.label}</li>)}
                              </ul>
                            </div>
                          </div>
                        ))}
                        <p style={{ ...MUTED, margin: 0 }}>Cada nivel incluye lo del anterior. A una persona o perfil se le pueden sumar o quitar acciones sueltas («a medida»).</p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
