// Cloudflare Worker compatible con el index.html del Mapa de Emergencia Sísmica Cali.
// Requiere un binding D1 llamado DB.
//
// Rutas:
// GET  /              -> estado del servidor
// GET  /api/puntos    -> puntos compartidos
// POST /api/reportar  -> crea/reintenta un punto
// POST /api/actualizar -> actualiza un punto existente (opcional)

const ALLOWED_CATEGORIES = new Set(["estructura","albergue","acopio","salud","movilidad","apoyo"]);
const ALLOWED_PRIORITIES = new Set(["P1","P2","P3","P4"]);
const MAX_TEXT = 1200;


function getDB(env){
  if(env.DB && typeof env.DB.prepare === "function") return env.DB;
  for(const value of Object.values(env)){
    if(value && typeof value.prepare === "function" && typeof value.batch === "function") return value;
  }
  return null;
}

function cors(extra={}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    ...extra
  };
}

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: cors({"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"})
  });
}

function txt(v, max=MAX_TEXT) {
  return String(v ?? "").replace(/\u0000/g,"").trim().slice(0,max);
}
function boolInt(v){ return v ? 1 : 0; }

function inferPriority(categoria, texto, provided){
  if(ALLOWED_PRIORITIES.has(provided)) return provided;
  const t = texto.toLowerCase();
  const vital = ["atrapad","sepultad","hay gente","adentro","señales de vida","senales de vida"]
    .some(k=>t.includes(k));
  if(categoria === "estructura") return vital ? "P1" : "P2";
  if(categoria === "salud" || categoria === "movilidad") return "P2";
  return "P3";
}

function rowToPoint(r){
  return {
    id:r.id,
    nombre:r.nombre,
    categoria:r.categoria,
    tipo_original:"usuario",
    estado_original:"reportado",
    estado_estructura:r.estado_estructura,
    estado_atencion:r.estado_atencion,
    necesita_personal:Boolean(r.necesita_personal),
    necesita_equipos:Boolean(r.necesita_equipos),
    voluntarios_hay:0,
    voluntarios_faltan:0,
    direccion:r.nombre || "",
    barrio:"",
    necesidades:r.necesidades,
    contacto:r.contacto,
    prioridad:r.prioridad,
    validacion:r.validacion,
    fuente:r.fuente,
    fuente_id:"web",
    url:"",
    precision:r.precision,
    precision_nota:r.precision_nota,
    confirmaciones_usuario:1,
    actualizado:r.actualizado,
    lat:Number(r.lat),
    lng:Number(r.lng)
  };
}

async function tableExists(env){
  try{
    const db = getDB(env);
    if(!db) return false;
    const r = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='reportes'"
    ).first();
    return Boolean(r);
  }catch(e){ return false; }
}

export default {
  async fetch(request, env) {
    if(request.method === "OPTIONS") return new Response(null,{status:204,headers:cors()});
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/,"") || "/";
    const db = getDB(env);

    try{
      if(!db) return json({error:"No se encontró un binding D1 en este Worker",estado:"SIN_D1"},500);
      if(path === "/"){
        const ok = await tableExists(env);
        if(!ok){
          return json({
            servicio:"Servidor del Mapa de Emergencia · Terremoto 7.4 Cali",
            estado:"INCOMPLETO — los puntos no se pueden guardar todavía",
            problema:"La base D1 está conectada, pero no existe la tabla reportes.",
            que_hacer:"Ejecuta schema.sql en la consola de la base D1 conectada a este Worker.",
            detalle_tecnico:"no such table: reportes"
          }, 503);
        }
        const count = await db.prepare("SELECT COUNT(*) AS n FROM reportes WHERE activo=1").first();
        return json({
          servicio:"Servidor del Mapa de Emergencia · Terremoto 7.4 Cali",
          estado:"LISTO",
          puntos_compartidos:Number(count?.n || 0),
          hora:new Date().toISOString()
        });
      }

      if(path === "/api/puntos" && request.method === "GET"){
        if(!(await tableExists(env))) return json({error:"Base no inicializada",puntos:[]},503);
        const q = await db.prepare(`
          SELECT id,lat,lng,nombre,categoria,necesidades,contacto,prioridad,
                 estado_atencion,estado_estructura,necesita_personal,necesita_equipos,
                 precision,precision_nota,validacion,fuente,actualizado
          FROM reportes
          WHERE activo=1
          ORDER BY actualizado DESC
          LIMIT 5000
        `).all();
        const puntos = (q.results || []).map(rowToPoint);
        return json({puntos, total:puntos.length, actualizado:new Date().toISOString()});
      }

      if(path === "/api/reportar" && request.method === "POST"){
        if(!(await tableExists(env))) return json({
          error:"La base no está inicializada",
          solucion:"Ejecuta schema.sql sobre la base D1 conectada al Worker."
        },503);

        let body;
        try{ body = await request.json(); }
        catch(e){ return json({error:"JSON inválido"},400); }

        const lat = Number(body.lat), lng = Number(body.lng);
        if(!Number.isFinite(lat) || !Number.isFinite(lng))
          return json({error:"lat/lng inválidos"},400);

        // Área amplia de Cali y alrededores; evita basura obvia sin impedir periferia.
        if(lat < 3.0 || lat > 3.8 || lng < -77.0 || lng > -76.1)
          return json({error:"El punto está fuera del área admitida para este mapa"},400);

        let categoria = txt(body.categoria,30).toLowerCase();
        if(!ALLOWED_CATEGORIES.has(categoria)) categoria = "estructura";

        const nombre = txt(body.nombre,240);
        const necesidades = txt(body.necesidades,1200);
        const contacto = txt(body.contacto,180);
        const prioridad = inferPriority(categoria, `${nombre} ${necesidades}`, txt(body.prioridad,5));
        const estado_atencion = txt(body.estado_atencion,40) || "por_verificar";
        const estado_estructura = txt(body.estado_estructura,40) ||
          (categoria==="estructura" ? "sin_clasificar" : "no_aplica");
        const precision = txt(body.precision,30) || "marcado";
        const precision_nota = txt(body.precision_nota,600);
        const now = new Date().toISOString();

        // Idempotencia: el cliente puede reintentar el mismo punto sin duplicarlo.
        const clientId = txt(body.client_id,100);
        const id = clientId && /^[A-Za-z0-9_.:-]{3,100}$/.test(clientId)
          ? clientId
          : "web_" + crypto.randomUUID();

        await db.prepare(`
          INSERT INTO reportes (
            id,lat,lng,nombre,categoria,necesidades,contacto,prioridad,
            estado_atencion,estado_estructura,necesita_personal,necesita_equipos,
            precision,precision_nota,validacion,fuente,creado_at,actualizado,activo
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
          ON CONFLICT(id) DO UPDATE SET
            lat=excluded.lat, lng=excluded.lng, nombre=excluded.nombre,
            categoria=excluded.categoria, necesidades=excluded.necesidades,
            contacto=excluded.contacto, prioridad=excluded.prioridad,
            estado_atencion=excluded.estado_atencion,
            estado_estructura=excluded.estado_estructura,
            necesita_personal=excluded.necesita_personal,
            necesita_equipos=excluded.necesita_equipos,
            precision=excluded.precision, precision_nota=excluded.precision_nota,
            actualizado=excluded.actualizado, activo=1
        `).bind(
          id, lat, lng, nombre, categoria, necesidades, contacto, prioridad,
          estado_atencion, estado_estructura,
          boolInt(body.necesita_personal), boolInt(body.necesita_equipos),
          precision, precision_nota, "confirmado_usuario",
          "Reporte marcado en el mapa por un usuario",
          now, now
        ).run();

        const saved = await db.prepare(`
          SELECT id,lat,lng,nombre,categoria,necesidades,contacto,prioridad,
                 estado_atencion,estado_estructura,necesita_personal,necesita_equipos,
                 precision,precision_nota,validacion,fuente,actualizado
          FROM reportes WHERE id=?
        `).bind(id).first();

        return json({ok:true,punto:rowToPoint(saved)},201);
      }

      if(path === "/api/actualizar" && request.method === "POST"){
        if(!(await tableExists(env))) return json({error:"Base no inicializada"},503);
        let body;
        try{ body = await request.json(); }catch(e){ return json({error:"JSON inválido"},400); }
        const id = txt(body.id,100);
        if(!id) return json({error:"Falta id"},400);
        const existing = await db.prepare("SELECT * FROM reportes WHERE id=?").bind(id).first();
        if(!existing) return json({error:"Punto no encontrado"},404);

        const now = new Date().toISOString();
        await db.prepare(`
          UPDATE reportes SET
            nombre=?, categoria=?, necesidades=?, contacto=?, prioridad=?,
            estado_atencion=?, estado_estructura=?, necesita_personal=?,
            necesita_equipos=?, actualizado=?
          WHERE id=?
        `).bind(
          txt(body.nombre,240) || existing.nombre,
          ALLOWED_CATEGORIES.has(txt(body.categoria,30)) ? txt(body.categoria,30) : existing.categoria,
          txt(body.necesidades,1200),
          txt(body.contacto,180),
          ALLOWED_PRIORITIES.has(txt(body.prioridad,5)) ? txt(body.prioridad,5) : existing.prioridad,
          txt(body.estado_atencion,40) || existing.estado_atencion,
          txt(body.estado_estructura,40) || existing.estado_estructura,
          body.necesita_personal == null ? existing.necesita_personal : boolInt(body.necesita_personal),
          body.necesita_equipos == null ? existing.necesita_equipos : boolInt(body.necesita_equipos),
          now,id
        ).run();
        const saved = await db.prepare("SELECT * FROM reportes WHERE id=?").bind(id).first();
        return json({ok:true,punto:rowToPoint(saved)});
      }

      return json({error:"Ruta no encontrada"},404);

    }catch(err){
      console.error(err);
      return json({
        error:"Error interno del servidor",
        detalle:String(err?.message || err)
      },500);
    }
  }
};
