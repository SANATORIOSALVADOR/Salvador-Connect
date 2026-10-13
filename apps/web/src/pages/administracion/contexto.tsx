import { createContext, useContext, useEffect, useState, type DependencyList } from "react";
import type { Item, Tipo } from "./logic";
import type { Permisos } from "./modales";

export type AdmCtx = {
  permisos: Permisos;
  hoy: string;
  responsables: string[];
  /** Cambia cada vez que algo se guarda: las pestañas recargan sus datos. */
  version: number;
  refrescar: () => void;
  abrir: (id: number) => void;
  nuevo: (tipo?: Tipo, fecha?: string) => void;
  editar: (it: Item) => void;
  cumplir: (it: Item) => void;
  irA: (tab: string) => void;
};

export const AdmContext = createContext<AdmCtx | null>(null);

export function useAdm(): AdmCtx {
  const c = useContext(AdmContext);
  if (!c) throw new Error("useAdm fuera de Administración");
  return c;
}

/** Carga datos y los recarga cuando cambian las dependencias o se guarda algo (version). */
export function useDatos<T>(fn: () => Promise<T>, deps: DependencyList): { data: T | null; error: string | null; cargando: boolean; recargar: () => void } {
  const { version } = useAdm();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    fn()
      .then((d) => {
        if (!vivo) return;
        setData(d);
        setError(null);
      })
      .catch((e) => vivo && setError((e as Error).message))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, n]);
  return { data, error, cargando, recargar: () => setN((x) => x + 1) };
}
