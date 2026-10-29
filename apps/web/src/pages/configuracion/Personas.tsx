import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Eye, KeyRound, Plus, Power, Search, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { avisar, confirmar } from "@/components/feedback";
import { GRUPOS, LEVEL_COLOR, LEVEL_LABEL, MODULES, modulosDe } from "@/lib/permisos";
import { Modal } from "../administracion/ui";
import { AccesosEditor } from "./AccesosEditor";
import {
  ESTADO_PERSONA,
  accesosDePerfil,
  accesosDePersona,
  api,
  aplicarPerfil,
  claveAleatoria,
  cuerpoPersona,
  diasHasta,
  esExcepcion,
  estadoDe,
  fechaAr,
  faltanSectores,
  hace,
  sugerirUsuario,
  type Accesos,
  type Movimiento,
  type Perfil,
  type Persona,
} from "./api";
import type { Datos, Nav } from "./Configuracion";
import { ResumenAccesos } from "./Resumen";
import { Avatar, CHIP_EXCEPCION, CHIP_PERFIL, CHIP_SA, Cabecera, Chip, ICONO_MODULO, MUTED, Panel, Tabs, Vacio } from "./ui";

type Props = { datos: Datos; recargar: () => Promise<void>; nav: Nav };
type Filtro = "activas" | "sin_perfil" | "superadmin" | "primer_acceso" | "vencen" | "inactivas" | "todas";

/** ¿Vence algo (la cuenta o un permiso) en los próximos 7 días, o ya venció un permiso? */
const vencePronto = (p: Persona) =>
  p.active && ((p.accesoHasta && diasHasta(p.accesoHasta) <= 7) || Object.values(p.vencimientos ?? {}).some((v) => diasHasta(v) <= 7) || (p.vencidos?.length ?? 0) > 0);

export function Personas({ datos, recargar, nav }: Props) {
  const { personas, perfiles, me } = datos;
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("activas");
  const [perfilF, setPerfilF] = useState("");
  const [moduloF, setModuloF] = useState(() => nav.param("modulo") ?? "");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [loteOcupado, setLoteOcupado] = useState(false);
  const [lotePerfil, setLotePerfil] = useState("");

  const abiertaId = Number(nav.param("id")) || null;
  const abierta = personas.find((p) => p.id === abiertaId) ?? null;
  const nueva = nav.param("nueva") === "1";

  const cuentas: Record<Filtro, number> = useMemo(
    () => ({
      activas: personas.filter((p) => p.active).length,
      sin_perfil: personas.filter((p) => p.active && p.role === "usuario" && !p.perfilId).length,
      superadmin: personas.filter((p) => p.active && p.role === "superadmin").length,
      primer_acceso: personas.filter((p) => p.active && p.mustChangePassword).length,
      vencen: personas.filter(vencePronto).length,
      inactivas: personas.filter((p) => !p.active).length,
      todas: personas.length,
    }),
    [personas],
  );

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return personas.filter((p) => {
      const okF =
        filtro === "todas" ||
        (filtro === "activas" && p.active) ||
        (filtro === "inactivas" && !p.active) ||
        (filtro === "sin_perfil" && p.active && p.role === "usuario" && !p.perfilId) ||
        (filtro === "superadmin" && p.active && p.role === "superadmin") ||
        (filtro === "primer_acceso" && p.active && p.mustChangePassword) ||
        (filtro === "vencen" && vencePronto(p));
      const okP = !perfilF || (perfilF === "none" ? p.role === "usuario" && !p.perfilId : perfilF === "sa" ? p.role === "superadmin" : String(p.perfilId) === perfilF);
      const okM = !moduloF || p.role === "superadmin" || Boolean(p.permissions[moduloF]);
      return okF && okP && okM && (!t || `${p.name} ${p.username} ${p.email ?? ""} ${p.perfilNombre ?? ""}`.toLowerCase().includes(t));
    });
  }, [personas, q, filtro, perfilF, moduloF]);

  useEffect(() => setSel(new Set()), [filtro, perfilF, moduloF, q]);
  const seleccionables = lista.filter((p) => p.id !== me.id);
  const todos = seleccionables.length > 0 && seleccionables.every((p) => sel.has(p.id));

  /** Aplica un cambio a todas las seleccionadas, de a una (cada una queda en el historial). */
  const enLote = async (titulo: string, cuerpo: Record<string, unknown>) => {
    const ids = [...sel];
    if (!ids.length) return;
    if (!(await confirmar({ titulo, mensaje: `Se aplica a ${ids.length} persona${ids.length === 1 ? "" : "s"}.`, accion: "Aplicar" }))) return;
    setLoteOcupado(true);
    const errores: string[] = [];
    for (const id of ids) {
      try {
        await api(`/users/${id}`, { method: "PATCH", body: cuerpo });
      } catch (e) {
        errores.push(`${personas.find((p) => p.id === id)?.name}: ${(e as Error).message}`);
      }
    }
    setLoteOcupado(false);
    setSel(new Set());
    await recargar();
    if (errores.length) avisar(`No se pudo en ${errores.length}: ${errores.join(" · ")}`, "error", 12000);
    else avisar(`Listo: ${ids.length} persona${ids.length === 1 ? "" : "s"} actualizada${ids.length === 1 ? "" : "s"}.`);
  };

  const FILTROS: { f: Filtro; label: string; alerta?: boolean }[] = [
    { f: "activas", label: "Activas" },
    { f: "sin_perfil", label: "Sin perfil" },
    { f: "superadmin", label: "Superadmin" },
    { f: "primer_acceso", label: "Primer acceso pendiente" },
    { f: "vencen", label: "Accesos por vencer", alerta: true },
    { f: "inactivas", label: "Inactivas" },
    { f: "todas", label: "Todas" },
  ];

  return (
    <>
      <Cabecera
        titulo="Personas"
        texto="Quién entra al sistema. Lo recomendable es darle a cada persona un perfil (ej. «Encargado de sector») y, si hace falta, alguna excepción puntual."
        acciones={
          <button type="button" className="btn btn-primary" onClick={() => nav.ir("personas", { nueva: 1 })}>
            <UserPlus size={16} /> Nueva persona
          </button>
        }
      />

      <div className="cfg-filtros-chips" role="tablist" aria-label="Filtrar personas">
        {FILTROS.map(({ f, label, alerta }) => (
          <button key={f} type="button" role="tab" aria-selected={filtro === f} className={`cfg-fchip${filtro === f ? " on" : ""}${alerta && cuentas[f] ? " alerta" : ""}`} onClick={() => setFiltro(f)}>
            {label} <span>{cuentas[f]}</span>
          </button>
        ))}
      </div>

      <div className="cfg-toolbar">
        <div className="cfg-buscar">
          <Search size={15} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, usuario, email o perfil" aria-label="Buscar personas" />
        </div>
        <select value={perfilF} onChange={(e) => setPerfilF(e.target.value)} aria-label="Filtrar por perfil">
          <option value="">Todos los perfiles</option>
          {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          <option value="none">Sin perfil (a medida)</option>
          <option value="sa">Superadmin</option>
        </select>
        <select value={moduloF} onChange={(e) => setModuloF(e.target.value)} aria-label="Filtrar por módulo">
          <option value="">Con acceso a cualquier módulo</option>
          {GRUPOS.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {modulosDe(g.key).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {sel.size > 0 && (
        <div className="cfg-lote" role="region" aria-label="Acciones en lote">
          <strong>{sel.size} seleccionada{sel.size === 1 ? "" : "s"}</strong>
          <span className="cfg-lote-sep" />
          <select value={lotePerfil} onChange={(e) => setLotePerfil(e.target.value)} aria-label="Perfil a asignar">
            <option value="">Asignar perfil…</option>
            {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button type="button" className="btn btn-quiet" disabled={!lotePerfil || loteOcupado} onClick={() => void enLote(`¿Asignar el perfil «${perfiles.find((p) => String(p.id) === lotePerfil)?.nombre}»?`, { perfilId: Number(lotePerfil), role: "usuario" })}>
            <ShieldCheck size={15} /> Asignar
          </button>
          <button type="button" className="btn btn-quiet" disabled={loteOcupado} onClick={() => void enLote("¿Desactivar a las personas seleccionadas?", { active: false })}>
            <Power size={15} /> Desactivar
          </button>
          <button type="button" className="btn btn-quiet" disabled={loteOcupado} onClick={() => void enLote("¿Activar a las personas seleccionadas?", { active: true })}>
            Activar
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setSel(new Set())} style={{ marginLeft: "auto" }}>
            Quitar selección
          </button>
        </div>
      )}

      {lista.length === 0 ? (
        <Vacio titulo="No hay personas con estos filtros" accion={<button type="button" className="btn btn-quiet" onClick={() => { setFiltro("todas"); setQ(""); setPerfilF(""); setModuloF(""); }}>Ver todas</button>} />
      ) : (
        <div className="cfg-tabla-wrap">
          <table className="cfg-tabla">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={todos} onChange={(e) => setSel(e.target.checked ? new Set(seleccionables.map((p) => p.id)) : new Set())} aria-label="Seleccionar todas" />
                </th>
                <th>Persona</th>
                <th>Perfil</th>
                <th>Módulos</th>
                <th>Último ingreso</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const est = ESTADO_PERSONA[estadoDe(p)];
                return (
                  <tr key={p.id} className={`cfg-fila${p.active ? "" : " apagada"}`} onClick={() => nav.ir("personas", { id: p.id })} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && nav.ir("personas", { id: p.id })}>
                    <td onClick={(e) => e.stopPropagation()}>
                      {p.id !== me.id && (
                        <input
                          type="checkbox"
                          checked={sel.has(p.id)}
                          onChange={(e) =>
                            setSel((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(p.id);
                              else n.delete(p.id);
                              return n;
                            })
                          }
                          aria-label={`Seleccionar a ${p.name}`}
                        />
                      )}
                    </td>
                    <td>
                      <div className="cfg-persona">
                        <Avatar nombre={p.name} apagado={!p.active} />
                        <div style={{ minWidth: 0 }}>
                          <div className="cfg-persona-nombre">{p.name}{p.id === me.id && <span style={MUTED}> (vos)</span>}</div>
                          <div style={MUTED}>@{p.username}{p.email ? ` · ${p.email}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td><PerfilCelda p={p} /></td>
                    <td><ModulosCelda p={p} desactivados={datos.modulos.desactivados} /></td>
                    <td style={{ whiteSpace: "nowrap", ...MUTED }}>{hace(p.lastLoginAt)}</td>
                    <td>
                      <Chip bg={est.bg} fg={est.fg}>{est.label}</Chip>
                      {p.active && p.accesoHasta && !p.accesoVencido && <div style={{ ...MUTED, marginTop: 3 }}>Hasta el {fechaAr(p.accesoHasta)}</div>}
                      {(p.vencidos?.length ?? 0) > 0 && <div style={{ fontSize: 11.5, marginTop: 3, color: "hsl(0 60% 40%)" }}>{p.vencidos!.length} permiso{p.vencidos!.length === 1 ? "" : "s"} vencido{p.vencidos!.length === 1 ? "" : "s"}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="cfg-leyenda">
        {(["ver", "editar", "total"] as const).map((l) => (
          <span key={l}><i style={{ background: LEVEL_COLOR[l].fg }} /> {LEVEL_LABEL[l]}</span>
        ))}
        <span>· Tocá una persona para ver qué puede hacer y cambiar sus accesos.</span>
      </div>

      {abierta && <Ficha key={abierta.id} persona={abierta} datos={datos} recargar={recargar} onClose={() => nav.ir("personas")} nav={nav} />}
      {nueva && <NuevaPersona datos={datos} recargar={recargar} onClose={() => nav.ir("personas")} onAbrir={(id) => nav.ir("personas", { id })} />}
    </>
  );
}

function PerfilCelda({ p }: { p: Persona }) {
  if (p.role === "superadmin") return <Chip {...CHIP_SA}>Superadmin</Chip>;
  const exc = p.excepciones?.length ?? 0;
  if (!p.perfilNombre) return <span style={MUTED}>A medida</span>;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      <Chip {...CHIP_PERFIL}>{p.perfilNombre}</Chip>
      {exc > 0 && <Chip {...CHIP_EXCEPCION} title={`Excepciones en: ${p.excepciones!.map((k) => MODULES.find((m) => m.key === k)?.label ?? k).join(", ")}`}>+{exc} excepción{exc === 1 ? "" : "es"}</Chip>}
    </span>
  );
}

/** Íconos de los módulos a los que tiene acceso, con el color de su nivel. */
function ModulosCelda({ p, desactivados }: { p: Persona; desactivados: string[] }) {
  if (p.role === "superadmin") return <span style={MUTED}>Todos</span>;
  const mods = MODULES.filter((m) => p.permissions[m.key] && m.key !== "dashboard");
  if (!mods.length) return <span style={MUTED}>Solo Inicio</span>;
  return (
    <div className="cfg-mods-iconos">
      {mods.map((m) => {
        const Icono = ICONO_MODULO[m.key];
        const n = p.permissions[m.key];
        return (
          <span key={m.key} className="cfg-mod-icono" style={{ background: LEVEL_COLOR[n].bg, color: LEVEL_COLOR[n].fg, opacity: desactivados.includes(m.key) ? 0.45 : 1 }} title={`${m.label}: ${LEVEL_LABEL[n]}`}>
            {Icono && <Icono size={14} />}
          </span>
        );
      })}
    </div>
  );
}

// =====================================================================
// Ficha de una persona
// =====================================================================

type DatosForm = { name: string; username: string; email: string; active: boolean; role: "superadmin" | "usuario"; accesoHasta: string; perfilId: number | null };
type Tab = "resumen" | "accesos" | "datos" | "actividad";

function Ficha({ persona, datos, recargar, onClose, nav }: { persona: Persona; datos: Datos; recargar: () => Promise<void>; onClose: () => void; nav: Nav }) {
  const { perfiles, sectores, me } = datos;
  const yo = persona.id === me.id;
  const inicialD: DatosForm = { name: persona.name, username: persona.username, email: persona.email ?? "", active: persona.active, role: persona.role, accesoHasta: persona.accesoHasta ?? "", perfilId: persona.perfilId ?? null };
  const inicialA = accesosDePersona(persona);
  const [d, setD] = useState<DatosForm>(inicialD);
  const [a, setA] = useState<Accesos>(inicialA);
  const [tab, setTab] = useState<Tab>((nav.param("tab") as Tab) || "resumen");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clave, setClave] = useState<string | null>(null);
  const [nuevoPerfil, setNuevoPerfil] = useState<string | null>(null);

  // Después de guardar (o de un cambio hecho desde otro lado), la ficha toma los datos nuevos.
  const firma = JSON.stringify(persona);
  useEffect(() => {
    setD(inicialD);
    setA(inicialA);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  const perfil = perfiles.find((p) => p.id === d.perfilId) ?? null;
  const sucio = JSON.stringify(d) !== JSON.stringify(inicialD) || JSON.stringify(a) !== JSON.stringify(inicialA);
  const excepciones = d.role === "usuario" && perfil ? MODULES.filter((m) => esExcepcion(m.key, a, perfil)).length : 0;

  const elegirPerfil = (id: number | null) => {
    const p = perfiles.find((x) => x.id === id) ?? null;
    setD({ ...d, perfilId: id });
    if (p) setA(aplicarPerfil(p, a));
  };

  const guardar = async () => {
    setError(null);
    if (!d.name.trim() || !d.username.trim()) return setError("Nombre y usuario son obligatorios.");
    const falta = d.role === "usuario" ? faltanSectores(a) : null;
    if (falta) {
      setTab("accesos");
      return setError(`${falta}: elegí al menos un sector o «Todos los sectores».`);
    }
    setGuardando(true);
    try {
      await api(`/users/${persona.id}`, { method: "PATCH", body: cuerpoPersona(d, a, perfil) });
      avisar("Cambios guardados. Se aplican en su próxima acción.");
      await recargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const cerrar = async () => {
    if (sucio && !(await confirmar({ titulo: "Hay cambios sin guardar", mensaje: "Si cerrás, se pierden.", accion: "Cerrar sin guardar", peligro: true }))) return;
    onClose();
  };

  const verComo = async () => {
    try {
      await api("/auth/ver-como", { method: "POST", body: { userId: persona.id } });
      window.location.href = "/dashboard";
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const activar = async () => {
    if (persona.active && !(await confirmar({ titulo: `¿Desactivar a ${persona.name}?`, mensaje: "No va a poder ingresar; se conserva todo su historial.", accion: "Desactivar", peligro: true }))) return;
    try {
      await api(`/users/${persona.id}`, { method: "PATCH", body: { active: !persona.active } });
      avisar(persona.active ? "Persona desactivada." : "Persona activada.");
      await recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const eliminar = async () => {
    if (!(await confirmar({ titulo: `¿Eliminar definitivamente a ${persona.name}?`, mensaje: "Si cargó registros, conviene desactivarla en su lugar.", accion: "Eliminar", peligro: true }))) return;
    try {
      await api(`/users/${persona.id}`, { method: "DELETE" });
      avisar("Persona eliminada.");
      onClose();
      await recargar();
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };
  const crearPerfil = async () => {
    if (!nuevoPerfil?.trim()) return;
    try {
      const p = await api<Perfil>("/users/perfiles", {
        method: "POST",
        body: { nombre: nuevoPerfil.trim(), descripcion: "", permisos: a.permisos, alcances: Object.fromEntries(Object.entries(a.scopes).map(([k, s]) => [k, s.alcance])), acciones: a.acciones },
      });
      await recargar();
      setD({ ...d, perfilId: p.id });
      setNuevoPerfil(null);
      avisar(`Perfil «${p.nombre}» creado. Guardá para vincularlo a ${persona.name.split(" ")[0]}.`);
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  };

  const est = ESTADO_PERSONA[estadoDe(persona)];
  return (
    <Panel
      onClose={() => void cerrar()}
      ancho={860}
      titulo={
        <div className="cfg-ficha-cab">
          <Avatar nombre={persona.name} tam={52} apagado={!persona.active} />
          <div style={{ minWidth: 0 }}>
            <h2 className="cfg-h2" style={{ margin: 0 }}>{persona.name}{yo && <span style={MUTED}> (vos)</span>}</h2>
            <div style={MUTED}>@{persona.username}{persona.email ? ` · ${persona.email}` : ""}</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
              <Chip bg={est.bg} fg={est.fg}>{est.label}</Chip>
              <PerfilCelda p={persona} />
            </div>
          </div>
        </div>
      }
      sub={
        <div className="cfg-ficha-acciones">
          {persona.role === "usuario" && persona.active && !yo && (
            <button type="button" className="btn btn-quiet" onClick={() => void verComo()} title="Navegar el sistema como esta persona (solo lectura)"><Eye size={15} /> Ver como</button>
          )}
          <button type="button" className="btn btn-quiet" onClick={() => setClave(claveAleatoria())}><KeyRound size={15} /> Restablecer clave</button>
          {!yo && <button type="button" className="btn btn-quiet" onClick={() => void activar()}><Power size={15} /> {persona.active ? "Desactivar" : "Activar"}</button>}
          {!yo && <button type="button" className="btn btn-quiet" style={{ color: "#b91c1c" }} onClick={() => void eliminar()}><Trash2 size={15} /> Eliminar</button>}
        </div>
      }
      pie={
        sucio ? (
          <>
            <span className="cfg-sin-guardar">Cambios sin guardar</span>
            <button type="button" className="btn btn-quiet" onClick={() => { setD(inicialD); setA(inicialA); setError(null); }} disabled={guardando}>Descartar</button>
            <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
          </>
        ) : undefined
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "resumen", label: "Qué puede hacer" },
          { value: "accesos", label: <>Accesos{excepciones > 0 && <span className="cfg-tab-n">{excepciones}</span>}</> },
          { value: "datos", label: "Datos de la cuenta" },
          { value: "actividad", label: "Actividad" },
        ]}
      />
      {error && <div className="form-error" role="alert">{error}</div>}

      {tab === "resumen" && (
        <>
          {sucio && <div className="cfg-aviso-info">Vista previa con los cambios sin guardar.</div>}
          {d.role === "usuario" && perfil && (
            <p style={{ ...MUTED, margin: "0 0 10px" }}>
              Tiene el perfil <strong>{perfil.nombre}</strong>{excepciones ? ` con ${excepciones} excepción${excepciones === 1 ? "" : "es"}` : ""}. Si el perfil cambia, se actualiza solo.
            </p>
          )}
          {d.accesoHasta && <p style={{ ...MUTED, margin: "0 0 10px" }}>Puede entrar hasta el {fechaAr(d.accesoHasta)}.</p>}
          <ResumenAccesos accesos={a} perfil={perfil} sectores={sectores} desactivados={datos.modulos.desactivados} superadmin={d.role === "superadmin"} />
        </>
      )}

      {tab === "accesos" && (
        <div className="cfg-pila">
          <div>
            <div className="cfg-bloque-tit">Tipo de cuenta</div>
            <div className="cfg-opciones">
              {(
                [
                  ["usuario", "Usuario", "Ve solo los módulos que le des, con el nivel que elijas."],
                  ["superadmin", "Superadmin", "Acceso total y administra Configuración. Reservalo para Sistemas."],
                ] as const
              ).map(([v, t, txt]) => (
                <button key={v} type="button" className={`cfg-opcion${d.role === v ? " on" : ""}`} disabled={yo} onClick={() => setD({ ...d, role: v })} aria-pressed={d.role === v}>
                  <strong>{t}</strong>
                  <span>{txt}</span>
                </button>
              ))}
            </div>
          </div>
          {d.role === "usuario" && (
            <>
              <div>
                <div className="cfg-bloque-tit">Perfil</div>
                <div className="cfg-opciones">
                  {perfiles.map((p) => (
                    <button key={p.id} type="button" className={`cfg-opcion${d.perfilId === p.id ? " on" : ""}`} onClick={() => elegirPerfil(p.id)} aria-pressed={d.perfilId === p.id}>
                      <strong>{p.nombre}</strong>
                      <span>{p.descripcion || `${Object.keys(p.permisos).length} módulo${Object.keys(p.permisos).length === 1 ? "" : "s"}`} · {p.usuarios} persona{p.usuarios === 1 ? "" : "s"}</span>
                    </button>
                  ))}
                  <button type="button" className={`cfg-opcion${d.perfilId === null ? " on" : ""}`} onClick={() => elegirPerfil(null)} aria-pressed={d.perfilId === null}>
                    <strong>Sin perfil</strong>
                    <span>Accesos armados a mano solo para esta persona.</span>
                  </button>
                </div>
                {d.perfilId === null &&
                  (nuevoPerfil === null ? (
                    <button type="button" className="cfg-link" style={{ marginTop: 8 }} onClick={() => setNuevoPerfil("")}>
                      <Plus size={13} /> Guardar estos accesos como un perfil nuevo (para reusarlos con otras personas)
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <input autoFocus value={nuevoPerfil} onChange={(e) => setNuevoPerfil(e.target.value)} placeholder="Nombre del perfil (ej. Encargado de sector)" style={{ flex: "1 1 240px" }} />
                      <button type="button" className="btn btn-primary" disabled={nuevoPerfil.trim().length < 2} onClick={() => void crearPerfil()}>Crear perfil</button>
                      <button type="button" className="btn btn-quiet" onClick={() => setNuevoPerfil(null)}>Cancelar</button>
                    </div>
                  ))}
                {perfil && <p style={{ ...MUTED, margin: "8px 0 0" }}>Lo que cambies abajo queda como <strong>excepción</strong> solo para esta persona; el resto se actualiza con el perfil.</p>}
              </div>
              <AccesosEditor valor={a} onChange={setA} modo="persona" perfil={perfil} sectores={sectores} desactivados={datos.modulos.desactivados} />
            </>
          )}
        </div>
      )}

      {tab === "datos" && (
        <div className="cfg-form">
          <label><span className="field-label">Nombre y apellido</span><input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
          <label><span className="field-label">Usuario para ingresar</span><input value={d.username} onChange={(e) => setD({ ...d, username: e.target.value })} /></label>
          <label><span className="field-label">Email (opcional)</span><input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
          <label>
            <span className="field-label">Puede entrar hasta (opcional)</span>
            <input type="date" value={d.accesoHasta} disabled={yo} onChange={(e) => setD({ ...d, accesoHasta: e.target.value })} />
            <span className="field-hint">Para reemplazos o temporarios: desde el día siguiente no puede entrar. Vacío = sin vencimiento.</span>
          </label>
          <label className="cfg-check">
            <input type="checkbox" checked={d.active} disabled={yo} onChange={(e) => setD({ ...d, active: e.target.checked })} />
            Cuenta activa
          </label>
          {persona.legacyRole && <p style={MUTED}>Tenía el rol anterior «{persona.legacyRole}»; al guardar pasa a permisos por módulo.</p>}
        </div>
      )}

      {tab === "actividad" && <Actividad persona={persona} />}

      {clave !== null && <ClaveModal persona={persona} clave={clave} setClave={setClave} onClose={() => setClave(null)} onListo={recargar} />}
    </Panel>
  );
}

function Actividad({ persona }: { persona: Persona }) {
  const [movs, setMovs] = useState<Movimiento[] | null>(null);
  useEffect(() => {
    api<Movimiento[]>(`/users/historial?limit=100&userId=${persona.id}`).then(setMovs).catch(() => setMovs([]));
  }, [persona.id]);
  return (
    <div className="cfg-pila">
      <div className="cfg-datos-grid">
        <div><span className="field-label">Último ingreso</span><div>{hace(persona.lastLoginAt)}</div></div>
        <div><span className="field-label">Cuenta creada</span><div>{new Date(persona.createdAt).toLocaleDateString("es-AR")}</div></div>
        <div><span className="field-label">Clave</span><div>{persona.mustChangePassword ? "Tiene que cambiarla al entrar" : "Elegida por la persona"}</div></div>
      </div>
      <div>
        <div className="cfg-bloque-tit">Cambios de accesos</div>
        {movs === null ? <div className="skeleton" style={{ height: 80 }} /> : movs.length === 0 ? <div style={MUTED}>Sin movimientos.</div> : <ListaMovimientos movs={movs} />}
      </div>
    </div>
  );
}

export function ListaMovimientos({ movs, mostrarPersona }: { movs: Movimiento[]; mostrarPersona?: boolean }) {
  const TIPO: Record<string, string> = { alta: "Alta", cambio: "Cambio", baja: "Baja", clave: "Clave", ver_como: "Ver como", perfil_alta: "Perfil nuevo", perfil_cambio: "Perfil", perfil_baja: "Perfil eliminado", modulo: "Módulo" };
  return (
    <ol className="cfg-tl">
      {movs.map((m) => (
        <li key={m.id}>
          <span className={`cfg-tl-dot t-${m.accion}`} aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div>
              <strong>{TIPO[m.accion] ?? m.accion}</strong>
              {mostrarPersona && (m.userNombre || m.perfilNombre) && <> · {m.userNombre || m.perfilNombre}</>}
              <span style={{ ...MUTED, marginLeft: 6 }}>por {m.actorNombre || "el sistema"} · {new Date(m.createdAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</span>
            </div>
            {m.detalle && (
              <ul className="cfg-tl-detalle">
                {m.detalle.split(" · ").filter(Boolean).map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ClaveModal({ persona, clave, setClave, onClose, onListo }: { persona: Persona; clave: string; setClave: (v: string) => void; onClose: () => void; onListo: () => Promise<void> }) {
  const [hecho, setHecho] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restablecer = async () => {
    try {
      await api(`/users/${persona.id}/reset-password`, { method: "POST", body: { password: clave } });
      setHecho(true);
      await onListo();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal titulo={`Restablecer clave · @${persona.username}`} onClose={onClose} ancho={460} pie={hecho ? <button type="button" className="btn btn-primary" onClick={onClose}>Listo</button> : <><button type="button" className="btn btn-quiet" onClick={onClose}>Cancelar</button><button type="button" className="btn btn-primary" disabled={clave.length < 6} onClick={() => void restablecer()}>Restablecer</button></>}>
      {error && <div className="form-error">{error}</div>}
      {hecho ? (
        <Credenciales usuario={persona.username} clave={clave} nota="Se cerraron sus sesiones abiertas. Al entrar tiene que elegir una clave nueva." />
      ) : (
        <div className="cfg-pila">
          <p style={{ ...MUTED, margin: 0 }}>Se cierran sus sesiones abiertas y al entrar tiene que elegir una clave nueva.</p>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={clave} onChange={(e) => setClave(e.target.value)} style={{ fontFamily: "ui-monospace, monospace", flex: 1 }} aria-label="Clave provisoria" />
            <button type="button" className="btn btn-quiet" onClick={() => setClave(claveAleatoria())}>Generar otra</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Tarjeta con usuario y clave provisoria, con botón para copiar y entregarla. */
function Credenciales({ usuario, clave, nota }: { usuario: string; clave: string; nota?: string }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Sistema del Sanatorio del Salvador\nUsuario: ${usuario}\nClave provisoria: ${clave}\n(al entrar te va a pedir que elijas una clave nueva)`;
  return (
    <div className="cfg-credenciales">
      <div><span>Usuario</span><code>{usuario}</code></div>
      <div><span>Clave provisoria</span><code>{clave}</code></div>
      {nota && <p style={{ ...MUTED, margin: 0 }}>{nota}</p>}
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => {
          void navigator.clipboard?.writeText(texto).then(() => setCopiado(true), () => undefined);
        }}
      >
        {copiado ? <Check size={15} /> : <Copy size={15} />} {copiado ? "Copiado" : "Copiar para entregar"}
      </button>
    </div>
  );
}

// =====================================================================
// Alta guiada
// =====================================================================

type Modo = "perfil" | "medida" | "superadmin";

function NuevaPersona({ datos, recargar, onClose, onAbrir }: { datos: Datos; recargar: () => Promise<void>; onClose: () => void; onAbrir: (id: number) => void }) {
  const { perfiles, sectores } = datos;
  const [paso, setPaso] = useState(1);
  const [d, setD] = useState({ name: "", username: "", email: "", accesoHasta: "" });
  const [userTocado, setUserTocado] = useState(false);
  const [clave, setClave] = useState(claveAleatoria);
  const [modo, setModo] = useState<Modo>(perfiles.length ? "perfil" : "medida");
  const [perfilId, setPerfilId] = useState<number | null>(perfiles[0]?.id ?? null);
  const [a, setA] = useState<Accesos>(() => accesosDePerfil(perfiles[0] ?? null));
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [creada, setCreada] = useState<Persona | null>(null);

  const perfil = modo === "perfil" ? (perfiles.find((p) => p.id === perfilId) ?? null) : null;
  const existe = datos.personas.some((p) => p.username === d.username.trim().toLowerCase());

  const siguiente = () => {
    setError(null);
    if (paso === 1) {
      if (d.name.trim().length < 2) return setError("Escribí el nombre y apellido.");
      if (!/^[a-z0-9._-]{2,}$/.test(d.username.trim())) return setError("El usuario tiene que tener al menos 2 caracteres: letras minúsculas, números, punto o guion.");
      if (existe) return setError(`El usuario «${d.username}» ya existe.`);
      if (clave.length < 6) return setError("La clave provisoria tiene que tener al menos 6 caracteres.");
    }
    if (paso === 2 && modo !== "superadmin") {
      if (modo === "perfil" && !perfil) return setError("Elegí un perfil.");
      const falta = faltanSectores(a);
      if (falta) return setError(`${falta}: elegí al menos un sector.`);
    }
    setPaso(paso + 1);
  };

  const crear = async () => {
    setCreando(true);
    setError(null);
    try {
      const body = { ...cuerpoPersona({ ...d, active: true, role: modo === "superadmin" ? "superadmin" : "usuario", perfilId: perfil?.id ?? null }, a, perfil), password: clave };
      const p = await api<Persona>("/users", { method: "POST", body });
      setCreada(p);
      await recargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreando(false);
    }
  };

  const PASOS = ["Datos", "Acceso", "Confirmar"];
  return (
    <Panel
      onClose={onClose}
      ancho={820}
      titulo="Nueva persona"
      sub={
        !creada && (
          <ol className="cfg-pasos">
            {PASOS.map((t, i) => (
              <li key={t} className={paso === i + 1 ? "on" : paso > i + 1 ? "hecho" : ""}>
                <span>{paso > i + 1 ? <Check size={12} /> : i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        )
      }
      pie={
        creada ? (
          <>
            <button type="button" className="btn btn-quiet" onClick={onClose}>Cerrar</button>
            <button type="button" className="btn btn-primary" onClick={() => onAbrir(creada.id)}>Abrir su ficha</button>
          </>
        ) : (
          <>
            {paso > 1 && <button type="button" className="btn btn-quiet" onClick={() => setPaso(paso - 1)}>Atrás</button>}
            <span style={{ flex: 1 }} />
            {paso < 3 ? (
              <button type="button" className="btn btn-primary" onClick={siguiente}>Siguiente</button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={creando} onClick={() => void crear()}>{creando ? "Creando…" : "Crear persona"}</button>
            )}
          </>
        )
      }
    >
      {error && <div className="form-error" role="alert">{error}</div>}
      {creada ? (
        <div className="cfg-pila" style={{ alignItems: "flex-start" }}>
          <div className="cfg-exito"><Check size={20} /> {creada.name} ya puede entrar al sistema.</div>
          <Credenciales usuario={creada.username} clave={clave} nota="Entregale estos datos. Al entrar por primera vez le va a pedir que elija su propia clave." />
        </div>
      ) : paso === 1 ? (
        <div className="cfg-form">
          <label>
            <span className="field-label">Nombre y apellido</span>
            <input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value, username: userTocado ? d.username : sugerirUsuario(e.target.value) })} placeholder="Ej.: María López" />
          </label>
          <label>
            <span className="field-label">Usuario para ingresar</span>
            <input value={d.username} onChange={(e) => { setUserTocado(true); setD({ ...d, username: e.target.value.toLowerCase().replace(/\s/g, "") }); }} placeholder="Ej.: mlopez" />
            <span className="field-hint" style={existe ? { color: "#b91c1c" } : undefined}>{existe ? "Ya existe: elegí otro." : "Se arma solo con el nombre; podés cambiarlo."}</span>
          </label>
          <label><span className="field-label">Email (opcional)</span><input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
          <label>
            <span className="field-label">Clave provisoria</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={clave} onChange={(e) => setClave(e.target.value)} style={{ fontFamily: "ui-monospace, monospace", flex: 1 }} />
              <button type="button" className="btn btn-quiet" onClick={() => setClave(claveAleatoria())}>Generar</button>
            </div>
            <span className="field-hint">Al entrar por primera vez la cambia por una propia.</span>
          </label>
          <label>
            <span className="field-label">Puede entrar hasta (opcional)</span>
            <input type="date" value={d.accesoHasta} onChange={(e) => setD({ ...d, accesoHasta: e.target.value })} />
            <span className="field-hint">Para reemplazos o temporarios. Vacío = sin vencimiento.</span>
          </label>
        </div>
      ) : paso === 2 ? (
        <div className="cfg-pila">
          <div className="cfg-opciones">
            {(
              [
                ["perfil", "Con un perfil", "Recomendado: toma los accesos de un perfil y se actualiza con él."],
                ["medida", "A medida", "Elegís módulo por módulo solo para esta persona."],
                ["superadmin", "Superadmin", "Acceso total y administra Configuración."],
              ] as const
            ).map(([v, t, txt]) => (
              <button
                key={v}
                type="button"
                className={`cfg-opcion${modo === v ? " on" : ""}`}
                disabled={v === "perfil" && !perfiles.length}
                aria-pressed={modo === v}
                onClick={() => {
                  setModo(v);
                  if (v === "perfil") setA(accesosDePerfil(perfiles.find((p) => p.id === perfilId) ?? perfiles[0] ?? null));
                }}
              >
                <strong>{t}</strong>
                <span>{v === "perfil" && !perfiles.length ? "Todavía no hay perfiles." : txt}</span>
              </button>
            ))}
          </div>
          {modo === "perfil" && (
            <div>
              <div className="cfg-bloque-tit">¿Qué perfil?</div>
              <div className="cfg-opciones">
                {perfiles.map((p) => (
                  <button key={p.id} type="button" className={`cfg-opcion${perfilId === p.id ? " on" : ""}`} aria-pressed={perfilId === p.id} onClick={() => { setPerfilId(p.id); setA(aplicarPerfil(p, a)); }}>
                    <strong>{p.nombre}</strong>
                    <span>{p.descripcion || `${Object.keys(p.permisos).length} módulo${Object.keys(p.permisos).length === 1 ? "" : "s"}`}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {modo !== "superadmin" && (
            <>
              <div className="cfg-bloque-tit" style={{ marginTop: 4 }}>{modo === "perfil" ? "Accesos (podés ajustar alguno como excepción)" : "Accesos"}</div>
              <AccesosEditor valor={a} onChange={setA} modo="persona" perfil={perfil} sectores={sectores} desactivados={datos.modulos.desactivados} />
            </>
          )}
        </div>
      ) : (
        <div className="cfg-pila">
          <div className="cfg-datos-grid">
            <div><span className="field-label">Nombre</span><div>{d.name}</div></div>
            <div><span className="field-label">Usuario</span><div>@{d.username}</div></div>
            <div><span className="field-label">Acceso</span><div>{modo === "superadmin" ? "Superadmin" : perfil ? `Perfil ${perfil.nombre}` : "A medida"}</div></div>
            {d.accesoHasta && <div><span className="field-label">Hasta</span><div>{fechaAr(d.accesoHasta)}</div></div>}
          </div>
          <div className="cfg-bloque-tit">Qué va a poder hacer</div>
          <ResumenAccesos accesos={a} perfil={perfil} sectores={sectores} desactivados={datos.modulos.desactivados} superadmin={modo === "superadmin"} />
        </div>
      )}
    </Panel>
  );
}
