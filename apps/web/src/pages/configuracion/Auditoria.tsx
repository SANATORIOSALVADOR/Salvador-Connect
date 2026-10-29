import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api, type Movimiento } from "./api";
import type { Datos, Nav } from "./Configuracion";
import { ListaMovimientos } from "./Personas";
import { Cabecera, Vacio } from "./ui";

// Auditoría: quién dio, cambió o quitó accesos, a quién y cuándo. También cambios de clave, perfiles, módulos y «Ver como».

type Props = { datos: Datos; recargar: () => Promise<void>; nav: Nav };

const TIPOS: { v: string; label: string; acciones: string[] }[] = [
  { v: "", label: "Todo", acciones: [] },
  { v: "personas", label: "Altas, cambios y bajas", acciones: ["alta", "cambio", "baja"] },
  { v: "perfiles", label: "Perfiles", acciones: ["perfil_alta", "perfil_cambio", "perfil_baja"] },
  { v: "clave", label: "Claves", acciones: ["clave"] },
  { v: "ver_como", label: "Ver como", acciones: ["ver_como"] },
  { v: "modulo", label: "Módulos", acciones: ["modulo"] },
];

export function Auditoria({ datos, nav }: Props) {
  const [movs, setMovs] = useState<Movimiento[] | null>(null);
  const [persona, setPersona] = useState(nav.param("persona") ?? "");
  const [tipo, setTipo] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    setMovs(null);
    api<Movimiento[]>(`/users/historial?limit=500${persona ? `&userId=${persona}` : ""}`)
      .then(setMovs)
      .catch(() => setMovs([]));
  }, [persona]);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    const acc = TIPOS.find((x) => x.v === tipo)?.acciones ?? [];
    return (movs ?? []).filter((m) => (!acc.length || acc.includes(m.accion)) && (!t || `${m.detalle} ${m.userNombre} ${m.perfilNombre} ${m.actorNombre}`.toLowerCase().includes(t)));
  }, [movs, tipo, q]);

  return (
    <>
      <Cabecera titulo="Auditoría" texto="Registro de todo cambio de accesos: quién lo hizo, a quién y qué cambió. También cambios de clave, perfiles, módulos y cada uso de «Ver como»." />
      <div className="cfg-filtros-chips" role="tablist">
        {TIPOS.map((x) => (
          <button key={x.v} type="button" role="tab" aria-selected={tipo === x.v} className={`cfg-fchip${tipo === x.v ? " on" : ""}`} onClick={() => setTipo(x.v)}>{x.label}</button>
        ))}
      </div>
      <div className="cfg-toolbar">
        <div className="cfg-buscar">
          <Search size={15} aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el detalle" aria-label="Buscar en el detalle" />
        </div>
        <select value={persona} onChange={(e) => setPersona(e.target.value)} aria-label="Filtrar por persona">
          <option value="">Todas las personas</option>
          {datos.personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {movs === null ? <div className="skeleton" style={{ height: 200 }} /> : lista.length === 0 ? <Vacio titulo="No hay movimientos con estos filtros" /> : <div className="cfg-caja"><ListaMovimientos movs={lista} mostrarPersona /></div>}
    </>
  );
}
