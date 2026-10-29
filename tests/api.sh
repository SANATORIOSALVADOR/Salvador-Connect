#!/usr/bin/env bash
# Pruebas de punta a punta de la API contra una base PostgreSQL VACÍA (solo valores de prueba).
# Uso:  API_URL=http://127.0.0.1:5000/api ADMIN_PASSWORD=... DATABASE_URL=postgres://... bash tests/api.sh
# La API tiene que haber arrancado con BOOTSTRAP_ADMIN_PASSWORD=$ADMIN_PASSWORD sobre esa base.
B="${API_URL:-http://127.0.0.1:5055/api}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Definí ADMIN_PASSWORD (la misma que BOOTSTRAP_ADMIN_PASSWORD de la API)}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
J='Content-Type: application/json'
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK   $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL $1 :: $2"; }
# check "<desc>" <expected_status> <actual_status> [body]
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "esperado $2, obtuvo $3 $(head -c 200 "$T/body" 2>/dev/null)"; fi; }
req() { # cookiejar method path [json]
  local jar=$1 m=$2 p=$3 d=${4:-}
  if [ -n "$d" ]; then printf '%s' "$d" > "$T/req.json"; curl -s -o "$T/body" -w '%{http_code}' -b "$jar" -c "$jar" -X "$m" -H "$J" "$B$p" --data-binary @"$T/req.json"
  else curl -s -o "$T/body" -w '%{http_code}' -b "$jar" -c "$jar" -X "$m" "$B$p"; fi
}
body() { cat "$T/body"; }
jget() { node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log($1)" < "$T/body"; }
# SQL directo (solo para simular datos viejos): psql si está, si no el módulo pg de node.
sql() {
  if command -v psql >/dev/null 2>&1; then psql "$DATABASE_URL" -qtAc "$1" >/dev/null
  else node -e "const pg=require(process.env.PG_MODULE||'pg');const c=new pg.Client(process.env.DATABASE_URL);c.connect().then(()=>c.query(process.argv[1])).then(()=>c.end())" "$1"; fi
}

A=$T/ck_admin; R=$T/ck_resp; U=$T/ck_user

echo "== Auth / bootstrap"
check "login superadmin bootstrap" 200 "$(req $A POST /auth/login "{\"username\":\"sistemas\",\"password\":\"$ADMIN_PASSWORD\"}")"
check "login con clave mala" 401 "$(req $T/x POST /auth/login '{"username":"sistemas","password":"mala"}')"
for i in 1 2 3 4; do req $T/x POST /auth/login '{"username":"nadie","password":"x"}' >/dev/null; done
req $T/x POST /auth/login '{"username":"nadie","password":"x"}' >/dev/null
check "bloqueo tras 5 intentos" 429 "$(req $T/x POST /auth/login '{"username":"nadie","password":"x"}')"

echo "== Sectores"
for s in "Guardia Central:GCE" "UTI Neo:UNE" "UTI UCO:UCO" "Piso Gineco:GIN" "Piso Clínica Médica:PCM" "Residentes:RES" "Farmacia:FAR"; do
  req $A POST /sectores "{\"name\":\"${s%%:*}\",\"shortName\":\"${s##*:}\"}" >/dev/null
done
req $A GET /sectors >/dev/null
GC=$(jget "d.find(s=>s.name==='Guardia Central').id"); UTI=$(jget "d.find(s=>s.name==='UTI Neo').id"); FAR=$(jget "d.find(s=>s.name==='Farmacia').id")
echo "  sectores: GC=$GC UTI=$UTI FAR=$FAR"

echo "== Usuarios y permisos"
check "crear responsable (solo GC)" 201 "$(req $A POST /users "{\"name\":\"Resp GC\",\"username\":\"respgc\",\"password\":\"prueba123\",\"role\":\"usuario\",\"permissions\":{\"guardias\":\"total\",\"administracion\":\"total\"},\"sectorIds\":[$GC]}")"
check "crear usuario lectura" 201 "$(req $A POST /users '{"name":"Lector","username":"lector","password":"prueba123","role":"usuario","modules":["guardias","administracion"]}')"
check "crear usuario sin módulos" 201 "$(req $A POST /users '{"name":"Sin mod","username":"sinmod","password":"prueba123","role":"usuario","modules":[]}')"
check "login responsable" 200 "$(req $R POST /auth/login '{"username":"respgc","password":"prueba123"}')"
check "login lector" 200 "$(req $U POST /auth/login '{"username":"lector","password":"prueba123"}')"
S=$T/ck_sin; req $S POST /auth/login '{"username":"sinmod","password":"prueba123"}' >/dev/null
check "responsable puede LEER guardias (antes 403 por bug)" 200 "$(req $R GET '/guardias?from=2026-10-01&to=2026-10-31')"
check "lector lee guardias" 200 "$(req $U GET '/guardias?from=2026-10-01&to=2026-10-31')"
check "sin módulo no lee guardias" 403 "$(req $S GET '/guardias?from=2026-10-01&to=2026-10-31')"
check "lector NO crea guardia" 403 "$(req $U POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-10-01\",\"startTime\":\"08:00\",\"endTime\":\"16:00\",\"professionalName\":\"X Y\"}")"
check "lector NO escribe administración" 403 "$(req $U POST /administracion/items '{"titulo":"x","fecha":"2026-10-20"}')"
check "responsable NO lista usuarios" 403 "$(req $R GET /users)"
check "primer acceso: cambia clave sin pedir la actual" 200 "$(req $R POST /auth/change-password '{"newPassword":"prueba456"}')"
check "después exige la clave actual" 400 "$(req $R POST /auth/change-password '{"newPassword":"prueba789"}')"
check "con la clave actual correcta" 200 "$(req $R POST /auth/change-password '{"newPassword":"prueba789","currentPassword":"prueba456"}')"

echo "== Guardias: alta, nocturna, solape, permisos por sector"
check "responsable carga en su sector" 201 "$(req $R POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-10-05\",\"startTime\":\"20:00\",\"endTime\":\"08:00\",\"modality\":\"activa\",\"professionalName\":\"Pérez  Juan\"}")"
G1=$(jget d.id); END=$(jget d.endDate); PID=$(jget d.professionalId)
[ "$END" = "2026-10-06" ] && ok "nocturna termina el día siguiente ($END)" || bad "nocturna" "endDate=$END"
[ -n "$PID" ] && [ "$PID" != "null" ] && ok "profesional creado (id $PID)" || bad "profesional" "$PID"
check "responsable NO carga en otro sector" 403 "$(req $R POST /guardias "{\"sectorId\":$UTI,\"date\":\"2026-10-05\",\"startTime\":\"08:00\",\"endTime\":\"16:00\",\"professionalName\":\"Gómez Ana\"}")"
check "solape mismo profesional (sin tilde) detectado" 409 "$(req $A POST /guardias "{\"sectorId\":$UTI,\"date\":\"2026-10-06\",\"startTime\":\"06:00\",\"endTime\":\"10:00\",\"professionalName\":\"perez juan\"}")"
check "con permitir solape se guarda" 201 "$(req $A POST /guardias "{\"sectorId\":$UTI,\"date\":\"2026-10-06\",\"startTime\":\"06:00\",\"endTime\":\"10:00\",\"professionalName\":\"perez juan\",\"allowOverlap\":true}")"
NAME=$(jget d.professionalName); [ "$NAME" = "Pérez Juan" ] && ok "usa la grafía existente ($NAME)" || bad "grafía" "$NAME"
G2=$(jget d.id)
check "pasiva otra persona" 201 "$(req $A POST /guardias "{\"sectorId\":$UTI,\"date\":\"2026-10-05\",\"startTime\":\"08:00\",\"endTime\":\"20:00\",\"modality\":\"pasiva\",\"professionalName\":\"Gómez Ana\",\"tagLabel\":\"GUARDIA EXTRA\"}")"
check "modificar guardia" 200 "$(req $A PATCH /guardias/$G2 "{\"sectorId\":$UTI,\"date\":\"2026-10-07\",\"startTime\":\"06:00\",\"endTime\":\"10:00\",\"professionalName\":\"Pérez Juan\"}")"
check "responsable NO borra guardia de otro sector" 403 "$(req $R DELETE /guardias/$G2)"
check "borrar guardia" 204 "$(req $A DELETE /guardias/$G2)"
check "borrar inexistente" 404 "$(req $A DELETE /guardias/$G2)"

echo "== Profesionales"
check "lista profesionales" 200 "$(req $A GET /guardias/profesionales/lista)"
echo "  $(body | head -c 300)"
check "editar matrícula" 200 "$(req $A PATCH /guardias/profesionales/$PID '{"matricula":"MP 1234","especialidad":"Clínica"}')"
check "renombrar profesional" 200 "$(req $A PATCH /guardias/profesionales/$PID '{"name":"Pérez Juan Carlos"}')"
req $A GET '/guardias?from=2026-10-01&to=2026-10-31' >/dev/null
N=$(jget "d.find(g=>g.id===$G1).professionalName"); [ "$N" = "Pérez Juan Carlos" ] && ok "guardias toman el nombre nuevo" || bad "rename" "$N"

echo "== Configuración de cobertura"
check "leer config" 200 "$(req $A GET /guardias/config)"
echo "  activos por nombre: $(jget "d.filter(s=>s.active).map(s=>s.name).join(', ')")"
check "GC 24h todos los días" 200 "$(req $A PUT /guardias/config/$GC '{"active":true,"cobertura":[{"dow":0,"start":"00:00","end":"24:00"},{"dow":1,"start":"00:00","end":"24:00"},{"dow":2,"start":"00:00","end":"24:00"},{"dow":3,"start":"00:00","end":"24:00"},{"dow":4,"start":"00:00","end":"24:00"},{"dow":5,"start":"00:00","end":"24:00"},{"dow":6,"start":"00:00","end":"24:00"}]}')"
check "franja inválida rechazada" 400 "$(req $A PUT /guardias/config/$GC '{"cobertura":[{"dow":9,"start":"10:00","end":"08:00"}]}')"
check "responsable NO configura otro sector" 403 "$(req $R PUT /guardias/config/$UTI '{"active":true,"cobertura":[]}')"
req $A GET /guardias/config >/dev/null
echo "  tras guardar: activos=$(jget "d.filter(s=>s.active).map(s=>s.name).join(', ')") · Farmacia activo=$(jget "d.find(s=>s.name==='Farmacia').active")"

echo "== Copiar semana"
check "copiar semana 05-11 → 12" 200 "$(req $A POST /guardias/copiar '{"fromStart":"2026-10-05","fromEnd":"2026-10-11","toStart":"2026-10-12"}')"
echo "  $(body)"
check "copiar de nuevo omite duplicados" 200 "$(req $A POST /guardias/copiar '{"fromStart":"2026-10-05","fromEnd":"2026-10-11","toStart":"2026-10-12"}')"
echo "  $(body | head -c 250)"
check "destino que pisa origen rechazado" 400 "$(req $A POST /guardias/copiar '{"fromStart":"2026-10-05","fromEnd":"2026-10-11","toStart":"2026-10-08"}')"

echo "== Auditoría"
check "auditoría (admin)" 200 "$(req $A GET '/guardias/auditoria?limit=20')"
echo "  acciones: $(jget "d.map(a=>a.action).join(',')")"
check "auditoría (lector) prohibida" 403 "$(req $U GET /guardias/auditoria)"

echo "== Etiquetas de guardias (catálogo, solo superadmin)"
check "lector lee el catálogo" 200 "$(req $U GET /guardias/etiquetas)"
N0=$(jget "d.length"); [ "$N0" -ge 4 ] && ok "catálogo precargado ($N0 etiquetas)" || bad "precarga" "$N0"
U0=$(jget "d.find(e=>e.nombre==='GUARDIA EXTRA').usos"); [ "$U0" -ge 1 ] && ok "cuenta las guardias que usan GUARDIA EXTRA ($U0)" || bad "usos" "$U0"
check "responsable (Control total) NO crea etiquetas" 403 "$(req $R POST /guardias/etiquetas '{"nombre":"NOCHE","color":"#334155"}')"
check "crear etiqueta" 201 "$(req $A POST /guardias/etiquetas '{"nombre":"  noche   larga ","color":"#334155"}')"
ET=$(jget d.id); NOM=$(jget d.nombre); [ "$NOM" = "NOCHE LARGA" ] && ok "nombre normalizado ($NOM)" || bad "normaliza" "$NOM"
check "nombre repetido (otra grafía)" 409 "$(req $A POST /guardias/etiquetas '{"nombre":"Noche Larga","color":"#334155"}')"
check "color inválido" 400 "$(req $A POST /guardias/etiquetas '{"nombre":"OTRA","color":"rojo"}')"
check "guardia con etiqueta fuera del catálogo" 400 "$(req $A POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-11-02\",\"startTime\":\"08:00\",\"endTime\":\"16:00\",\"professionalName\":\"Ruiz Martín\",\"tagLabel\":\"INVENTADA\"}")"
check "guardia con etiqueta del catálogo" 201 "$(req $R POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-11-02\",\"startTime\":\"08:00\",\"endTime\":\"16:00\",\"professionalName\":\"Ruiz Martín\",\"tagLabel\":\"noche larga\",\"tagColor\":\"#000000\"}")"
GE=$(jget d.id); TL="$(jget d.tagLabel)|$(jget d.tagColor)"
[ "$TL" = "NOCHE LARGA|#334155" ] && ok "toma nombre y color del catálogo ($TL)" || bad "catálogo" "$TL"
check "responsable NO edita etiquetas" 403 "$(req $R PATCH /guardias/etiquetas/$ET '{"color":"#be185d"}')"
check "renombrar etiqueta y cambiar color" 200 "$(req $A PATCH /guardias/etiquetas/$ET '{"nombre":"NOCTURNA","color":"#be185d"}')"
NA=$(jget d.guardiasActualizadas); [ "$NA" = "1" ] && ok "actualiza las guardias que la usan ($NA)" || bad "propaga" "$NA"
req $A GET '/guardias?from=2026-11-01&to=2026-11-30' >/dev/null
TL=$(jget "(g=>g.tagLabel+'|'+g.tagColor)(d.find(g=>g.id===$GE))"); [ "$TL" = "NOCTURNA|#be185d" ] && ok "la guardia muestra la etiqueta nueva ($TL)" || bad "guardia" "$TL"
check "no se elimina si está en uso" 409 "$(req $A DELETE /guardias/etiquetas/$ET)"
check "desactivar etiqueta" 200 "$(req $A PATCH /guardias/etiquetas/$ET '{"activa":false}')"
check "desactivada: no se usa en guardias nuevas" 400 "$(req $A POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-11-03\",\"startTime\":\"08:00\",\"endTime\":\"16:00\",\"professionalName\":\"Ruiz Martín\",\"tagLabel\":\"NOCTURNA\"}")"
check "al editar, la guardia conserva la que ya tenía" 200 "$(req $R PATCH /guardias/$GE "{\"sectorId\":$GC,\"date\":\"2026-11-02\",\"startTime\":\"09:00\",\"endTime\":\"16:00\",\"professionalName\":\"Ruiz Martín\",\"tagLabel\":\"NOCTURNA\"}")"
check "quitar la etiqueta de la guardia" 200 "$(req $R PATCH /guardias/$GE "{\"sectorId\":$GC,\"date\":\"2026-11-02\",\"startTime\":\"09:00\",\"endTime\":\"16:00\",\"professionalName\":\"Ruiz Martín\",\"tagLabel\":\"\"}")"
check "eliminar etiqueta sin uso" 204 "$(req $A DELETE /guardias/etiquetas/$ET)"
check "Control total configura el horario de su sector" 200 "$(req $R PUT /guardias/config/$GC '{"active":true,"cobertura":[]}')"
check "responsable NO crea sectores (solo superadmin)" 403 "$(req $R POST /sectores '{"name":"Sector X","shortName":"SX"}')"

echo "== Alcance por sector (por módulo)"
req $A GET /users >/dev/null
SC=$(jget "JSON.stringify(d.find(u=>u.username==='respgc').scopes)"); [ "$SC" = "{\"guardias\":{\"alcance\":\"carga\",\"sectorIds\":[$GC]}}" ] && ok "formato viejo (sectorIds) → ve todo, carga en GC ($SC)" || bad "compat sectorIds" "$SC"
check "crear encargado UTI (solo su sector)" 201 "$(req $A POST /users "{\"name\":\"Enc UTI\",\"username\":\"encuti\",\"password\":\"prueba123\",\"permissions\":{\"guardias\":\"total\"},\"scopes\":{\"guardias\":{\"alcance\":\"sector\",\"sectorIds\":[$UTI]},\"administracion\":{\"alcance\":\"sector\",\"sectorIds\":[$UTI]}}}")"
SC=$(jget "JSON.stringify(d.scopes)"); [ "$SC" = "{\"guardias\":{\"alcance\":\"sector\",\"sectorIds\":[$UTI]}}" ] && ok "guarda el alcance solo en módulos con sectores ($SC)" || bad "scopes" "$SC"
check "crear con alcance sin sectores = todos" 201 "$(req $A POST /users '{"name":"Sin sec","username":"sinsec","password":"prueba123","permissions":{"guardias":"ver"},"scopes":{"guardias":{"alcance":"sector","sectorIds":[]}}}')"
SC=$(jget "JSON.stringify(d.scopes)"); [ "$SC" = "{}" ] && ok "sin sectores elegidos queda en todos" || bad "vacío" "$SC"
C=$T/ck_enc; check "login encargado UTI" 200 "$(req $C POST /auth/login '{"username":"encuti","password":"prueba123"}')"
check "me trae el alcance" 200 "$(req $C GET /auth/me)"
SC=$(jget "d.scopes.guardias.alcance"); [ "$SC" = "sector" ] && ok "auth/me: alcance $SC" || bad "auth/me" "$SC"
check "encargado lee guardias" 200 "$(req $C GET '/guardias?from=2026-10-01&to=2026-11-30')"
OTROS=$(jget "d.filter(g=>g.sectorId!==$UTI).length"); N=$(jget "d.length")
[ "$OTROS" = "0" ] && [ "$N" -gt 0 ] && ok "solo ve guardias de UTI ($N)" || bad "lectura por sector" "otros=$OTROS total=$N"
check "config de sectores" 200 "$(req $C GET /guardias/config)"
IDS=$(jget "d.map(s=>s.sectorId).join(',')"); [ "$IDS" = "$UTI" ] && ok "config: solo su sector" || bad "config" "$IDS"
check "auditoría (encargado)" 200 "$(req $C GET '/guardias/auditoria?limit=200')"
OTROS=$(jget "d.filter(a=>((a.after||a.before)||{}).sectorId!==$UTI).length"); [ "$OTROS" = "0" ] && ok "auditoría: solo su sector" || bad "auditoría" "otros=$OTROS"
check "NO carga en otro sector" 403 "$(req $C POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-11-10\",\"startTime\":\"08:00\",\"endTime\":\"16:00\",\"professionalName\":\"Luna Sofía\"}")"
check "carga en su sector" 201 "$(req $C POST /guardias "{\"sectorId\":$UTI,\"date\":\"2026-11-10\",\"startTime\":\"08:00\",\"endTime\":\"16:00\",\"professionalName\":\"Luna Sofía\"}")"
GU=$(jget d.id)
check "NO modifica guardias de otro sector" 403 "$(req $C PATCH /guardias/$G1 "{\"sectorId\":$GC,\"date\":\"2026-10-05\",\"startTime\":\"20:00\",\"endTime\":\"08:00\",\"professionalName\":\"Pérez Juan Carlos\"}")"
check "NO configura otro sector" 403 "$(req $C PUT /guardias/config/$GC '{"active":true,"cobertura":[]}')"
check "solape con otro sector: sin detalle" 409 "$(req $A POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-11-10\",\"startTime\":\"10:00\",\"endTime\":\"12:00\",\"professionalName\":\"Luna Sofía\"}")"
check "buscador: no muestra sectores ajenos" 200 "$(req $C GET '/buscar?q=guardia')"
X=$(jget "d.filter(r=>r.tipo==='sector').map(r=>r.titulo).join(',')"); [ -z "$X" ] && ok "buscador sin sectores ajenos" || bad "buscador" "$X"
check "crear 've todo, trabaja en UTI'" 201 "$(req $A POST /users "{\"name\":\"Ve todo\",\"username\":\"vetodo\",\"password\":\"prueba123\",\"permissions\":{\"guardias\":\"editar\"},\"scopes\":{\"guardias\":{\"alcance\":\"carga\",\"sectorIds\":[$UTI]}}}")"
V=$T/ck_vt; req $V POST /auth/login '{"username":"vetodo","password":"prueba123"}' >/dev/null
check "ve todo: lee guardias" 200 "$(req $V GET '/guardias?from=2026-10-01&to=2026-10-31')"
OTROS=$(jget "d.filter(g=>g.sectorId!==$UTI).length"); [ "$OTROS" -gt 0 ] && ok "ve también otros sectores ($OTROS)" || bad "ve todo" "$OTROS"
check "ve todo: NO carga en GC" 403 "$(req $V POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-11-11\",\"startTime\":\"08:00\",\"endTime\":\"16:00\",\"professionalName\":\"Luna Sofía\"}")"
EID=$(req $A GET /users >/dev/null; jget "d.find(u=>u.username==='encuti').id")
check "cambiar permisos sin mandar alcance lo conserva" 200 "$(req $A PATCH /users/$EID '{"permissions":{"guardias":"editar"}}')"
SC=$(jget "JSON.stringify(d.scopes)"); [ "$SC" = "{\"guardias\":{\"alcance\":\"sector\",\"sectorIds\":[$UTI]}}" ] && ok "alcance conservado" || bad "conserva" "$SC"
check "no se borra un sector asignado a alguien" 409 "$(req $A DELETE /sectores/$UTI)"
check "borrar guardia propia" 204 "$(req $A DELETE /guardias/$GU)"

echo "== Perfiles vinculados y Ver como"
check "crear perfil Encargado" 201 "$(req $A POST /users/perfiles '{"nombre":"Encargado de sector","descripcion":"Ve y carga solo su sector","permisos":{"guardias":"editar","dashboard":"ver"},"alcances":{"guardias":"sector"}}')"
PF=$(jget d.id)
check "nombre de perfil repetido" 409 "$(req $A POST /users/perfiles '{"nombre":"encargado de SECTOR","permisos":{}}')"
check "responsable NO crea perfiles" 403 "$(req $R POST /users/perfiles '{"nombre":"X","permisos":{}}')"
check "perfil por sector sin sectores elegidos" 400 "$(req $A POST /users "{\"name\":\"Enc GC\",\"username\":\"encgc\",\"password\":\"prueba123\",\"perfilId\":$PF}")"
check "crear persona con perfil y su sector" 201 "$(req $A POST /users "{\"name\":\"Enc GC\",\"username\":\"encgc\",\"password\":\"prueba123\",\"perfilId\":$PF,\"permissions\":{\"guardias\":\"editar\",\"dashboard\":\"ver\"},\"scopes\":{\"guardias\":{\"alcance\":\"sector\",\"sectorIds\":[$GC]}}}")"
GID=$(jget d.id); X="$(jget d.perfilNombre)|$(jget "d.excepciones.length")|$(jget d.permissions.guardias)"
[ "$X" = "Encargado de sector|0|editar" ] && ok "vinculada sin excepciones ($X)" || bad "vínculo" "$X"
P=$T/ck_pf; req $P POST /auth/login '{"username":"encgc","password":"prueba123"}' >/dev/null
req $P GET '/guardias?from=2026-10-01&to=2026-11-30' >/dev/null
OTROS=$(jget "d.filter(g=>g.sectorId!==$GC).length"); [ "$OTROS" = "0" ] && ok "el perfil limita a su sector" || bad "perfil sector" "$OTROS"
check "cambiar el perfil (Guardias → Control total)" 200 "$(req $A PATCH /users/perfiles/$PF '{"permisos":{"guardias":"total","dashboard":"ver"}}')"
req $P GET /auth/me >/dev/null; L=$(jget d.permissions.guardias); [ "$L" = "total" ] && ok "la persona hereda el cambio ($L)" || bad "hereda" "$L"
check "excepción: Guardias solo Ver" 200 "$(req $A PATCH /users/$GID "{\"permissions\":{\"guardias\":\"ver\",\"dashboard\":\"ver\"},\"scopes\":{\"guardias\":{\"alcance\":\"sector\",\"sectorIds\":[$GC]}}}")"
X="$(jget "d.excepciones.join(',')")|$(jget d.permissions.guardias)"; [ "$X" = "guardias|ver" ] && ok "queda como excepción ($X)" || bad "excepción" "$X"
check "otro cambio del perfil" 200 "$(req $A PATCH /users/perfiles/$PF '{"permisos":{"guardias":"editar","dashboard":"ver","administracion":"ver"}}')"
req $P GET /auth/me >/dev/null; X="$(jget d.permissions.guardias)|$(jget d.permissions.administracion)"
[ "$X" = "ver|ver" ] && ok "la excepción se respeta y lo nuevo se hereda ($X)" || bad "mezcla" "$X"
check "volver al perfil" 200 "$(req $A PATCH /users/$GID "{\"permissions\":{\"guardias\":\"editar\",\"dashboard\":\"ver\",\"administracion\":\"ver\"},\"scopes\":{\"guardias\":{\"alcance\":\"sector\",\"sectorIds\":[$GC]}}}")"
X=$(jget "d.excepciones.length"); [ "$X" = "0" ] && ok "sin excepciones" || bad "volver" "$X"
check "lista de perfiles con usuarios" 200 "$(req $A GET /users/perfiles)"
N=$(jget "d.find(p=>p.id===$PF).usuarios"); [ "$N" = "1" ] && ok "1 persona vinculada" || bad "usuarios" "$N"
echo "-- Ver como"
check "responsable NO puede usar Ver como" 403 "$(req $R POST /auth/ver-como "{\"userId\":$GID}")"
check "superadmin: ver como Enc GC" 200 "$(req $A POST /auth/ver-como "{\"userId\":$GID}")"
check "auth/me muestra a quién ve" 200 "$(req $A GET /auth/me)"
X="$(jget d.verComo.name)|$(jget d.role)|$(jget d.permissions.guardias)"; [ "$X" = "Enc GC|usuario|editar" ] && ok "ve como Enc GC ($X)" || bad "ver como" "$X"
check "ver como: solo lee sus guardias" 200 "$(req $A GET '/guardias?from=2026-10-01&to=2026-11-30')"
OTROS=$(jget "d.filter(g=>g.sectorId!==$GC).length"); [ "$OTROS" = "0" ] && ok "ve exactamente lo que ve la persona" || bad "ver como lectura" "$OTROS"
check "ver como: no administra usuarios" 403 "$(req $A GET /users)"
check "ver como: no puede cargar (solo lectura)" 403 "$(req $A POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-11-20\",\"startTime\":\"08:00\",\"endTime\":\"16:00\",\"professionalName\":\"Luna Sofía\"}")"
C=$(jget d.codigo); [ "$C" = "ver_como" ] && ok "avisa que es solo lectura" || bad "codigo" "$C"
check "salir de ver como" 204 "$(req $A DELETE /auth/ver-como)"
check "de vuelta superadmin" 200 "$(req $A GET /users)"
echo "-- Borrar perfil"
check "eliminar perfil" 200 "$(req $A DELETE /users/perfiles/$PF)"
req $A GET /users >/dev/null
X="$(jget "d.find(u=>u.id===$GID).perfilId")|$(jget "d.find(u=>u.id===$GID).permissions.guardias")|$(jget "d.find(u=>u.id===$GID).scopes.guardias.sectorIds.join(',')")"
[ "$X" = "null|editar|$GC" ] && ok "la persona conserva sus permisos y sectores ($X)" || bad "materializa" "$X"

echo "== Acciones concretas por módulo"
check "Ver + la acción 'cargar'" 201 "$(req $A POST /users "{\"name\":\"Acc Uno\",\"username\":\"accuno\",\"password\":\"prueba123\",\"permissions\":{\"guardias\":\"ver\"},\"acciones\":{\"guardias\":[\"ver\",\"cargar\"]}}")"
X=$(jget "d.acciones.guardias.join(',')"); [ "$X" = "ver,cargar" ] && ok "acciones a medida guardadas ($X)" || bad "acciones" "$X"
A1=$T/ck_a1; req $A1 POST /auth/login '{"username":"accuno","password":"prueba123"}' >/dev/null
check "con 'cargar' carga aunque su nivel sea Ver" 201 "$(req $A1 POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-11-25\",\"startTime\":\"08:00\",\"endTime\":\"16:00\",\"professionalName\":\"Paz Lía\"}")"
GA=$(jget d.id)
check "sin 'eliminar' no borra" 403 "$(req $A1 DELETE /guardias/$GA)"
check "sin 'historial' no ve el historial" 403 "$(req $A1 GET /guardias/auditoria)"
check "sin 'copiar' no copia" 403 "$(req $A1 POST /guardias/copiar '{"fromStart":"2026-11-01","fromEnd":"2026-11-07","toStart":"2026-12-01"}')"
check "Control total sin 'eliminar'" 201 "$(req $A POST /users "{\"name\":\"Acc Dos\",\"username\":\"accdos\",\"password\":\"prueba123\",\"permissions\":{\"guardias\":\"total\",\"administracion\":\"editar\"},\"acciones\":{\"guardias\":[\"ver\",\"estadisticas\",\"exportar\",\"cargar\",\"copiar\",\"historial\",\"horarios\",\"profesionales\"],\"administracion\":[\"ver\",\"cargar\",\"verificar\",\"recurrentes\",\"contactos\"]}}")"
A2=$T/ck_a2; req $A2 POST /auth/login '{"username":"accdos","password":"prueba123"}' >/dev/null
check "Control total sin 'eliminar' no borra" 403 "$(req $A2 DELETE /guardias/$GA)"
check "pero configura horarios" 200 "$(req $A2 PUT /guardias/config/$GC '{"active":true,"cobertura":[]}')"
check "Administración: carga un ítem" 201 "$(req $A2 POST /administracion/items '{"titulo":"Prueba acciones","fecha":"2026-11-28","tipo":"pago"}')"
AI=$(jget d.id)
check "Administración: sin 'cumplir' no marca cumplido" 403 "$(req $A2 POST /administracion/items/$AI/cumplir '{}')"
check "Administración: sin 'calendario' no toca feriados" 403 "$(req $A2 POST /administracion/feriados '{"fecha":"2026-12-24","nombre":"Prueba","tipo":"puente"}')"
check "volver a las del nivel (sin acciones a medida)" 200 "$(req $A PATCH /users/$(req $A GET /users >/dev/null; jget "d.find(u=>u.username==='accuno').id") '{"permissions":{"guardias":"ver"},"acciones":{}}')"
X=$(jget "d.acciones.guardias.join(',')"); [ "$X" = "ver,estadisticas,exportar" ] && ok "vuelve a las típicas de Ver ($X)" || bad "nivel" "$X"
check "perfil con acciones a medida" 201 "$(req $A POST /users/perfiles '{"nombre":"Carga sin copiar","permisos":{"guardias":"editar"},"acciones":{"guardias":["ver","cargar"]}}')"
PA=$(jget d.id); X=$(jget "d.acciones.guardias.join(',')"); [ "$X" = "ver,cargar" ] && ok "el perfil guarda sus acciones ($X)" || bad "perfil acciones" "$X"
check "persona con ese perfil" 201 "$(req $A POST /users "{\"name\":\"Acc Tres\",\"username\":\"acctres\",\"password\":\"prueba123\",\"perfilId\":$PA}")"
AT=$(jget d.id); X="$(jget "d.acciones.guardias.join(',')")|$(jget "d.excepciones.length")"; [ "$X" = "ver,cargar|0" ] && ok "hereda las acciones del perfil ($X)" || bad "hereda acciones" "$X"
check "excepción: además puede copiar" 200 "$(req $A PATCH /users/$AT "{\"perfilId\":$PA,\"permissions\":{\"guardias\":\"editar\"},\"acciones\":{\"guardias\":[\"ver\",\"cargar\",\"copiar\"]}}")"
X="$(jget "d.acciones.guardias.join(',')")|$(jget "d.excepciones.join(',')")"; [ "$X" = "ver,cargar,copiar|guardias" ] && ok "acción extra como excepción ($X)" || bad "excepción acción" "$X"
check "borrar la guardia de prueba" 204 "$(req $A DELETE /guardias/$GA)"

echo "== Accesos con vencimiento e historial de permisos"
AYER=$(node -e "const d=new Date();d.setDate(d.getDate()-1);console.log(d.toLocaleDateString('sv-SE'))")
MANANA=$(node -e "const d=new Date();d.setDate(d.getDate()+1);console.log(d.toLocaleDateString('sv-SE'))")
EN3=$(node -e "const d=new Date();d.setDate(d.getDate()+3);console.log(d.toLocaleDateString('sv-SE'))")
check "cuenta temporaria (ya vencida)" 201 "$(req $A POST /users "{\"name\":\"Temp Uno\",\"username\":\"tempuno\",\"password\":\"prueba123\",\"permissions\":{\"guardias\":\"ver\"},\"accesoHasta\":\"$AYER\"}")"
TU=$(jget d.id); X="$(jget d.accesoVencido)"; [ "$X" = "true" ] && ok "marcada como vencida" || bad "vencida" "$X"
check "cuenta vencida no puede entrar" 403 "$(req $T/ck_tu POST /auth/login '{"username":"tempuno","password":"prueba123"}')"
C=$(jget d.codigo); [ "$C" = "acceso_vencido" ] && ok "avisa que venció el acceso" || bad "codigo vencido" "$C"
check "renovar el acceso hasta mañana" 200 "$(req $A PATCH /users/$TU "{\"accesoHasta\":\"$MANANA\"}")"
check "ahora entra" 200 "$(req $T/ck_tu POST /auth/login '{"username":"tempuno","password":"prueba123"}')"
check "permiso temporario vencido" 200 "$(req $A PATCH /users/$TU "{\"permissions\":{\"guardias\":\"ver\",\"administracion\":\"editar\"},\"vencimientos\":{\"administracion\":\"$AYER\"}}")"
X="$(jget "Object.keys(d.permissions).join(',')")|$(jget "d.vencidos.map(v=>v.modulo).join(',')")"; [ "$X" = "guardias|administracion" ] && ok "el permiso vencido no cuenta ($X)" || bad "permiso vencido" "$X"
req $T/ck_tu GET /auth/me >/dev/null; X=$(jget "d.permissions.administracion||'sin'"); [ "$X" = "sin" ] && ok "la sesión ya no lo tiene" || bad "sesión vencido" "$X"
check "permiso temporario vigente" 200 "$(req $A PATCH /users/$TU "{\"permissions\":{\"guardias\":\"ver\",\"administracion\":\"editar\"},\"vencimientos\":{\"administracion\":\"$EN3\"}}")"
X="$(jget d.permissions.administracion)|$(jget d.vencimientos.administracion)"; [ "$X" = "editar|$EN3" ] && ok "vigente hasta $EN3" || bad "vigente" "$X"
check "superadmin ve el aviso de vencimiento" 200 "$(req $A GET /notificaciones)"
X=$(jget "d.filter(n=>n.titulo.startsWith('Vence un permiso de Temp Uno')).length"); [ "$X" = "1" ] && ok "aviso de permiso por vencer" || bad "aviso" "$X"
check "perfil base para excepción temporaria" 201 "$(req $A POST /users/perfiles '{"nombre":"Solo ver guardias","permisos":{"guardias":"ver"}}')"
PB=$(jget d.id)
check "excepción temporaria vencida" 201 "$(req $A POST /users "{\"name\":\"Temp Dos\",\"username\":\"tempdos\",\"password\":\"prueba123\",\"perfilId\":$PB,\"permissions\":{\"guardias\":\"editar\"},\"vencimientos\":{\"guardias\":\"$AYER\"}}")"
X="$(jget d.permissions.guardias)|$(jget "d.excepciones.length")"; [ "$X" = "ver|0" ] && ok "vencida, vuelve a lo del perfil ($X)" || bad "vuelve al perfil" "$X"
check "historial de la persona" 200 "$(req $A GET "/users/historial?userId=$TU")"
X=$(jget "d.map(h=>h.accion).join(',')"); case "$X" in *cambio*alta*) ok "registra alta y cambios ($X)";; *) bad "historial" "$X";; esac
X=$(jget "d.some(h=>h.detalle.includes('Administración: sin acceso → Cargar y editar'))"); [ "$X" = "true" ] && ok "detalle legible del cambio" || bad "detalle" "$(jget "d.map(h=>h.detalle).join(' || ')" | head -c 300)"
X=$(jget "d.every(h=>h.actorNombre==='Sistemas')"); [ "$X" = "true" ] && ok "registra quién lo hizo" || bad "actor" "$X"
check "historial general" 200 "$(req $A GET /users/historial)"
X="$(jget "d.some(h=>h.accion==='ver_como')")|$(jget "d.some(h=>h.accion==='perfil_alta')")|$(jget "d.some(h=>h.accion==='perfil_baja')")"; [ "$X" = "true|true|true" ] && ok "registra Ver como y perfiles" || bad "historial general" "$X"
check "responsable NO ve el historial" 403 "$(req $R GET /users/historial)"

echo "== Inventario"
HOY=$(node -e "console.log(new Date().toLocaleDateString('sv-SE'))")
EN180=$(node -e "const d=new Date();d.setDate(d.getDate()+180);console.log(d.toLocaleDateString('sv-SE'))")
check "alta de equipo" 201 "$(req $A POST /inventario/items "{\"planta\":\"PB\",\"sectorId\":$GC,\"rubro\":\"Electromedicina\",\"tipo\":\"Monitor\",\"descripcion\":\"Monitor multiparamétrico\",\"marca\":\"Mindray\",\"codigoSerie\":\"MON-001\"}")"
I1=$(jget d.id); X="$(jget d.estado)|$(jget d.proximoControl)"; [ "$X" = "operativo|null" ] && ok "operativo y sin control periódico ($X)" || bad "alta" "$X"
check "sin descripción" 400 "$(req $A POST /inventario/items "{\"planta\":\"PB\",\"sectorId\":$GC,\"rubro\":\"X\",\"tipo\":\"Y\"}")"
check "código de serie repetido (otra grafía)" 409 "$(req $A POST /inventario/items "{\"planta\":\"PB\",\"sectorId\":$GC,\"rubro\":\"X\",\"tipo\":\"Y\",\"descripcion\":\"Z\",\"codigoSerie\":\"mon-001\"}")"
check "plan de controles: matafuegos semestral" 200 "$(req $A PUT /inventario/planes '{"tipo":"Matafuego","frecuenciaDias":"semestral","aplicar":"ninguno"}')"
check "alta toma el plan del tipo" 201 "$(req $A POST /inventario/items "{\"planta\":\"pb\",\"sectorId\":$GC,\"rubro\":\"Seguridad\",\"tipo\":\"matafuego\",\"descripcion\":\"Matafuego ABC 5 kg\",\"codigoSerie\":\"MAT-01\"}")"
I2=$(jget d.id); X="$(jget d.frecuenciaDias)|$(jget d.proximoControl)|$(jget d.planta)"; [ "$X" = "180|$EN180|PB" ] && ok "cada 180 días, próximo $EN180, reutiliza «PB» ($X)" || bad "plan" "$X"
check "control OK" 201 "$(req $A POST /inventario/items/$I2/registros "{\"tipo\":\"control\",\"fecha\":\"$HOY\",\"resultado\":\"ok\",\"responsable\":\"Técnico\"}")"
X="$(jget d.ultimoControl)|$(jget d.proximoControl)"; [ "$X" = "$HOY|$EN180" ] && ok "actualiza último y próximo control" || bad "control" "$X"
check "falla sin detalle" 400 "$(req $A POST /inventario/items/$I2/registros '{"tipo":"falla"}')"
check "reportar falla" 201 "$(req $A POST /inventario/items/$I2/registros '{"tipo":"falla","detalle":"Manómetro en rojo"}')"
X=$(jget d.estado); [ "$X" = "con_falla" ] && ok "queda con falla" || bad "falla" "$X"
check "registrar reparación" 201 "$(req $A POST /inventario/items/$I2/registros '{"tipo":"reparacion","detalle":"Recarga"}')"
X=$(jget d.estado); [ "$X" = "operativo" ] && ok "vuelve a operativo" || bad "reparación" "$X"
check "historia del equipo" 200 "$(req $A GET /inventario/items/$I2)"
X=$(jget "d.registros.map(r=>r.tipo).join(',')"); [ "$X" = "reparacion,falla,control,alta" ] && ok "registro completo ($X)" || bad "historia" "$X"
echo "-- importación"
FILAS='[
 {"planta":"Planta baja","sector":"guardia central","rubro":"Informática","tipo":"PC","descripcion":"PC escritorio","marca":"Dell","codigoSerie":"PC-1"},
 {"planta":"PB","sector":"Guardia Central","rubro":"Informática","tipo":"","descripcion":"Sin tipo","marca":"","codigoSerie":""},
 {"planta":"PB","sector":"Pediatría Inexistente","rubro":"X","tipo":"Y","descripcion":"Sector malo","marca":"","codigoSerie":""},
 {"planta":"PB","sector":"Guardia Central","rubro":"X","tipo":"Y","descripcion":"Serie ya cargada","marca":"","codigoSerie":"MON-001"},
 {"planta":"PB","sector":"Guardia Central","rubro":"X","tipo":"Y","descripcion":"Serie repetida en el archivo","marca":"","codigoSerie":"pc-1"},
 {"planta":"1° piso","sector":"UTI Neo","rubro":"Electromedicina","tipo":"Incubadora","descripcion":"Incubadora neonatal","marca":"Dräger","codigoSerie":"INC-7","estado":"con falla","frecuencia":"Anual","ultimoControl":"2026-01-10"}
]'
check "simular importación" 200 "$(req $A POST /inventario/importar "{\"modo\":\"agregar\",\"simular\":true,\"filas\":$FILAS}")"
X="$(jget "[d.resumen.nuevos,d.resumen.errores].join(',')")"; [ "$X" = "2,4" ] && ok "2 nuevos y 4 con error ($X)" || bad "simulación" "$X"
X=$(jget "d.filas.filter(f=>f.estado==='error').map(f=>f.fila).join(',')"); [ "$X" = "3,4,5,6" ] && ok "marca las filas con error ($X)" || bad "filas error" "$X"
X=$(jget "d.filas.find(f=>f.fila===4).mensajes[0]"); case "$X" in *"no existe"*) ok "explica el error (sector inexistente)";; *) bad "mensaje" "$X";; esac
req $A GET /inventario/items >/dev/null; N0=$(jget d.length)
check "importar de verdad" 200 "$(req $A POST /inventario/importar "{\"modo\":\"agregar\",\"simular\":false,\"filas\":$FILAS}")"
req $A GET /inventario/items >/dev/null; N1=$(jget d.length); [ "$((N1-N0))" = "2" ] && ok "cargó solo las 2 filas válidas" || bad "importó" "$N0 → $N1"
X=$(jget "(e=>e.estado+'|'+e.frecuenciaDias+'|'+e.ultimoControl)(d.find(e=>e.codigoSerie==='INC-7'))"); [ "$X" = "con_falla|365|2026-01-10" ] && ok "toma estado, frecuencia y último control ($X)" || bad "opcionales" "$X"
X=$(jget "d.find(e=>e.codigoSerie==='PC-1').sectorName"); [ "$X" = "Guardia Central" ] && ok "reconoce el sector sin mayúsculas" || bad "sector" "$X"
check "actualizar existentes por código de serie" 200 "$(req $A POST /inventario/importar "{\"modo\":\"actualizar\",\"simular\":false,\"filas\":[{\"planta\":\"PB\",\"sector\":\"Guardia Central\",\"rubro\":\"Electromedicina\",\"tipo\":\"Monitor\",\"descripcion\":\"Monitor multiparamétrico\",\"marca\":\"Mindray Pro\",\"codigoSerie\":\"MON-001\"}]}")"
X=$(jget "d.resumen.actualizados"); [ "$X" = "1" ] && ok "1 actualizado" || bad "actualizar" "$X"
req $A GET /inventario/items/$I1 >/dev/null; X="$(jget d.marca)|$(jget "d.registros[0].tipo")"; [ "$X" = "Mindray Pro|cambio" ] && ok "cambio con historia ($X)" || bad "actualizado" "$X"
echo "-- permisos y sectores"
check "encargado de UTI (inventario)" 201 "$(req $A POST /users "{\"name\":\"Inv UTI\",\"username\":\"invuti\",\"password\":\"prueba123\",\"permissions\":{\"inventario\":\"editar\"},\"scopes\":{\"inventario\":{\"alcance\":\"sector\",\"sectorIds\":[$UTI]}}}")"
IU=$T/ck_iu; req $IU POST /auth/login '{"username":"invuti","password":"prueba123"}' >/dev/null
check "ve el inventario" 200 "$(req $IU GET /inventario/items)"
X=$(jget "d.filter(e=>e.sectorId!==$UTI).length+'|'+d.length"); [ "$X" = "0|1" ] && ok "solo los equipos de UTI ($X)" || bad "alcance" "$X"
check "no carga en otro sector" 403 "$(req $IU POST /inventario/items "{\"planta\":\"PB\",\"sectorId\":$GC,\"rubro\":\"X\",\"tipo\":\"Y\",\"descripcion\":\"Z\"}")"
check "no ve equipos de otro sector" 404 "$(req $IU GET /inventario/items/$I1)"
check "sin 'importar' no importa" 403 "$(req $IU POST /inventario/importar '{"filas":[{}]}')"
INC=$(req $IU GET /inventario/items >/dev/null; jget "d[0].id")
check "registra controles en su sector" 201 "$(req $IU POST /inventario/items/$INC/registros '{"tipo":"control","resultado":"observacion","detalle":"Revisar sensor"}')"
check "solo-lectura (Ver)" 201 "$(req $A POST /users '{"name":"Inv Ver","username":"invver","password":"prueba123","permissions":{"inventario":"ver"}}')"
IV=$T/ck_iv; req $IV POST /auth/login '{"username":"invver","password":"prueba123"}' >/dev/null
check "Ver: lee el registro" 200 "$(req $IV GET '/inventario/registros?tipo=control')"
check "Ver: no registra controles" 403 "$(req $IV POST /inventario/items/$I1/registros '{"tipo":"control"}')"
check "Ver: no da de alta" 403 "$(req $IV POST /inventario/items "{\"planta\":\"PB\",\"sectorId\":$GC,\"rubro\":\"X\",\"tipo\":\"Y\",\"descripcion\":\"Z\"}")"
echo "-- lote, baja, catálogos"
check "cambiar frecuencia a varios" 200 "$(req $A PATCH /inventario/lote "{\"ids\":[$I1,$I2],\"cambios\":{\"frecuenciaDias\":90}}")"
X=$(jget d.actualizados); [ "$X" = "2" ] && ok "2 actualizados" || bad "lote" "$X"
check "control de varios a la vez" 201 "$(req $A POST /inventario/registros/lote "{\"ids\":[$I1,$I2],\"tipo\":\"control\",\"resultado\":\"ok\"}")"
X=$(jget d.registrados); [ "$X" = "2" ] && ok "2 controles registrados" || bad "control lote" "$X"
check "dar de baja" 200 "$(req $A POST /inventario/items/$I1/baja '{"motivo":"Reemplazado"}')"
req $A GET /inventario/items >/dev/null; X=$(jget "d.some(e=>e.id===$I1)"); [ "$X" = "false" ] && ok "no aparece entre los activos" || bad "baja" "$X"
req $A GET '/inventario/items?bajas=1' >/dev/null; X=$(jget "d.find(e=>e.id===$I1).estado"); [ "$X" = "baja" ] && ok "sí con bajas" || bad "bajas" "$X"
check "reactivar" 200 "$(req $A POST /inventario/items/$I1/reactivar '{}')"
check "unificar planta «PB» → «Planta baja»" 200 "$(req $A POST /inventario/catalogos/renombrar '{"campo":"planta","de":"pb","a":"Planta baja"}')"
req $A GET /inventario/catalogos >/dev/null; X=$(jget "d.plantas.map(p=>p.valor).join(',')"); case "$X" in *PB*) bad "unificar" "$X";; *"Planta baja"*) ok "plantas unificadas ($X)";; *) bad "unificar" "$X";; esac
check "superadmin: aviso de equipo con falla" 200 "$(req $A GET /notificaciones)"
X=$(jget "d.some(n=>n.modulo==='inventario'&&n.titulo.includes('con falla'))"); [ "$X" = "true" ] && ok "aviso de inventario" || bad "aviso" "$X"
check "buscador encuentra equipos" 200 "$(req $A GET '/buscar?q=INC-7')"
X=$(jget "d.filter(r=>r.tipo==='equipo').length"); [ "$X" = "1" ] && ok "por código de serie" || bad "buscar" "$X"
echo "-- lista de verificación y reparaciones"
check "plan con lista de verificación (sin frecuencia)" 200 "$(req $A PUT /inventario/planes '{"tipo":"Incubadora","frecuenciaDias":null,"aplicar":"ninguno","checklist":["Temperatura","Alarmas"," temperatura ",""]}')"
X=$(jget "d.checklist.join(',')"); [ "$X" = "Temperatura,Alarmas" ] && ok "lista limpia ($X)" || bad "checklist" "$X"
req $A GET /inventario/catalogos >/dev/null; X=$(jget "JSON.stringify(d.planes.find(p=>p.tipo==='Incubadora'))"); case "$X" in *'"frecuenciaDias":null'*'"checklist":["Temperatura","Alarmas"]'*) ok "el plan queda sin frecuencia y con lista";; *) bad "plan" "$X";; esac
check "control sin marcar un punto" 400 "$(req $A POST /inventario/items/$INC/registros '{"tipo":"control","checklist":[{"item":"Temperatura","estado":"ok"},{"item":"Alarmas"}]}')"
check "control con un punto en falla" 201 "$(req $A POST /inventario/items/$INC/registros '{"tipo":"control","checklist":[{"item":"Temperatura","estado":"ok"},{"item":"Alarmas","estado":"falla","nota":"No suena"}]}')"
X=$(jget d.estado); [ "$X" = "con_falla" ] && ok "el peor punto define el resultado (queda con falla)" || bad "resultado checklist" "$X"
req $A GET /inventario/items/$INC >/dev/null; X="$(jget "d.registros[0].resultado")|$(jget "d.registros[0].detalle")|$(jget "d.registros[0].checklist.length")"; [ "$X" = "falla|Alarmas: No suena|2" ] && ok "guarda los puntos y arma el detalle ($X)" || bad "registro checklist" "$X"
check "enviar a reparación" 201 "$(req $A POST /inventario/items/$INC/registros '{"tipo":"envio","proveedor":"Service Dräger","detalle":"Alarma"}')"
X=$(jget d.estado); [ "$X" = "en_reparacion" ] && ok "queda en reparación" || bad "envío" "$X"
check "reparado" 201 "$(req $A POST /inventario/items/$INC/registros '{"tipo":"reparacion","proveedor":"Service Dräger","detalle":"Cambio de parlante"}')"
X="$(jget d.estado)|$(jget d.ultimoControl)"; [ "$X" = "operativo|$HOY" ] && ok "vuelve a operativo y cuenta como revisión ($X)" || bad "reparado" "$X"
check "registro de envíos" 200 "$(req $A GET '/inventario/registros?tipo=envio')"
X=$(jget "d[0].proveedor"); [ "$X" = "Service Dräger" ] && ok "guarda el proveedor" || bad "proveedor" "$X"
check "eliminar equipo" 204 "$(req $A DELETE /inventario/items/$I2)"

echo "== Importar sectores"
FS='[{"nombre":"guardia  central","fila":2},{"nombre":"Laboratorio","fila":3},{"nombre":"Sala de Rayos X","abreviatura":"RX","fila":4},{"nombre":"laboratorio","fila":5},{"nombre":"","abreviatura":"ZZ","fila":6},{"nombre":"Hemoterapia","abreviatura":"GCE","fila":7}]'
check "responsable NO importa sectores" 403 "$(req $R POST /sectores/importar "{\"filas\":$FS}")"
check "simular importación de sectores" 200 "$(req $A POST /sectores/importar "{\"simular\":true,\"filas\":$FS}")"
X="$(jget "[d.resumen.nuevos,d.resumen.existentes,d.resumen.repetidos,d.resumen.errores].join(',')")"; [ "$X" = "3,1,1,1" ] && ok "3 nuevos, 1 existente, 1 repetido, 1 error ($X)" || bad "simulación sectores" "$X"
X="$(jget "d.filas.filter(f=>f.estado==='nuevo').map(f=>f.abreviatura).join(',')")"; case "$X" in LAB,RX,H*) ok "abreviaturas: automática, la del archivo y la usada se reemplaza ($X)";; *) bad "abreviaturas" "$X";; esac
req $A GET /sectores >/dev/null; N0=$(jget d.length)
check "importar sectores" 200 "$(req $A POST /sectores/importar "{\"simular\":false,\"filas\":$FS}")"
req $A GET /sectores >/dev/null; N1=$(jget d.length); [ "$((N1-N0))" = "3" ] && ok "creó solo los 3 nuevos" || bad "importar sectores" "$N0 → $N1"
X=$(jget "d.filter(s=>['Laboratorio','Sala de Rayos X','Hemoterapia'].includes(s.name)).every(s=>s.active)"); [ "$X" = "true" ] && ok "quedan activos" || bad "activos" "$X"
req $A GET /guardias/config >/dev/null; X=$(jget "d.filter(s=>['Laboratorio','Sala de Rayos X','Hemoterapia'].includes(s.name)&&s.active).length"); [ "$X" = "0" ] && ok "no participan de Guardias" || bad "guardias" "$X"
check "importar de nuevo: todo se omite" 200 "$(req $A POST /sectores/importar "{\"simular\":false,\"filas\":$FS}")"
X=$(jget d.resumen.nuevos); [ "$X" = "0" ] && ok "no duplica" || bad "duplica" "$X"
check "alta con nombre repetido" 409 "$(req $A POST /sectores '{"name":"LABORATORIO"}')"
check "alta sin abreviatura" 201 "$(req $A POST /sectores '{"name":"Unidad Coronaria"}')"
X=$(jget d.shortName); [ "$X" = "UC" ] && ok "abreviatura automática ($X)" || bad "abrev" "$X"

echo "== Administración: ítems"
E=$T/ck_admed
check "crear usuario Administración=editar" 201 "$(req $A POST /users '{"name":"Laura Adm","username":"laura","password":"prueba123","permissions":{"administracion":"editar"}}')"
check "login laura" 200 "$(req $E POST /auth/login '{"username":"laura","password":"prueba123"}')"
check "crear pago" 201 "$(req $A POST /administracion/items '{"titulo":"Pago proveedor","tipo":"pago","fecha":"2026-10-20","alertDays":0,"monto":"1.250,50"}')"
AID=$(jget d.id); [ "$(jget d.alertDays)" = "0" ] && ok "alertDays 0 se respeta" || bad "alertDays" "$(body)"
check "tipo inválido" 400 "$(req $A POST /administracion/items '{"titulo":"x","tipo":"raro","fecha":"2026-10-20"}')"
check "fecha inválida (31/02)" 400 "$(req $A POST /administracion/items '{"titulo":"x","fecha":"2026-02-31"}')"
check "cheque con datos" 201 "$(req $E POST /administracion/items '{"titulo":"Cheque droguería","tipo":"cheque","fecha":"2026-10-25","monto":"500000","datos":{"direccion":"emitido","numero":"778899","banco":"Nación","echeq":true,"<script>":"x"}}')"
CHQ=$(jget d.id); [ "$(jget "d.datos.numero+':'+d.datos.echeq+':'+Object.keys(d.datos).length")" = "778899:true:4" ] && ok "datos del cheque (claves raras descartadas)" || bad "datos cheque" "$(body)"
check "editar" 200 "$(req $E PATCH /administracion/items/$AID '{"responsable":"Laura","fecha":"2026-10-21"}')"
check "cumplir pago" 200 "$(req $E POST /administracion/items/$AID/cumplir '{"comprobante":"TRF-1","montoPagado":"1.250,50"}')"
[ "$(jget "d.item.estado+':'+d.item.comprobante")" = "cumplido:TRF-1" ] && ok "queda cumplido con comprobante" || bad "cumplir" "$(body)"
check "historial del ítem" 200 "$(req $A GET /administracion/items/$AID)"; [ "$(jget "d.historial.map(h=>h.accion).reverse().join(',')")" = "creado,editado,cumplido" ] && ok "historial creado→editado→cumplido" || bad "historial" "$(body)"
check "filtro estado=cumplido" 200 "$(req $A GET '/administracion/items?estado=cumplido&tipo=pago')"; [ "$(jget d.length)" = "1" ] && ok "filtro devuelve 1" || bad "filtro" "$(body)"
check "buscar por número de cheque" 200 "$(req $A GET '/administracion/items?q=778899')"; [ "$(jget d.length)" = "1" ] && ok "busca dentro de los datos" || bad "q" "$(body)"
check "reabrir" 200 "$(req $E POST /administracion/items/$AID/reabrir '{}')"; [ "$(jget d.estado)" = "pendiente" ] && ok "vuelve a pendiente" || bad "reabrir" "$(body)"
check "cancelar con motivo" 200 "$(req $E POST /administracion/items/$CHQ/cancelar '{"motivo":"se anuló"}')"
check "con Editar NO elimina" 403 "$(req $E DELETE /administracion/items/$CHQ)"
check "documento" 201 "$(req $A POST /administracion/items '{"titulo":"Póliza RC","tipo":"documento","fecha":"2026-11-30","datos":{"categoria":"Seguro / póliza","entidad":"La Segunda"}}')"; DOC=$(jget d.id)
check "cumplir y renovar" 200 "$(req $A POST /administracion/items/$DOC/cumplir '{"renovarFecha":"2027-11-30"}')"
[ "$(jget "d.renovado.fecha+':'+d.renovado.datos.entidad")" = "2027-11-30:La Segunda" ] && ok "crea el próximo vencimiento" || bad "renovar" "$(body)"
check "resumen" 200 "$(req $E GET /administracion/resumen)"; [ "$(jget "Array.isArray(d.pendientes)&&typeof d.fiscal.total")" = "number" ] && ok "resumen con pendientes y fiscal" || bad "resumen" "$(body)"

echo "== Administración: fiscal"
check "obligaciones precargadas" 200 "$(req $A GET /administracion/obligaciones)"; [ "$(jget d.length)" = "7" ] && ok "7 obligaciones" || bad "obligaciones" "$(body)"
IVA=$(jget "d.find(o=>o.codigo==='IVA_DJ').id")
check "generar mar-2027" 200 "$(req $E POST /administracion/fiscal/generar '{"anio":2027,"mes":3}')"; [ "$(jget d.creados)" = "7" ] && ok "7 creados" || bad "generar" "$(body)"
check "regenerar no duplica" 200 "$(req $E POST /administracion/fiscal/generar '{"anio":2027,"mes":3}')"; [ "$(jget d.creados)" = "0" ] && ok "0 al regenerar" || bad "idempotencia" "$(body)"
check "mes fiscal" 200 "$(req $A GET '/administracion/fiscal?anio=2027&mes=3')"
[ "$(jget "d.filas.find(f=>f.obligacion.codigo==='IVA_DJ').origen")" = "estimada" ] && ok "sin calendario: fecha estimada" || bad "estimada" "$(body)"
IVAITEM=$(jget "d.filas.find(f=>f.obligacion.codigo==='IVA_DJ').item.id")
check "fecha oficial (solo Control total)" 403 "$(req $E PUT /administracion/calendario "{\"obligacionId\":$IVA,\"anio\":2027,\"mes\":3,\"fecha\":\"2027-03-19\"}")"
check "cargar fecha oficial" 200 "$(req $A PUT /administracion/calendario "{\"obligacionId\":$IVA,\"anio\":2027,\"mes\":3,\"fecha\":\"2027-03-19\",\"norma\":\"RG prueba\"}")"
check "el vencimiento toma la fecha oficial" 200 "$(req $A GET /administracion/items/$IVAITEM)"; [ "$(jget "d.fecha+':'+d.fechaOrigen")" = "2027-03-19:oficial" ] && ok "fecha 19/03 oficial" || bad "sync calendario" "$(body)"
check "prórroga" 200 "$(req $A PUT /administracion/calendario "{\"obligacionId\":$IVA,\"anio\":2027,\"mes\":3,\"fecha\":\"2027-03-24\",\"origen\":\"prorroga\",\"norma\":\"RG 9999\"}")"
req $A GET /administracion/items/$IVAITEM >/dev/null; [ "$(jget "d.fecha+':'+d.fechaOrigen")" = "2027-03-24:prorroga" ] && ok "prórroga aplicada al vencimiento" || bad "prorroga" "$(body)"
check "pegar fechas del año" 200 "$(req $A POST /administracion/calendario/lote "{\"obligacionId\":$IVA,\"anio\":2027,\"texto\":\"IVA 6-7: 21/01/2027  22/02/2027 18/04/2027 2026-12-01\"}")"
[ "$(jget "d.cargadas+':'+d.meses.join(',')+':'+d.ignoradas.length")" = "3:1,2,4:1" ] && ok "toma 3 fechas de 2027 e ignora la de 2026" || bad "lote" "$(body)"
check "calendario anual" 200 "$(req $A GET '/administracion/calendario?anio=2027')"; [ "$(jget "d.celdas[$IVA][1].fecha+':'+d.celdas[$IVA][5].origen")" = "2027-01-21:estimada" ] && ok "celdas oficiales y estimadas" || bad "calendario" "$(body)"
check "fecha manual en un fiscal" 200 "$(req $E PATCH /administracion/items/$IVAITEM '{"fecha":"2027-03-25"}')"; [ "$(jget d.fechaOrigen)" = "manual" ] && ok "queda como manual" || bad "manual" "$(body)"
req $A POST /administracion/fiscal/generar '{"anio":2027,"mes":3}' >/dev/null; req $A GET /administracion/items/$IVAITEM >/dev/null
[ "$(jget d.fecha)" = "2027-03-25" ] && ok "la automatización no pisa la fecha manual" || bad "manual pisado" "$(body)"
check "fiscal: solo presentado" 200 "$(req $E POST /administracion/items/$IVAITEM/cumplir '{"presentado":true,"pagado":false}')"; [ "$(jget d.item.estado)" = "pendiente" ] && ok "sigue pendiente hasta pagar" || bad "avance" "$(body)"
check "fiscal: pagado" 200 "$(req $E POST /administracion/items/$IVAITEM/cumplir '{"pagado":true,"comprobante":"VEP 123"}')"; [ "$(jget "d.item.estado+':'+d.item.presentado")" = "cumplido:true" ] && ok "cumplido con presentación y pago" || bad "cumplido" "$(body)"
check "no se borra un fiscal generado" 409 "$(req $A DELETE /administracion/items/$IVAITEM)"
check "verificar mes (Editar)" 200 "$(req $E POST /administracion/calendario/verificar '{"anio":2027,"mes":3}')"
req $A GET '/administracion/fiscal?anio=2027&mes=3' >/dev/null; [ "$(jget "d.filas.every(f=>f.verificado&&f.origen!=='estimada')")" = "true" ] && ok "todo el mes verificado" || bad "verificar" "$(body)"
check "importar agenda (solo Control total)" 403 "$(req $E POST /administracion/calendario/importar "{\"anio\":2027,\"filas\":[{\"obligacionId\":$IVA,\"fecha\":\"2027-06-23\"}]}")"
check "importar agenda" 200 "$(req $A POST /administracion/calendario/importar "{\"anio\":2027,\"norma\":\"Agenda ARCA 2027\",\"filas\":[{\"obligacionId\":$IVA,\"fecha\":\"2027-06-23\"},{\"obligacionId\":$IVA,\"fecha\":\"2027-07-22\"},{\"obligacionId\":$IVA,\"fecha\":\"2026-07-22\"}],\"claves\":[{\"obligacionId\":$IVA,\"texto\":\"Impuesto al Valor Agregado — DJ mensual\"}]}")"
[ "$(jget "d.cargadas+':'+d.aprendidas")" = "2:1" ] && ok "2 fechas (descarta otro año) y aprende 1 clave" || bad "importar" "$(body)"
req $A GET /administracion/obligaciones >/dev/null; [ "$(jget "d.find(o=>o.id===$IVA).claves.includes('impuesto al valor agregado — dj mensual')")" = "true" ] && ok "clave guardada sin tildes" || bad "claves" "$(body)"
check "recordatorio mensual automático" 200 "$(req $A GET "/administracion/items?tipo=tarea&q=Verificar%20fechas%20fiscales")"
[ "$(jget "d.filter(i=>i.estado==='pendiente'&&i.datos.sistema).length")" = "1" ] && ok "tarea «Verificar fechas fiscales» creada" || bad "tarea sistema" "$(body)"
check "verificar el mes en curso" 200 "$(req $E POST /administracion/calendario/verificar "{\"anio\":$(date +%Y),\"mes\":$((10#$(date +%m)))}")"
req $A GET "/administracion/items?tipo=tarea&q=Verificar%20fechas%20fiscales" >/dev/null; [ "$(jget "d.filter(i=>i.datos.sistema).every(i=>i.estado==='cumplido')")" = "true" ] && ok "la tarea se cierra sola al verificar" || bad "cierre tarea" "$(body)"
check "nueva obligación anual" 201 "$(req $A POST /administracion/obligaciones '{"nombre":"Ganancias Sociedades — DJ anual","periodicidad":"anual","mesAnual":5,"diaEstimado":15,"desfasePeriodo":-12}')"
OB=$(jget d.id); [ "$(jget d.codigo)" = "GANANCIAS_SOCIEDADES_DJ_ANUAL" ] && ok "código generado" || bad "codigo" "$(body)"
check "anual sin mes" 400 "$(req $A POST /administracion/obligaciones '{"nombre":"X","periodicidad":"anual"}')"
check "con Editar NO crea obligaciones" 403 "$(req $E POST /administracion/obligaciones '{"nombre":"X"}')"
check "borrar obligación sin uso" 204 "$(req $A DELETE /administracion/obligaciones/$OB)"
check "borrar obligación con vencimientos" 409 "$(req $A DELETE /administracion/obligaciones/$IVA)"

echo "== Administración: feriados, recurrentes y contactos"
check "feriado manual" 201 "$(req $A POST /administracion/feriados '{"fecha":"2027-03-22","nombre":"Puente de prueba","tipo":"puente"}')"
check "feriados 2027" 200 "$(req $A GET '/administracion/feriados?anio=2027')"; [ "$(jget d.length)" = "1" ] && ok "1 feriado cargado" || bad "feriados" "$(body)"
check "con Editar NO borra feriados" 403 "$(req $E DELETE /administracion/feriados/2027-03-22)"
check "borrar feriado" 204 "$(req $A DELETE /administracion/feriados/2027-03-22)"
check "recurrente mensual" 201 "$(req $E POST /administracion/recurrentes "{\"titulo\":\"Alquiler depósito\",\"tipo\":\"pago\",\"frecuencia\":\"mensual\",\"dia\":10,\"desde\":\"$(date +%Y-%m)-01\",\"monto\":\"300000\"}")"
REC=$(jget d.id); [ "$(jget "d.generados>=2")" = "true" ] && ok "genera las próximas fechas" || bad "recurrente" "$(body)"
check "ítems del recurrente" 200 "$(req $A GET '/administracion/items?q=Alquiler')"; N1=$(jget d.length); RI=$(jget "d[d.length-1].id")
check "borrar una fecha del recurrente" 204 "$(req $A DELETE /administracion/items/$RI)"
check "editar recurrente" 200 "$(req $E PATCH /administracion/recurrentes/$REC '{"monto":"350000"}')"
req $A GET '/administracion/items?q=Alquiler' >/dev/null; [ "$(jget d.length)" = "$((N1-1))" ] && ok "la fecha borrada no vuelve" || bad "omitidas" "$(body)"
check "listar recurrentes" 200 "$(req $A GET /administracion/recurrentes)"; [ "$(jget "d[0].proxima===null?'no':'si'")" = "si" ] && ok "muestra la próxima fecha" || bad "proxima" "$(body)"
check "contacto" 201 "$(req $E POST /administracion/contactos '{"nombre":"Estudio Contable Pérez","rubro":"Contador","telefono":"351 555-0000"}')"; CT=$(jget d.id)
check "contacto sin nombre" 400 "$(req $E POST /administracion/contactos '{"rubro":"x"}')"
check "con Editar NO borra contactos" 403 "$(req $E DELETE /administracion/contactos/$CT)"
check "borrar contacto" 204 "$(req $A DELETE /administracion/contactos/$CT)"
check "responsables" 200 "$(req $A GET /administracion/responsables)"; [ "$(jget "d.includes('Laura')")" = "true" ] && ok "incluye responsables usados" || bad "responsables" "$(body)"

echo "== Dashboard"
check "summary" 200 "$(req $A GET /dashboard/summary)"; echo "  $(body)"
check "activity" 200 "$(req $A GET '/dashboard/activity?limit=5')"; echo "  $(body | head -c 300)"

echo "== Permisos por nivel"
P=$T/ck_ana
check "crear usuaria con Guardias=ver y Administración=editar" 201 "$(req $A POST /users '{"name":"Ana Nivel","username":"ana","password":"prueba123","permissions":{"guardias":"ver","administracion":"editar","inventario":"nada","usuarios":"total"}}')"
ANA=$(jget d.id); PERMS=$(jget "JSON.stringify(d.permissions)")
[ "$PERMS" = '{"guardias":"ver","administracion":"editar"}' ] && ok "solo se guardan módulos y niveles válidos" || bad "permisos guardados" "$PERMS"
check "login ana" 200 "$(req $P POST /auth/login '{"username":"ana","password":"prueba123"}')"
check "/auth/me trae permisos" 200 "$(req $P GET /auth/me)"; [ "$(jget d.permissions.administracion)" = "editar" ] && ok "me.permissions.administracion = editar" || bad "me" "$(body)"
check "inicio según permisos" 200 "$(req $P GET /inicio)"; [ "$(jget "!!d.administracion+':'+!!d.guardias+':'+!!d.sistema")" = "true:true:false" ] && ok "Inicio: Administración y Guardias, sin Sistemas" || bad "inicio" "$(body | head -c 200)"
check "inicio del superadmin" 200 "$(req $A GET /inicio)"; [ "$(jget "d.sistema.db+':'+d.guardias.todosLosSectores")" = "ok:true" ] && ok "Inicio superadmin con Sistemas y todos los sectores" || bad "inicio super" "$(body | head -c 200)"
check "ver guardias" 200 "$(req $P GET '/guardias?from=2026-10-01&to=2026-10-31')"
check "con Ver NO carga guardias" 403 "$(req $P POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-11-02\",\"startTime\":\"08:00\",\"endTime\":\"12:00\",\"professionalName\":\"Prueba Nivel\"}")"
check "con Editar crea en Administración" 201 "$(req $P POST /administracion/items '{"titulo":"Item de Ana","fecha":"2026-11-10"}')"; AITEM=$(jget d.id)
check "con Editar cumple" 200 "$(req $P POST /administracion/items/$AITEM/cumplir '{}')"
check "con Editar NO elimina" 403 "$(req $P DELETE /administracion/items/$AITEM)"
check "con Editar NO carga el calendario oficial" 403 "$(req $P PUT /administracion/calendario '{"obligacionId":1,"anio":2027,"mes":1,"fecha":"2027-01-20"}')"
check "sin acceso a Inventario" 403 "$(req $P GET /inventario)"
check "no administra usuarios" 403 "$(req $P GET /users)"
check "subir Guardias a editar" 200 "$(req $A PATCH /users/$ANA '{"permissions":{"guardias":"editar","administracion":"editar"}}')"
check "con Editar carga guardia" 201 "$(req $P POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-11-02\",\"startTime\":\"08:00\",\"endTime\":\"12:00\",\"professionalName\":\"Prueba Nivel\"}")"; GN=$(jget d.id)
check "con Editar NO borra guardia" 403 "$(req $P DELETE /guardias/$GN)"
check "con Editar NO configura sectores" 403 "$(req $P PUT /guardias/config/$GC '{"active":true,"cobertura":[]}')"
check "con Editar ve historial de cambios" 200 "$(req $P GET '/guardias/auditoria?limit=5')"
check "subir Guardias a total" 200 "$(req $A PATCH /users/$ANA '{"permissions":{"guardias":"total","administracion":"editar"}}')"
check "con Control total borra guardia" 204 "$(req $P DELETE /guardias/$GN)"
check "Resumen admite solo Ver (total se recorta)" 200 "$(req $A PATCH /users/$ANA '{"permissions":{"dashboard":"total"}}')"; [ "$(jget d.permissions.dashboard)" = "ver" ] && ok "dashboard recortado a ver" || bad "dashboard" "$(body)"

echo "== Protecciones de superadmin"
SA=$(req $A GET /auth/me >/dev/null; jget d.id)
check "no podés quitarte superadmin" 400 "$(req $A PATCH /users/$SA '{"role":"usuario"}')"
check "no podés desactivarte" 400 "$(req $A PATCH /users/$SA '{"active":false}')"
check "no podés eliminarte" 400 "$(req $A DELETE /users/$SA)"
check "crear segundo superadmin" 201 "$(req $A POST /users '{"name":"Otro Admin","username":"admin2","password":"prueba123","role":"superadmin"}')"; S2=$(jget d.id)
check "bajar al segundo superadmin a usuario" 200 "$(req $A PATCH /users/$S2 '{"role":"usuario","permissions":{"dashboard":"ver"}}')"
check "desactivar usuario cierra acceso" 200 "$(req $A PATCH /users/$ANA '{"active":false}')"
check "ana ya no entra" 401 "$(req $P GET /auth/me)"
check "eliminar usuario con registros -> 409 (desactivar)" 409 "$(req $A DELETE /users/$ANA)"
check "eliminar usuario sin registros" 204 "$(req $A DELETE /users/$S2)"

echo "== Usuario viejo con rol responsable"
LEG=$(req $A POST /users '{"name":"Legado","username":"legado","password":"prueba123","permissions":{"guardias":"ver"}}' >/dev/null; jget d.id)
sql "update users set role='responsable' where id=$LEG; update user_modules set level='' where user_id=$LEG"
L=$T/ck_leg
check "login legado" 200 "$(req $L POST /auth/login '{"username":"legado","password":"prueba123"}')"
[ "$(jget d.user.permissions.guardias)" = "total" ] && ok "responsable viejo conserva Control total" || bad "legado" "$(body)"

echo "== Mi perfil"
check "editar mis datos" 200 "$(req $R PATCH /auth/me '{"name":"Resp Guardia Central","email":"resp@sanatorio.local"}')"
[ "$(jget d.name)" = "Resp Guardia Central" ] && ok "nombre actualizado" || bad "perfil" "$(body)"
check "email inválido rechazado" 400 "$(req $R PATCH /auth/me '{"email":"no-es-email"}')"

echo "== Apariencia"
check "GET público" 200 "$(req $T/anon GET /apariencia)"
check "PUT sin sesión" 401 "$(req $T/anon PUT /apariencia '{"nombre":"X"}')"
check "PUT de no superadmin" 403 "$(req $R PUT /apariencia '{"nombre":"X"}')"
check "PUT superadmin" 200 "$(req $A PUT /apariencia '{"subtitulo":"Pruebas","colorPrimario":"#7c3aed","temaPorDefecto":"oscuro"}')"
[ "$(jget d.colorPrimario)" = "#7c3aed" ] && ok "color guardado" || bad "apariencia" "$(body)"
check "logo inválido rechazado" 400 "$(req $A PUT /apariencia '{"logo":"data:text/html;base64,PGgxPg=="}')"

echo "== Acceso por nombre"
check "acceso público (sin sesión)" 200 "$(req $T/anon GET /acceso)"; [ "$(jget "Object.keys(d).sort().join(',')")" = "ip,ipUrl,nombre,siteUrl" ] && ok "devuelve siteUrl, nombre, ip e ipUrl" || bad "acceso" "$(body)"

echo "== Búsqueda, notificaciones y gráficos"
check "buscar 'perez' (sin tilde)" 200 "$(req $A GET '/buscar?q=perez')"
[ "$(jget "d.some(r=>r.tipo==='profesional')")" = "true" ] && ok "encuentra al profesional" || bad "buscar" "$(body)"
check "buscar con 1 letra no busca" 200 "$(req $A GET '/buscar?q=p')"; [ "$(jget d.length)" = "0" ] && ok "sin resultados con 1 letra" || bad "buscar corto" "$(body)"
check "notificaciones" 200 "$(req $A GET /notificaciones)"
check "gráficos del resumen" 200 "$(req $A GET /dashboard/graficos)"
[ "$(jget "Array.isArray(d.cobertura7)&&d.cobertura7.length===7")" = "true" ] && ok "cobertura de 7 días" || bad "gráficos" "$(body)"

echo "== Plantillas de permisos"
check "guardar plantillas" 200 "$(req $A PUT /users/plantillas '[{"nombre":"Jefe de guardia","permissions":{"guardias":"total","inventario":"nada"}},{"nombre":"jefe de guardia","permissions":{}}]')"
[ "$(jget "d.length+':'+JSON.stringify(d[0].permissions)")" = '1:{"guardias":"total"}' ] && ok "valida niveles y no duplica nombres" || bad "plantillas" "$(body)"
check "no superadmin no ve plantillas" 403 "$(req $R GET /users/plantillas)"

echo "== Medical → Cancelaciones Médicos"
F() { node -e "const d=new Date(Date.now()+$1*864e5);console.log(d.toLocaleDateString('sv-SE',{timeZone:'America/Argentina/Cordoba'}))"; }
LEJOS=$(F 45); LEJOS2=$(F 46); MANANA=$(F 1); P=$T/ck_pub
CB() { echo "{\"prestador\":\"Dra. Ana Gómez\",\"matricula\":\"MP 1234\",\"dni\":\"30.111.222\",\"servicio\":\"Cardiología\",\"pacientesAgendados\":true,\"hayColega\":true,\"colega\":\"Dr. Luis Paz\",\"motivo\":\"$1\",\"dias\":$2,\"declaracion\":true$3}"; }
check "reglas del formulario (sin sesión)" 200 "$(req $P GET /publico/cancelaciones/reglas)"
[ "$(jget "d.anticipacionMinima===15&&d.primerDiaSinExcepcion>d.hoy&&d.motivos.length===4")" = "true" ] && ok "regla de 15 días hábiles" || bad "reglas" "$(body)"
check "anticipación de mañana" 200 "$(req $P POST /publico/cancelaciones/anticipacion "{\"fecha\":\"$MANANA\"}")"
[ "$(jget "d.habiles===0&&d.excepcional")" = "true" ] && ok "mañana = 0 hábiles, excepcional" || bad "anticipación" "$(body)"
check "sin declaración no se envía" 400 "$(req $P POST /publico/cancelaciones "$(CB vacaciones "[{\"fecha\":\"$LEJOS\",\"desde\":\"08:00\",\"hasta\":\"12:00\"}]" | sed 's/"declaracion":true/"declaracion":false/')")"
check "horario al revés" 400 "$(req $P POST /publico/cancelaciones "$(CB vacaciones "[{\"fecha\":\"$LEJOS\",\"desde\":\"12:00\",\"hasta\":\"08:00\"}]")")"
check "fecha pasada" 400 "$(req $P POST /publico/cancelaciones "$(CB vacaciones '[{"fecha":"2020-01-10","desde":"08:00","hasta":"12:00"}]')")"
check "colega Sí sin nombre" 400 "$(req $P POST /publico/cancelaciones "$(CB vacaciones "[{\"fecha\":\"$LEJOS\",\"desde\":\"08:00\",\"hasta\":\"12:00\"}]" | sed 's/Dr. Luis Paz//')")"
check "pedido con anticipación" 201 "$(req $P POST /publico/cancelaciones "$(CB vacaciones "[{\"fecha\":\"$LEJOS2\",\"desde\":\"14:00\",\"hasta\":\"18:00\"},{\"fecha\":\"$LEJOS\",\"desde\":\"08:00\",\"hasta\":\"12:00\"}]")")"
N1=$(jget d.numero); [ "$(jget "/^CAN-\\d{4}$/.test(d.numero)&&!d.excepcional&&d.anticipacionHabiles>=15&&d.dias[0].fecha==='$LEJOS'")" = "true" ] && ok "número de trámite $N1, no excepcional, días ordenados" || bad "alta" "$(body)"
check "urgente sin justificar" 400 "$(req $P POST /publico/cancelaciones "$(CB licencia "[{\"fecha\":\"$MANANA\",\"desde\":\"08:00\",\"hasta\":\"12:00\"}]")")"
check "urgente justificado" 201 "$(req $P POST /publico/cancelaciones "$(CB licencia "[{\"fecha\":\"$MANANA\",\"desde\":\"08:00\",\"hasta\":\"12:00\"}]" ',"justificacion":"Internación de urgencia de un familiar"')")"
N2=$(jget d.numero); [ "$(jget "d.excepcional&&d.pideConstancia")" = "true" ] && ok "queda excepcional y pide certificado" || bad "urgente" "$(body)"
check "consultar con número y DNI" 200 "$(req $P GET "/publico/cancelaciones/$N1?dni=30111222")"
[ "$(jget "d.estado==='pendiente'&&d.dni===undefined&&d.eventos===undefined")" = "true" ] && ok "vista pública sin datos internos" || bad "consulta" "$(body)"
check "consultar con número corto (\"can 1\")" 200 "$(req $P GET "/publico/cancelaciones/can%20${N1#CAN-}?dni=30111222")"
check "DNI que no coincide" 404 "$(req $P GET "/publico/cancelaciones/$N1?dni=99999999")"
check "sin sesión no entra a la bandeja" 401 "$(req $P GET /cancelaciones)"
check "sin el módulo no entra a la bandeja" 403 "$(req $R GET /cancelaciones)"
check "crear usuario que solo ve cancelaciones" 201 "$(req $A POST /users '{"name":"Ve Cancel","username":"vecan","password":"prueba123","role":"usuario","permissions":{"cancelaciones":"ver"}}')"
V=$T/ck_vecan; req $V POST /auth/login '{"username":"vecan","password":"prueba123"}' >/dev/null
check "ve la bandeja" 200 "$(req $V GET '/cancelaciones?estado=abiertas')"
[ "$(jget "d.filas.length===2&&d.porEstado.pendiente===2")" = "true" ] && ok "2 solicitudes pendientes" || bad "bandeja" "$(body)"
ID1=$(jget "d.filas.find(f=>f.numero==='$N1').id"); ID2=$(jget "d.filas.find(f=>f.numero==='$N2').id")
check "solo Ver NO resuelve" 403 "$(req $V POST /cancelaciones/$ID1/resolver '{"decision":"aceptada"}')"
check "solo Ver NO elimina" 403 "$(req $V DELETE /cancelaciones/$ID1)"
check "filtro excepcionales" 200 "$(req $A GET '/cancelaciones?excepcional=1')"; [ "$(jget "d.filas.length===1&&d.filas[0].id===$ID2")" = "true" ] && ok "solo la urgente" || bad "filtro" "$(body)"
check "buscar por número" 200 "$(req $A GET "/cancelaciones?q=$N1")"; [ "$(jget "d.filas.length===1")" = "true" ] && ok "la encuentra" || bad "buscar" "$(body)"
check "notificación de pendientes" 200 "$(req $V GET /notificaciones)"; [ "$(jget "d.some(n=>n.modulo==='cancelaciones'&&n.nivel==='alta')")" = "true" ] && ok "campanita con excepcional" || bad "noti" "$(body)"
check "detalle con otras del mismo médico" 200 "$(req $A GET /cancelaciones/$ID1)"; [ "$(jget "d.otras.length===1&&d.matricula==='MP 1234'&&d.dni==='30111222'")" = "true" ] && ok "otras solicitudes" || bad "detalle" "$(body)"
check "tomar en análisis" 200 "$(req $A POST /cancelaciones/$ID1/analisis '{}')"
check "dos veces en análisis" 409 "$(req $A POST /cancelaciones/$ID1/analisis '{}')"
check "agenda cancelada antes de aceptar" 409 "$(req $A POST /cancelaciones/$ID1/agenda-cancelada '{}')"
check "rechazar sin motivo" 400 "$(req $A POST /cancelaciones/$ID1/resolver '{"decision":"rechazada"}')"
check "aceptar" 200 "$(req $A POST /cancelaciones/$ID1/resolver '{"decision":"aceptada","respuesta":"Se reprograma la agenda."}')"
[ "$(jget "d.estado==='aceptada'&&d.resueltoPor!==''&&d.eventos.length===3")" = "true" ] && ok "queda aceptada con historial" || bad "aceptar" "$(body)"
check "aceptar de nuevo" 409 "$(req $A POST /cancelaciones/$ID1/resolver '{"decision":"aceptada"}')"
echo "-- Central de Turnos"
check "crear usuario de Central de Turnos (Ver + central)" 201 "$(req $A POST /users '{"name":"Central Turnos","username":"centur","password":"prueba123","role":"usuario","permissions":{"cancelaciones":"ver"},"acciones":{"cancelaciones":["ver","central"]}}')"
CT=$T/ck_centur; req $CT POST /auth/login '{"username":"centur","password":"prueba123"}' >/dev/null
check "la aceptada está en Central" 200 "$(req $CT GET '/cancelaciones?estado=central')"; [ "$(jget "d.filas.length===1&&d.filas[0].id===$ID1&&d.porEstado.aceptada===1&&d.resumen.porCancelar===1")" = "true" ] && ok "1 agenda por cancelar" || bad "central" "$(body | head -c 300)"
check "campanita de Central" 200 "$(req $CT GET /notificaciones)"; [ "$(jget "d.some(n=>n.id.startsWith('can-cent-')&&n.link==='/cancelaciones?vista=central')")" = "true" ] && ok "aviso de agendas por cancelar" || bad "noti central" "$(body)"
check "Central no resuelve solicitudes" 403 "$(req $CT POST /cancelaciones/$ID2/analisis '{}')"
check "solo Ver NO marca la agenda" 403 "$(req $V POST /cancelaciones/$ID1/agenda-cancelada '{}')"
check "Central marca agenda cancelada" 200 "$(req $CT POST /cancelaciones/$ID1/agenda-cancelada '{"nota":"Pacientes avisados"}')"
[ "$(jget "d.estado==='agenda_cancelada'&&d.agendaCanceladaPor==='Central Turnos'&&d.centralNota==='Pacientes avisados'&&d.eventos.at(-1).accion==='agenda_cancelada'")" = "true" ] && ok "queda cancelada con quién, observación e historial" || bad "agenda cancelada" "$(body)"
check "marcar dos veces" 409 "$(req $CT POST /cancelaciones/$ID1/agenda-cancelada '{}')"
check "Central agrega nota" 200 "$(req $CT POST /cancelaciones/$ID1/nota '{"texto":"Llamé al consultorio"}')"
check "Dirección no reabre una agenda ya cancelada" 409 "$(req $A POST /cancelaciones/$ID1/reabrir '{}')"
check "el médico ve que se canceló" 200 "$(req $P GET "/publico/cancelaciones/$N1?dni=30111222")"; [ "$(jget "d.estado==='agenda_cancelada'&&d.estadoLabel.includes('agenda cancelada')&&d.respuesta==='Se reprograma la agenda.'&&d.centralNota===undefined")" = "true" ] && ok "estado público sin la observación interna" || bad "publico" "$(body)"
check "filtro por estado agenda cancelada" 200 "$(req $A GET '/cancelaciones?estado=agenda_cancelada&servicio=cardiolog%C3%ADa&motivo=vacaciones')"; [ "$(jget "d.filas.length===1")" = "true" ] && ok "filtra por estado, servicio y motivo" || bad "filtros" "$(body | head -c 200)"
check "filtro motivo sin resultados" 200 "$(req $A GET '/cancelaciones?estado=agenda_cancelada&motivo=licencia')"; [ "$(jget "d.filas.length===0")" = "true" ] && ok "otro motivo no aparece" || bad "filtro motivo" "$(body | head -c 200)"
check "deshacer sin motivo" 400 "$(req $CT POST /cancelaciones/$ID1/agenda-restituir '{}')"
check "deshacer la cancelación" 200 "$(req $CT POST /cancelaciones/$ID1/agenda-restituir '{"motivo":"Se marcó por error"}')"
[ "$(jget "d.estado==='aceptada'&&d.agendaCanceladaAt===null&&d.agendaCanceladaPor===''")" = "true" ] && ok "vuelve a por cancelar" || bad "restituir" "$(body)"
check "nota interna" 200 "$(req $A POST /cancelaciones/$ID1/nota '{"texto":"Avisado por teléfono"}')"
check "el médico ve la respuesta" 200 "$(req $P GET "/publico/cancelaciones/$N1?dni=30111222")"
[ "$(jget "d.estado==='aceptada'&&d.estadoLabel==='Aceptada'&&d.respuesta==='Se reprograma la agenda.'")" = "true" ] && ok "estado y respuesta" || bad "consulta resuelta" "$(body)"
check "el médico no anula una resuelta" 409 "$(req $P POST /publico/cancelaciones/$N1/anular '{"dni":"30111222"}')"
check "constancia recibida" 200 "$(req $A PATCH /cancelaciones/$ID2/seguimiento '{"constanciaRecibida":true}')"
check "el médico anula la pendiente" 200 "$(req $P POST /publico/cancelaciones/$N2/anular '{"dni":"30111222"}')"
[ "$(jget "d.estado==='anulada'")" = "true" ] && ok "queda anulada" || bad "anular" "$(body)"
check "reabrir la aceptada" 200 "$(req $A POST /cancelaciones/$ID1/reabrir '{}')"
[ "$(jget "d.estado==='en_analisis'&&d.respuesta===''")" = "true" ] && ok "vuelve a análisis" || bad "reabrir" "$(body)"
check "eliminar (control total)" 204 "$(req $A DELETE /cancelaciones/$ID2)"
check "ya no existe" 404 "$(req $A GET /cancelaciones/$ID2)"

echo "== Configuración → Módulos"
check "estado de los módulos" 200 "$(req $V GET /modulos)"; [ "$(jget "d.desactivados.length===0&&d.noDesactivables.includes('dashboard')")" = "true" ] && ok "todos activos" || bad "modulos" "$(body)"
check "no superadmin no desactiva módulos" 403 "$(req $V PUT /modulos/cancelaciones '{"activo":false}')"
check "Inicio no se desactiva" 400 "$(req $A PUT /modulos/dashboard '{"activo":false}')"
check "módulo inexistente" 404 "$(req $A PUT /modulos/nada '{"activo":false}')"
check "desactivar Cancelaciones" 200 "$(req $A PUT /modulos/cancelaciones '{"activo":false}')"
check "quien tenía acceso ya no entra" 403 "$(req $V GET /cancelaciones)"
check "me de esa persona" 200 "$(req $V GET /auth/me)"; [ "$(jget "!(d.modules||[]).includes('cancelaciones')")" = "true" ] && ok "desaparece de su menú" || bad "menu" "$(body)"
check "superadmin sigue entrando" 200 "$(req $A GET /cancelaciones)"
check "su permiso se conserva" 200 "$(req $A GET /users)"; [ "$(jget "d.find(u=>u.username==='vecan').permissions.cancelaciones")" = "ver" ] && ok "permiso guardado intacto" || bad "permiso" "$(body | head -c 200)"
check "activar de nuevo" 200 "$(req $A PUT /modulos/cancelaciones '{"activo":true}')"
check "vuelve a entrar" 200 "$(req $V GET /cancelaciones)"
check "queda en la auditoría" 200 "$(req $A GET '/users/historial?limit=20')"; [ "$(jget "d.filter(h=>h.accion==='modulo').length")" = "2" ] && ok "2 movimientos de módulo" || bad "auditoria" "$(jget "d.map(h=>h.accion).join(',')")"

echo; echo "RESULTADO: $PASS OK, $FAIL FALLAS"
[ "$FAIL" -eq 0 ]
