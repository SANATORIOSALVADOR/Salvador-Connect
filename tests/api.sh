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
check "lector NO escribe administración" 403 "$(req $U POST /administracion '{"title":"x","dueDate":"2026-10-20"}')"
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

echo "== Administración"
check "crear tipo pago" 201 "$(req $A POST /administracion '{"title":"Pago proveedor","itemType":"pago","dueDate":"2026-10-20","alertDays":0}')"
AID=$(jget d.id); AD=$(jget d.alertDays); [ "$AD" = "0" ] && ok "alertDays 0 se respeta" || bad "alertDays" "$AD"
check "marcar cumplido" 200 "$(req $A PATCH /administracion/$AID '{"status":"cumplido"}')"
check "filtro status=cumplido" 200 "$(req $A GET '/administracion?status=cumplido')"; [ "$(jget d.length)" = "1" ] && ok "filtro devuelve 1" || bad "filtro" "$(body)"
check "generar fiscal oct-2026" 200 "$(req $A POST /administracion/generar-fiscal '{"year":2026,"month":10}')"
echo "  creados=$(jget d.created) fechas=$(jget "d.items.map(i=>i.dueDate).join(' ')")"
check "regenerar no duplica" 200 "$(req $A POST /administracion/generar-fiscal '{"year":2026,"month":10}')"; [ "$(jget d.created)" = "0" ] && ok "0 creados al regenerar" || bad "idempotencia" "$(body)"

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
check "ver guardias" 200 "$(req $P GET '/guardias?from=2026-10-01&to=2026-10-31')"
check "con Ver NO carga guardias" 403 "$(req $P POST /guardias "{\"sectorId\":$GC,\"date\":\"2026-11-02\",\"startTime\":\"08:00\",\"endTime\":\"12:00\",\"professionalName\":\"Prueba Nivel\"}")"
check "con Editar crea en Administración" 201 "$(req $P POST /administracion '{"title":"Item de Ana","dueDate":"2026-11-10"}')"; AITEM=$(jget d.id)
check "con Editar modifica" 200 "$(req $P PATCH /administracion/$AITEM '{"status":"cumplido"}')"
check "con Editar NO elimina" 403 "$(req $P DELETE /administracion/$AITEM)"
check "con Editar NO genera vencimientos fiscales" 403 "$(req $P POST /administracion/generar-fiscal '{"year":2026,"month":11}')"
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

echo; echo "RESULTADO: $PASS OK, $FAIL FALLAS"
[ "$FAIL" -eq 0 ]
