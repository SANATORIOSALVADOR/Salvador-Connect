import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { ACCIONES, ALCANCE_AYUDA, ALCANCE_LABEL, GRUPOS, LEVEL_LABEL, accionesDeNivel, mismasAcciones, modulosDe, ordenarAcciones, type Alcance, type Level } from "@/lib/permisos";
import { accionesEfectivas, esExcepcion, type Accesos, type Perfil, type Sector } from "./api";
import { CHIP_EXCEPCION, Chip, ICONO_MODULO, MUTED } from "./ui";

// Editor de accesos por módulo, agrupado como el menú (General, Operación, Medical, Próximamente).
// Lo usan la ficha de una persona y el editor de perfiles.

const NIVELES: (Level | null)[] = [null, "ver", "editar", "total"];

type Props = {
  valor: Accesos;
  onChange: (a: Accesos) => void;
  /** persona: elige sectores concretos y permisos temporarios. perfil: solo el tipo de alcance. */
  modo: "persona" | "perfil";
  /** Perfil vinculado (persona): lo distinto queda marcado como excepción. */
  perfil?: Perfil | null;
  sectores: Sector[];
  desactivados: string[];
};

export function AccesosEditor({ valor, onChange, modo, perfil, sectores, desactivados }: Props) {
  const set = (fn: (a: Accesos) => void) => {
    const a: Accesos = JSON.parse(JSON.stringify(valor));
    fn(a);
    onChange(a);
  };

  const setNivel = (mod: string, nivel: Level | null) =>
    set((a) => {
      // Cambiar el nivel vuelve a las acciones típicas de ese nivel.
      delete a.acciones[mod];
      if (nivel) a.permisos[mod] = nivel;
      else {
        delete a.permisos[mod];
        delete a.scopes[mod];
        delete a.vencimientos[mod];
      }
    });

  const volverAlPerfil = (mod: string) =>
    set((a) => {
      if (!perfil) return;
      delete a.acciones[mod];
      if (perfil.permisos[mod]) a.permisos[mod] = perfil.permisos[mod];
      else delete a.permisos[mod];
      const alc = perfil.alcances[mod];
      if (alc && alc !== "todos" && perfil.permisos[mod]) a.scopes[mod] = { alcance: alc, sectorIds: a.scopes[mod]?.sectorIds ?? [] };
      else delete a.scopes[mod];
      if (perfil.acciones?.[mod]) a.acciones[mod] = [...perfil.acciones[mod]];
      delete a.vencimientos[mod];
    });

  return (
    <div className="cfg-accesos">
      {GRUPOS.map((g) => {
        const mods = modulosDe(g.key);
        return (
          <section key={g.key} className="cfg-grupo">
            <div className="cfg-grupo-cab">
              <span>{g.label}</span>
              <span style={MUTED}>{g.ayuda}</span>
            </div>
            {mods.map((m) => {
              const nivel = valor.permisos[m.key] ?? null;
              const exc = modo === "persona" && esExcepcion(m.key, valor, perfil ?? null);
              const Icono = ICONO_MODULO[m.key];
              const off = desactivados.includes(m.key);
              return (
                <div key={m.key} className={`cfg-mod${nivel ? " con-acceso" : ""}${exc ? " excepcion" : ""}`}>
                  <div className="cfg-mod-fila">
                    <span className="cfg-mod-ico" aria-hidden="true">{Icono && <Icono size={17} />}</span>
                    <div className="cfg-mod-info">
                      <div className="cfg-mod-nombre">
                        {m.label}
                        {off && <Chip bg="hsl(var(--muted))" fg="hsl(var(--muted-foreground))" title="Desactivado en Configuración → Módulos: nadie lo ve hasta que se active">Módulo desactivado</Chip>}
                        {exc && (
                          <>
                            <Chip {...CHIP_EXCEPCION} title="Distinto de lo que da su perfil">Excepción</Chip>
                            <button type="button" className="cfg-link" onClick={() => volverAlPerfil(m.key)}>
                              <RotateCcw size={12} /> volver al perfil
                            </button>
                          </>
                        )}
                      </div>
                      <div className="cfg-mod-desc">{nivel ? m.can[nivel] : "Sin acceso: no ve el módulo en el menú."}</div>
                    </div>
                    <div className="cfg-niveles" role="radiogroup" aria-label={`${m.label}: nivel de acceso`}>
                      {NIVELES.map((l) => {
                        const disponible = l === null || m.levels.includes(l);
                        if (!disponible) return <span key={l} className="cfg-nivel-vacio" aria-hidden="true" />;
                        return (
                          <button key={l ?? "no"} type="button" role="radio" aria-checked={nivel === l} className={`cfg-nivel n-${l ?? "no"}${nivel === l ? " on" : ""}`} onClick={() => setNivel(m.key, l)}>
                            {l ? LEVEL_LABEL[l] : "Sin acceso"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {nivel && (m.sectores || (ACCIONES[m.key]?.length ?? 0) > 1 || modo === "persona") && (
                    <div className="cfg-mod-detalle">
                      {m.sectores && <Alcances mod={m.key} label={m.label} valor={valor} set={set} modo={modo} sectores={sectores} />}
                      {(ACCIONES[m.key]?.length ?? 0) > 1 && <Acciones mod={m.key} nivel={nivel} valor={valor.acciones[m.key]} onChange={(v) => set((a) => (v ? (a.acciones[m.key] = v) : delete a.acciones[m.key]))} />}
                      {modo === "persona" && (!perfil || exc) && (
                        <label className="cfg-temporal" title="Al vencer se corta solo (si es una excepción de un perfil, vuelve a lo del perfil)">
                          <span>Permiso temporario hasta</span>
                          <input type="date" value={valor.vencimientos[m.key] ?? ""} onChange={(e) => set((a) => (e.target.value ? (a.vencimientos[m.key] = e.target.value) : delete a.vencimientos[m.key]))} />
                          <span style={MUTED}>vacío = sin vencimiento</span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function Alcances({ mod, label, valor, set, modo, sectores }: { mod: string; label: string; valor: Accesos; set: (fn: (a: Accesos) => void) => void; modo: "persona" | "perfil"; sectores: Sector[] }) {
  const sc = valor.scopes[mod];
  const alcance: Alcance = sc?.alcance ?? "todos";
  const elegir = (al: Alcance) =>
    set((a) => {
      if (al === "todos") delete a.scopes[mod];
      else a.scopes[mod] = { alcance: al, sectorIds: a.scopes[mod]?.sectorIds ?? [] };
    });
  const toggle = (id: number, on: boolean) =>
    set((a) => {
      const s = a.scopes[mod];
      if (!s) return;
      s.sectorIds = on ? [...new Set([...s.sectorIds, id])] : s.sectorIds.filter((x) => x !== id);
    });
  return (
    <div className="cfg-bloque">
      <div className="cfg-bloque-tit">Sectores</div>
      <div className="cfg-alcances" role="radiogroup" aria-label={`${label}: sectores`}>
        {(["todos", "carga", "sector"] as Alcance[]).map((al) => (
          <button key={al} type="button" role="radio" aria-checked={alcance === al} className={alcance === al ? "on" : ""} onClick={() => elegir(al)} title={ALCANCE_AYUDA[al]}>
            <strong>{ALCANCE_LABEL[al]}</strong>
            <span>{ALCANCE_AYUDA[al]}</span>
          </button>
        ))}
      </div>
      {alcance !== "todos" &&
        (modo === "perfil" ? (
          <div style={{ ...MUTED, marginTop: 6 }}>Los sectores de cada persona se eligen en su ficha.</div>
        ) : (
          <div className="cfg-sectores">
            {sectores
              .filter((s) => s.active || sc?.sectorIds.includes(s.id))
              .map((s) => {
                const on = Boolean(sc?.sectorIds.includes(s.id));
                return (
                  <label key={s.id} className={`cfg-sector${on ? " on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={(e) => toggle(s.id, e.target.checked)} />
                    {s.name}
                  </label>
                );
              })}
            {!sc?.sectorIds.length && <span className="cfg-aviso">Elegí al menos un sector: sin sectores no ve nada de este módulo.</span>}
          </div>
        ))}
    </div>
  );
}

function Acciones({ mod, nivel, valor, onChange }: { mod: string; nivel: Level; valor?: string[]; onChange: (v: string[] | undefined) => void }) {
  const [abierto, setAbierto] = useState(false);
  const lista = ACCIONES[mod] ?? [];
  const base = accionesDeNivel(mod, nivel);
  const actual = accionesEfectivas(mod, nivel, valor);
  const aMedida = !mismasAcciones(actual, base);
  const toggle = (k: string, on: boolean) => {
    const n = ordenarAcciones(mod, on ? [...actual, k] : actual.filter((x) => x !== k));
    onChange(mismasAcciones(n, base) ? undefined : n);
  };
  return (
    <div className="cfg-bloque">
      <button type="button" className="cfg-bloque-tit cfg-plegar" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        Qué puede hacer
        <span style={{ ...MUTED, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>
          {actual.length} de {lista.length} acciones{aMedida ? " · a medida" : ` · las típicas de «${LEVEL_LABEL[nivel]}»`}
        </span>
        {aMedida && <Chip {...CHIP_EXCEPCION}>A medida</Chip>}
        <ChevronDown size={14} style={{ transform: abierto ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>
      {abierto && (
        <>
          <div className="cfg-acciones">
            {lista.map((a) => {
              const on = actual.includes(a.key);
              const extra = on && !base.includes(a.key);
              const quitada = !on && base.includes(a.key);
              return (
                <label key={a.key} className={`cfg-accion${on ? " on" : ""}${extra ? " extra" : ""}${quitada ? " quitada" : ""}`}>
                  <input type="checkbox" checked={on} disabled={a.key === "ver"} onChange={(e) => toggle(a.key, e.target.checked)} />
                  <span>
                    {a.label}
                    <small>{extra ? "Agregada a mano" : quitada ? "Quitada a mano" : `Viene con «${LEVEL_LABEL[a.nivel]}»`}</small>
                  </span>
                </label>
              );
            })}
          </div>
          {aMedida && (
            <button type="button" className="cfg-link" onClick={() => onChange(undefined)} style={{ marginTop: 6 }}>
              <RotateCcw size={12} /> Volver a las típicas del nivel
            </button>
          )}
        </>
      )}
    </div>
  );
}
