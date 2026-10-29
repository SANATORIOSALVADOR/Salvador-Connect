import { useState } from "react";
import { Copy, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { GRUPOS, LEVEL_COLOR, LEVEL_LABEL, modulosDe } from "@/lib/permisos";
import { AccesosEditor } from "./AccesosEditor";
import { accesosDePerfil, api, type Accesos, type Perfil } from "./api";
import type { Datos, Nav } from "./Configuracion";
import { ResumenAccesos } from "./Resumen";
import { Avatar, Cabecera, ICONO_MODULO, MUTED, Panel, Tabs, Vacio } from "./ui";

// Perfiles (roles): un conjunto de accesos que se asigna a varias personas. Si el perfil cambia, todas se actualizan.

type Props = { datos: Datos; recargar: () => Promise<void>; nav: Nav };

export function Perfiles({ datos, recargar, nav }: Props) {
  const { perfiles, personas } = datos;
  const abierto = nav.param("id");
  const perfil = perfiles.find((p) => String(p.id) === abierto) ?? null;
  const duplicarDe = perfiles.find((p) => String(p.id) === nav.param("duplicar")) ?? null;

  return (
    <>
      <Cabecera
        titulo="Perfiles"
        texto="Un perfil arma de una vez qué módulos ve una persona, con qué nivel y sobre qué sectores (ej. «Encargado de sector», «Administrativo»). Las personas con ese perfil se actualizan solas cuando lo cambiás."
        acciones={
          <button type="button" className="btn btn-primary" onClick={() => nav.ir("perfiles", { id: "nuevo" })}>
            <Plus size={16} /> Nuevo perfil
          </button>
        }
      />
      {perfiles.length === 0 ? (
        <Vacio titulo="Todavía no hay perfiles" texto="Creá uno por cada puesto (ej. Encargado de sector) y asignáselo a las personas: así no armás los permisos a mano cada vez." accion={<button type="button" className="btn btn-primary" onClick={() => nav.ir("perfiles", { id: "nuevo" })}><Plus size={15} /> Crear el primero</button>} />
      ) : (
        <div className="cfg-perfiles">
          {perfiles.map((p) => {
            const gente = personas.filter((x) => x.perfilId === p.id && x.active);
            return (
              <button key={p.id} type="button" className="cfg-perfil-card" onClick={() => nav.ir("perfiles", { id: p.id })}>
                <div className="cfg-perfil-cab">
                  <span className="cfg-perfil-ico" aria-hidden="true"><ShieldCheck size={18} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong>{p.nombre}</strong>
                    {p.descripcion && <span style={{ ...MUTED, display: "block" }}>{p.descripcion}</span>}
                  </div>
                </div>
                <div className="cfg-perfil-mods">
                  {GRUPOS.flatMap((g) => modulosDe(g.key))
                    .filter((m) => p.permisos[m.key])
                    .map((m) => {
                      const Icono = ICONO_MODULO[m.key];
                      const n = p.permisos[m.key];
                      return (
                        <span key={m.key} className="cfg-perfil-mod" style={{ background: LEVEL_COLOR[n].bg, color: LEVEL_COLOR[n].fg }} title={`${m.label}: ${LEVEL_LABEL[n]}`}>
                          {Icono && <Icono size={13} />} {m.label}
                        </span>
                      );
                    })}
                  {!Object.keys(p.permisos).length && <span style={MUTED}>Sin módulos</span>}
                </div>
                <div className="cfg-perfil-pie">
                  <span className="cfg-avatares">
                    {gente.slice(0, 5).map((x) => <Avatar key={x.id} nombre={x.name} tam={24} />)}
                  </span>
                  <span style={MUTED}>{p.usuarios ? `${p.usuarios} persona${p.usuarios === 1 ? "" : "s"}` : "Nadie todavía"}</span>
                  {p.sinSectores.length > 0 && <span className="cfg-aviso" title={p.sinSectores.join(", ")}>{p.sinSectores.length} sin sectores elegidos</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {(perfil || abierto === "nuevo") && <EditorPerfil key={abierto ?? ""} perfil={perfil} base={duplicarDe} datos={datos} recargar={recargar} nav={nav} />}
    </>
  );
}

function EditorPerfil({ perfil, base, datos, recargar, nav }: { perfil: Perfil | null; base: Perfil | null; datos: Datos; recargar: () => Promise<void>; nav: Nav }) {
  const origen = perfil ?? base;
  const [nombre, setNombre] = useState(perfil?.nombre ?? (base ? `${base.nombre} (copia)` : ""));
  const [descripcion, setDescripcion] = useState(origen?.descripcion ?? "");
  const [a, setA] = useState<Accesos>(() => accesosDePerfil(origen));
  const [tab, setTab] = useState<"accesos" | "resumen" | "personas">("accesos");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const gente = perfil ? datos.personas.filter((x) => x.perfilId === perfil.id) : [];
  const inicial = JSON.stringify({ n: perfil?.nombre ?? "", d: perfil?.descripcion ?? "", a: accesosDePerfil(perfil) });
  const sucio = !perfil || JSON.stringify({ n: nombre, d: descripcion, a }) !== inicial;

  const cerrar = async () => {
    if (perfil && sucio && !(await confirmar({ titulo: "Hay cambios sin guardar", mensaje: "Si cerrás, se pierden.", accion: "Cerrar sin guardar", peligro: true }))) return;
    nav.ir("perfiles");
  };

  const guardar = async () => {
    setError(null);
    if (nombre.trim().length < 2) return setError("Poné un nombre al perfil.");
    if (perfil && gente.length && !(await confirmar({ titulo: `¿Guardar el perfil ${perfil.nombre}?`, mensaje: `Se aplica a ${gente.length} persona${gente.length === 1 ? "" : "s"} (salvo en sus excepciones).`, accion: "Guardar y aplicar" }))) return;
    setGuardando(true);
    try {
      const body = { nombre: nombre.trim(), descripcion: descripcion.trim(), permisos: a.permisos, alcances: Object.fromEntries(Object.entries(a.scopes).filter(([k]) => a.permisos[k]).map(([k, s]) => [k, s.alcance])), acciones: Object.fromEntries(Object.entries(a.acciones).filter(([k]) => a.permisos[k])) };
      const p = perfil ? await api<Perfil>(`/users/perfiles/${perfil.id}`, { method: "PATCH", body }) : await api<Perfil>("/users/perfiles", { method: "POST", body });
      await recargar();
      avisar(perfil ? `Perfil guardado${p.usuarios ? `: se aplicó a ${p.usuarios} persona${p.usuarios === 1 ? "" : "s"}` : ""}.` : "Perfil creado. Ya se lo podés asignar a las personas.");
      nav.ir("perfiles", { id: p.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!perfil) return;
    const msg = perfil.usuarios ? `Las ${perfil.usuarios} personas con este perfil conservan los accesos que tienen hoy, pero quedan «a medida» (ya no se actualizan).` : "Nadie tiene este perfil.";
    if (!(await confirmar({ titulo: `¿Eliminar el perfil ${perfil.nombre}?`, mensaje: msg, accion: "Eliminar", peligro: true }))) return;
    try {
      await api(`/users/perfiles/${perfil.id}`, { method: "DELETE" });
      avisar("Perfil eliminado.");
      nav.ir("perfiles");
      await recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  return (
    <Panel
      onClose={() => void cerrar()}
      ancho={860}
      titulo={perfil ? `Perfil: ${perfil.nombre}` : base ? `Nuevo perfil (copia de ${base.nombre})` : "Nuevo perfil"}
      sub={
        perfil && (
          <div className="cfg-ficha-acciones">
            <button type="button" className="btn btn-quiet" onClick={() => nav.ir("perfiles", { id: "nuevo", duplicar: perfil.id })}><Copy size={15} /> Duplicar</button>
            <button type="button" className="btn btn-quiet" style={{ color: "#b91c1c" }} onClick={() => void eliminar()}><Trash2 size={15} /> Eliminar</button>
          </div>
        )
      }
      pie={
        sucio ? (
          <>
            {perfil && gente.length > 0 && <span className="cfg-sin-guardar">Se aplica a {gente.length} persona{gente.length === 1 ? "" : "s"}</span>}
            <button type="button" className="btn btn-quiet" onClick={() => void cerrar()} disabled={guardando}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>{guardando ? "Guardando…" : perfil ? "Guardar perfil" : "Crear perfil"}</button>
          </>
        ) : undefined
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="cfg-form cfg-form-2">
        <label><span className="field-label">Nombre</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Ej.: Encargado de sector" autoFocus={!perfil} /></label>
        <label><span className="field-label">Para quién es (opcional)</span><input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={200} placeholder="Ej.: Jefes de servicio que cargan guardias de su sector" /></label>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "accesos", label: "Accesos" },
          { value: "resumen", label: "Qué puede hacer" },
          ...(perfil ? [{ value: "personas" as const, label: `Personas (${gente.length})` }] : []),
        ]}
      />
      {tab === "accesos" && <AccesosEditor valor={a} onChange={setA} modo="perfil" sectores={datos.sectores} desactivados={datos.modulos.desactivados} />}
      {tab === "resumen" && <ResumenAccesos accesos={a} sectores={datos.sectores} desactivados={datos.modulos.desactivados} modo="perfil" />}
      {tab === "personas" &&
        (gente.length === 0 ? (
          <div style={MUTED}>Nadie tiene este perfil. Se asigna desde la ficha de cada persona o seleccionando varias en Personas.</div>
        ) : (
          <div className="cfg-lista-personas">
            {gente.map((x) => (
              <button key={x.id} type="button" onClick={() => nav.ir("personas", { id: x.id })}>
                <Avatar nombre={x.name} tam={30} apagado={!x.active} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <strong>{x.name}</strong>
                  <span style={{ ...MUTED, display: "block" }}>@{x.username}{x.excepciones?.length ? ` · ${x.excepciones.length} excepción${x.excepciones.length === 1 ? "" : "es"}` : ""}{x.active ? "" : " · inactiva"}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
    </Panel>
  );
}
