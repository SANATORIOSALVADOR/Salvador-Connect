import { useMemo, useState } from "react";
import { FileSpreadsheet, Search } from "lucide-react";
import { GRUPOS, LEVEL_COLOR, LEVEL_LABEL, modulosDe } from "@/lib/permisos";
import { scopesDe } from "./api";
import type { Datos, Nav } from "./Configuracion";
import { Avatar, CHIP_PERFIL, CHIP_SA, Cabecera, Chip, ICONO_MODULO, MUTED } from "./ui";

// Matriz de accesos (revisión de accesos): personas × módulos, para ver de un vistazo quién tiene qué.

type Props = { datos: Datos; recargar: () => Promise<void>; nav: Nav };

export function Matriz({ datos, nav }: Props) {
  const { personas, perfiles, sectores } = datos;
  const [q, setQ] = useState("");
  const [perfilF, setPerfilF] = useState("");
  const [inactivas, setInactivas] = useState(false);
  const grupos = GRUPOS.map((g) => ({ g, mods: modulosDe(g.key) })).filter((x) => x.mods.length);
  const mods = grupos.flatMap((x) => x.mods);
  const nombreSector = new Map(sectores.map((s) => [s.id, s.shortName || s.name]));

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return personas.filter(
      (p) =>
        (inactivas || p.active) &&
        (!perfilF || (perfilF === "none" ? p.role === "usuario" && !p.perfilId : perfilF === "sa" ? p.role === "superadmin" : String(p.perfilId) === perfilF)) &&
        (!t || `${p.name} ${p.username}`.toLowerCase().includes(t)),
    );
  }, [personas, q, perfilF, inactivas]);

  /** Texto de sectores de una celda (vacío = todos). */
  const sectoresDe = (p: (typeof personas)[number], mod: string) => {
    const sc = scopesDe(p)[mod];
    if (!sc || sc.alcance === "todos") return "";
    return sc.sectorIds.map((id) => nombreSector.get(id) ?? `#${id}`).join(", ") || "sin sectores";
  };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const filasX = filas.map((p) => {
      const o: Record<string, string> = { Persona: p.name, Usuario: p.username, Perfil: p.role === "superadmin" ? "Superadmin" : (p.perfilNombre ?? "A medida"), Estado: p.active ? "Activa" : "Inactiva" };
      for (const m of mods) {
        const n = p.role === "superadmin" ? "total" : p.permissions[m.key];
        const sec = p.role === "superadmin" ? "" : sectoresDe(p, m.key);
        o[m.label] = n ? `${LEVEL_LABEL[n]}${sec ? ` (${sec})` : ""}${p.excepciones?.includes(m.key) ? " *excepción" : ""}` : "";
      }
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(filasX);
    ws["!cols"] = Object.keys(filasX[0] ?? { a: 1 }).map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Accesos");
    XLSX.writeFile(wb, `matriz-accesos-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
  };

  return (
    <>
      <Cabecera
        titulo="Matriz de accesos"
        texto="Quién tiene acceso a qué, en una sola tabla. Sirve para revisar periódicamente que cada persona tenga solo lo que necesita."
        acciones={<button type="button" className="btn btn-quiet" onClick={() => void exportar()} disabled={!filas.length}><FileSpreadsheet size={15} /> Exportar a Excel</button>}
      />
      <div className="cfg-toolbar">
        <div className="cfg-buscar">
          <Search size={15} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar persona" aria-label="Buscar persona" />
        </div>
        <select value={perfilF} onChange={(e) => setPerfilF(e.target.value)} aria-label="Filtrar por perfil">
          <option value="">Todos los perfiles</option>
          {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          <option value="none">Sin perfil (a medida)</option>
          <option value="sa">Superadmin</option>
        </select>
        <label className="cfg-check"><input type="checkbox" checked={inactivas} onChange={(e) => setInactivas(e.target.checked)} /> Incluir inactivas</label>
      </div>
      <div className="cfg-tabla-wrap">
        <table className="cfg-matriz">
          <thead>
            <tr>
              <th rowSpan={2} className="cfg-matriz-persona">Persona</th>
              {grupos.map(({ g, mods }) => <th key={g.key} colSpan={mods.length} className="cfg-matriz-grupo">{g.label}</th>)}
            </tr>
            <tr>
              {mods.map((m) => {
                const Icono = ICONO_MODULO[m.key];
                return (
                  <th key={m.key} className="cfg-matriz-mod" title={m.label}>
                    {Icono && <Icono size={15} />}
                    <span>{m.label}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.id} className={p.active ? "" : "apagada"}>
                <td className="cfg-matriz-persona">
                  <button type="button" onClick={() => nav.ir("personas", { id: p.id, tab: "accesos" })}>
                    <Avatar nombre={p.name} tam={26} apagado={!p.active} />
                    <span style={{ minWidth: 0 }}>
                      <strong>{p.name}</strong>
                      <span className="cfg-matriz-perfil">{p.role === "superadmin" ? <Chip {...CHIP_SA}>Superadmin</Chip> : p.perfilNombre ? <Chip {...CHIP_PERFIL}>{p.perfilNombre}</Chip> : <span style={MUTED}>A medida</span>}</span>
                    </span>
                  </button>
                </td>
                {mods.map((m) => {
                  if (p.role === "superadmin") return <td key={m.key} className="cfg-celda"><span className="cfg-celda-n" style={{ background: CHIP_SA.bg, color: CHIP_SA.fg }}>Todo</span></td>;
                  const n = p.permissions[m.key];
                  if (!n) return <td key={m.key} className="cfg-celda"><span className="cfg-celda-no" aria-label="Sin acceso">·</span></td>;
                  const sec = sectoresDe(p, m.key);
                  const exc = p.excepciones?.includes(m.key);
                  return (
                    <td key={m.key} className="cfg-celda" title={`${m.label}: ${LEVEL_LABEL[n]}${sec ? ` · sectores: ${sec}` : ""}${exc ? " · excepción a su perfil" : ""}`}>
                      <span className="cfg-celda-n" style={{ background: LEVEL_COLOR[n].bg, color: LEVEL_COLOR[n].fg }}>
                        {{ ver: "Ver", editar: "Carga", total: "Total" }[n]}
                        {exc && <i className="cfg-celda-exc" aria-label="excepción" />}
                      </span>
                      {sec && <span className="cfg-celda-sec">{sec}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cfg-leyenda">
        {(["ver", "editar", "total"] as const).map((l) => <span key={l}><i style={{ background: LEVEL_COLOR[l].fg }} /> {LEVEL_LABEL[l]}</span>)}
        <span><i className="cfg-celda-exc" style={{ position: "static" }} /> Excepción a su perfil</span>
        <span>· Debajo del nivel: los sectores (si no dice nada, todos). Tocá una persona para cambiar sus accesos.</span>
      </div>
    </>
  );
}
