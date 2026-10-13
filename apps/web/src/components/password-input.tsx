import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Campo de contraseña con botón para mostrar u ocultar lo que se escribe. */
export function PasswordInput({ value, onChange, autoComplete, testId, minLength, required }: { value: string; onChange: (v: string) => void; autoComplete: string; testId: string; minLength?: number; required?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div style={{ position: 'relative' }}>
    <input className="input" type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} minLength={minLength} required={required} data-testid={testId} style={{ paddingRight: 42, width: '100%', boxSizing: 'border-box' }} />
    <button type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} data-testid={`${testId}-toggle`} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'grid', placeItems: 'center', width: 32, height: 32, border: 'none', background: 'transparent', color: 'hsl(var(--muted-foreground))', cursor: 'pointer', borderRadius: 8 }}>
      {visible ? <EyeOff size={17} /> : <Eye size={17} />}
    </button>
  </div>;
}
