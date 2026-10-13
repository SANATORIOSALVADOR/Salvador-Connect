import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { APARIENCIA_DEFAULT, refrescarApariencia, setApariencia, useApariencia, type Apariencia, type Tema } from "./apariencia";

// Configuración → Apariencia: logo, nombre, colores, tema por defecto y textos del login.
// Los cambios se ven en vivo; "Guardar" los aplica para todos, "Descartar" vuelve a lo guardado.

const COLORES_PRINCIPAL = ["#208379", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#16a34a", "#0f172a"];
const COLORES_MENU = ["#103b4c", "#0f172a", "#1e293b", "#1e3a8a", "#3b0764", "#14532d", "#7f1d1d", "#f1f5f9"];
const MAX_LADO = 256; // px: el logo se achica para que cargue rápido

const CARD: CSSProperties = { padding: 18, borderRadius: 14 };
const MUTED: CSSProperties = { fontSize: 12, color: "hsl(var(--muted-foreground))" };
const H3: CSSProperties = { margin: "0 0 10px", fontSize: 15, fontWeight: 800 };

/** Achica imágenes PNG/JPG/WEBP a 256 px como máximo; los SVG se usan tal cual. */
async function leerLogo(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(file);
  });
  if (file.type === "image/svg+xml") return dataUrl;
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => fail(new Error("La imagen no es válida."));
    i.src = dataUrl;
  });
  const escala = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * escala));
  canvas.height = Math.max(1, Math.round(img.height * escala));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function Swatches({ colores, valor, onChange, etiqueta }: { colores: string[]; valor: string; onChange: (c: string) => void; etiqueta: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {colores.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          aria-label={`${etiqueta} ${c}`}
          style={{ width: 30, height: 30, borderRadius: 9, background: c, cursor: "pointer", border: valor.toLowerCase() === c ? "3px solid hsl(var(--foreground))" : "1px solid hsl(var(--border))" }}
        />
      ))}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, ...MUTED }}>
        <input type="color" value={valor} onChange={(e) => onChange(e.target.value)} style={{ width: 38, height: 30, border: "none", padding: 0, background: "transparent", cursor: "pointer" }} />
        Otro
      </label>
    </div>
  );
}

export default function AparienciaConfig({ onNotice, onError }: { onNotice: (m: string) => void; onError: (m: string) => void }) {
  const { apariencia, oscuro } = useApariencia();
  const guardada = useRef<Apariencia>(apariencia);
  const [form, setForm] = useState<Apariencia>(apariencia);
  // Último valor del formulario sin esperar al render (dos cambios seguidos no se pisan).
  const formRef = useRef<Apariencia>(apariencia);
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const sucioRef = useRef(false);
  sucioRef.current = sucio;

  // Traer lo último del servidor al entrar y, si se sale sin guardar, volver a lo guardado.
  useEffect(() => {
    void refrescarApariencia();
    return () => {
      if (sucioRef.current) void refrescarApariencia();
    };
  }, []);

  useEffect(() => {
    if (!sucio) {
      setForm(apariencia);
      formRef.current = apariencia;
      guardada.current = apariencia;
    }
  }, [apariencia, sucio]);

  function cambiar(patch: Partial<Apariencia>) {
    const next = { ...formRef.current, ...patch };
    formRef.current = next;
    setForm(next);
    setSucio(true);
    setApariencia(next); // vista previa en vivo
  }

  async function subirLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      onError("Usá una imagen PNG, JPG, WEBP o SVG.");
      return;
    }
    try {
      const logo = await leerLogo(file);
      if (logo.length > 400_000) {
        onError("El logo es muy pesado (máximo 300 KB). Probá con un PNG más chico.");
        return;
      }
      cambiar({ logo });
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo usar la imagen.");
    }
  }

  async function guardar() {
    setGuardando(true);
    try {
      const res = await fetch("/api/apariencia", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formRef.current) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { message?: string }).message || "No se pudo guardar.");
      setSucio(false);
      setApariencia(body as Apariencia);
      guardada.current = body as Apariencia;
      onNotice("Apariencia guardada. Se aplica a todos los usuarios al recargar la página.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  function descartar() {
    setSucio(false);
    setForm(guardada.current);
    formRef.current = guardada.current;
    setApariencia(guardada.current);
  }

  const tarjetaTema = (valor: Tema, titulo: string, desc: string) => (
    <label key={valor} style={{ display: "flex", gap: 10, padding: 12, borderRadius: 12, cursor: "pointer", border: `2px solid ${form.temaPorDefecto === valor ? "hsl(var(--primary))" : "hsl(var(--border))"}` }}>
      <input type="radio" name="tema" checked={form.temaPorDefecto === valor} onChange={() => cambiar({ temaPorDefecto: valor })} />
      <span><strong>{titulo}</strong><br /><span style={MUTED}>{desc}</span></span>
    </label>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <section className="card" style={CARD}>
          <h3 style={H3}>Identidad</h3>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ width: 84, height: 84, borderRadius: 16, display: "grid", placeItems: "center", background: form.logo ? "#fff" : "hsl(var(--muted))", border: "1px solid hsl(var(--border))", overflow: "hidden" }}>
              {form.logo ? <img src={form.logo} alt="Logo" style={{ maxWidth: "88%", maxHeight: "88%", objectFit: "contain" }} /> : <span style={MUTED}>Sin logo</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label className="btn btn-primary" style={{ cursor: "pointer", fontSize: 13 }}>
                {form.logo ? "Cambiar logo" : "Subir logo"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => void subirLogo(e)} style={{ display: "none" }} />
              </label>
              {form.logo && <button type="button" className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => cambiar({ logo: null })}>Quitar logo</button>}
              <span style={MUTED}>PNG con fondo transparente o SVG. Se usa en el menú, el login y la pestaña del navegador.</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 14 }}>
            <label className="field"><span className="field-label">Nombre</span><input className="input" maxLength={60} value={form.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} /></label>
            <label className="field"><span className="field-label">Subtítulo</span><input className="input" maxLength={60} value={form.subtitulo} placeholder="Ej. Sistema interno" onChange={(e) => cambiar({ subtitulo: e.target.value })} /></label>
          </div>
        </section>

        <section className="card" style={CARD}>
          <h3 style={H3}>Colores</h3>
          <div className="field-label" style={{ marginBottom: 6 }}>Color principal (botones, solapas, selección)</div>
          <Swatches colores={COLORES_PRINCIPAL} valor={form.colorPrimario} onChange={(c) => cambiar({ colorPrimario: c })} etiqueta="Color principal" />
          <div className="field-label" style={{ margin: "14px 0 6px" }}>Color del menú lateral</div>
          <Swatches colores={COLORES_MENU} valor={form.colorMenu} onChange={(c) => cambiar({ colorMenu: c })} etiqueta="Color del menú" />
        </section>

        <section className="card" style={CARD}>
          <h3 style={H3}>Tema</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            {tarjetaTema("claro", "Claro", "Fondo claro.")}
            {tarjetaTema("oscuro", "Oscuro", "Fondo oscuro, cansa menos de noche.")}
            {tarjetaTema("sistema", "Automático", "Según la configuración de cada computadora.")}
          </div>
          <p style={{ ...MUTED, marginTop: 10 }}>Es el tema inicial para todos. Cada persona puede cambiar el suyo con el botón ☾ / ☀ de arriba a la derecha.</p>
        </section>

        <section className="card" style={CARD}>
          <h3 style={H3}>Pantalla de ingreso</h3>
          <label className="field"><span className="field-label">Frase de bienvenida</span><input className="input" maxLength={90} value={form.tituloLogin} onChange={(e) => cambiar({ tituloLogin: e.target.value })} /></label>
          <label className="field" style={{ marginTop: 10 }}><span className="field-label">Mensaje (opcional)</span><textarea className="textarea" rows={2} maxLength={240} value={form.mensajeLogin} placeholder="Ej. Ante problemas de acceso, llamar al interno 123." onChange={(e) => cambiar({ mensajeLogin: e.target.value })} /></label>
        </section>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 12 }}>
        <section className="card" style={CARD}>
          <h3 style={H3}>Vista previa del ingreso</h3>
          <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid hsl(var(--border))", display: "grid", gridTemplateColumns: "1.1fr 1fr", minHeight: 190 }}>
            <div style={{ background: "hsl(var(--sidebar))", color: "hsl(var(--sidebar-foreground))", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: form.logo ? "#fff" : "hsl(var(--sidebar-primary))", display: "grid", placeItems: "center", overflow: "hidden" }}>
                  {form.logo && <img src={form.logo} alt="" style={{ width: "90%", height: "90%", objectFit: "contain" }} />}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.1 }}>{form.nombre}<div style={{ fontSize: 9, opacity: 0.6, fontWeight: 600 }}>{form.subtitulo}</div></div>
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2, marginTop: "auto" }}>{form.tituloLogin}</div>
              {form.mensajeLogin && <div style={{ fontSize: 11, opacity: 0.75 }}>{form.mensajeLogin}</div>}
            </div>
            <div style={{ background: "hsl(var(--background))", padding: 16, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Iniciar sesión.</div>
              <div style={{ height: 26, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              <div style={{ height: 26, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              <div style={{ height: 28, borderRadius: 8, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", fontSize: 12, fontWeight: 700, display: "grid", placeItems: "center" }}>Ingresar</div>
            </div>
          </div>
          <p style={{ ...MUTED, marginTop: 10 }}>Los cambios ya se ven en todo el sistema mientras editás (modo {oscuro ? "oscuro" : "claro"}). Solo quedan para todos al guardar.</p>
        </section>

        <section className="card" style={{ ...CARD, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-primary" disabled={!sucio || guardando} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar apariencia"}</button>
          <button type="button" className="btn btn-quiet" disabled={!sucio || guardando} onClick={descartar}>Descartar cambios</button>
          <button type="button" className="btn btn-quiet" style={{ marginLeft: "auto", fontSize: 12 }} onClick={() => cambiar({ ...APARIENCIA_DEFAULT })}>Valores originales</button>
          {sucio && <span style={{ ...MUTED, width: "100%" }}>Hay cambios sin guardar.</span>}
        </section>
      </div>
    </div>
  );
}
