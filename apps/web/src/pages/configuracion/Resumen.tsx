import { ALCANCE_LABEL, GRUPOS, modulosDe } from "@/lib/permisos";
import { accionesEfectivas, esExcepcion, etiquetaAccion, fechaAr, type Accesos, type Perfil, type Sector } from "./api";
import { CHIP_EXCEPCION, CHIP_PERFIL, Chip, ICONO_MODULO, MUTED, NivelChip } from "./ui";

// «Qué puede hacer»: los permisos efectivos explicados en lenguaje simple, con de dónde sale cada uno.

export function ResumenAccesos({ accesos, perfil, sectores, desactivados, superadmin, modo = "persona" }: { accesos: Accesos; perfil?: Perfil | null; sectores: Sector[]; desactivados: string[]; superadmin?: boolean; modo?: "persona" | "perfil" }) {
  if (superadmin)
    return (
      <div className="cfg-resumen-sa">
        <strong>Superadmin: acceso total.</strong> Ve y hace todo en todos los módulos y sectores, y administra Configuración (personas, perfiles, sectores, módulos y apariencia).
      </div>
    );
  const nombre = new Map(sectores.map((s) => [s.id, s.name]));
  const grupos = GRUPOS.map((g) => ({ g, mods: modulosDe(g.key).filter((m) => accesos.permisos[m.key]) })).filter((x) => x.mods.length);
  if (!grupos.length) return <div style={MUTED}>No tiene acceso a ningún módulo.</div>;
  return (
    <div className="cfg-resumen">
      {grupos.map(({ g, mods }) => (
        <section key={g.key}>
          <div className="cfg-grupo-cab"><span>{g.label}</span></div>
          {mods.map((m) => {
            const nivel = accesos.permisos[m.key];
            const Icono = ICONO_MODULO[m.key];
            const sc = accesos.scopes[m.key];
            const acciones = accionesEfectivas(m.key, nivel, accesos.acciones[m.key]);
            const exc = modo === "persona" && perfil ? esExcepcion(m.key, accesos, perfil) : false;
            const venc = accesos.vencimientos[m.key];
            return (
              <div key={m.key} className="cfg-resumen-mod">
                <span className="cfg-mod-ico" aria-hidden="true">{Icono && <Icono size={16} />}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="cfg-mod-nombre">
                    {m.label} <NivelChip nivel={nivel} />
                    {modo === "persona" && (perfil ? exc ? <Chip {...CHIP_EXCEPCION}>Excepción</Chip> : <Chip {...CHIP_PERFIL}>Por su perfil</Chip> : null)}
                    {venc && <Chip bg="hsl(40 90% 90%)" fg="hsl(35 70% 30%)">Hasta el {fechaAr(venc)}</Chip>}
                    {desactivados.includes(m.key) && <Chip bg="hsl(var(--muted))" fg="hsl(var(--muted-foreground))">Módulo desactivado</Chip>}
                  </div>
                  {m.sectores && (
                    <div className="cfg-resumen-linea">
                      <strong>Sectores:</strong>{" "}
                      {!sc || sc.alcance === "todos"
                        ? "todos"
                        : modo === "perfil"
                          ? `${ALCANCE_LABEL[sc.alcance].toLowerCase()} (se eligen en cada persona)`
                          : sc.sectorIds.length
                            ? `${sc.sectorIds.map((id) => nombre.get(id) ?? `#${id}`).join(", ")} — ${sc.alcance === "sector" ? "solo ve esos" : "ve todos, trabaja en esos"}`
                            : <span style={{ color: "hsl(0 60% 40%)" }}>ninguno elegido (no ve nada)</span>}
                    </div>
                  )}
                  <ul className="cfg-resumen-acciones">
                    {acciones.map((k) => <li key={k}>{etiquetaAccion(m.key, k)}</li>)}
                  </ul>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
