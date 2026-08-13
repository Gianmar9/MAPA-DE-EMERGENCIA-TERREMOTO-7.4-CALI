// WORKER FINAL MÍNIMO — Mapa de Emergencia Sísmica Cali
// Binding D1 requerido: DB

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" }
  });
}

async function ensureTable(DB) {
  await DB.prepare(`
    CREATE TABLE IF NOT EXISTS reportes (
      id TEXT PRIMARY KEY,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      nombre TEXT NOT NULL DEFAULT '',
      categoria TEXT NOT NULL DEFAULT 'estructura',
      necesidades TEXT NOT NULL DEFAULT '',
      actualizado TEXT NOT NULL
    )
  `).run();
}

function clasificar(categoria, texto = "") {
  const t = texto.toLowerCase();
  const vital = ["atrapad","sepultad","hay gente","adentro","señales de vida","senales de vida"]
    .some(k => t.includes(k));

  if (categoria === "estructura") return vital ? "P1" : "P2";
  if (categoria === "salud" || categoria === "movilidad") return "P2";
  return "P3";
}

function convertir(r) {
  const prioridad = clasificar(r.categoria, `${r.nombre} ${r.necesidades}`);
  return {
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    tipo_original: "usuario",
    estado_original: "reportado",
    estado_estructura: r.categoria === "estructura" ? "sin_clasificar" : "no_aplica",
    estado_atencion: "por_verificar",
    necesita_personal: /voluntario|personal|rescatista|gente/i.test(r.necesidades || ""),
    necesita_equipos: /pala|linterna|casco|guante|cuerda|herramienta|maquinaria|grúa|grua/i.test(r.necesidades || ""),
    voluntarios_hay: 0,
    voluntarios_faltan: 0,
    direccion: r.nombre || "",
    barrio: "",
    necesidades: r.necesidades || "",
    contacto: "",
    prioridad,
    validacion: "confirmado_usuario",
    fuente: "Reporte ciudadano compartido",
    fuente_id: "web",
    url: "",
    precision: "marcado",
    precision_nota: "Punto compartido mediante el servidor público.",
    confirmaciones_usuario: 1,
    actualizado: r.actualizado,
    lat: Number(r.lat),
    lng: Number(r.lng)
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    try {
      await ensureTable(env.DB);
    } catch (error) {
      return json({
        estado: "ERROR_CREANDO_TABLA",
        mensaje: error.message
      }, 500);
    }

    const url = new URL(request.url);

    // Diagnóstico
    if (url.pathname === "/" || url.pathname === "/api/diagnostico") {
      try {
        const tabla = await env.DB
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reportes'")
          .first();

        const count = await env.DB
          .prepare("SELECT COUNT(*) AS total FROM reportes")
          .first();

        return json({
          estado: "LISTO",
          tabla_reportes: tabla?.name || null,
          puntos_compartidos: Number(count?.total || 0),
          hora: new Date().toISOString()
        });
      } catch (error) {
        return json({
          estado: "ERROR_DIAGNOSTICO",
          mensaje: error.message
        }, 500);
      }
    }

    // Todos los puntos compartidos
    if (url.pathname === "/api/puntos" && request.method === "GET") {
      try {
        const result = await env.DB
          .prepare(`
            SELECT id, lat, lng, nombre, categoria, necesidades, actualizado
            FROM reportes
            ORDER BY actualizado DESC
            LIMIT 5000
          `)
          .all();

        const puntos = (result.results || []).map(convertir);

        return json({
          puntos,
          total: puntos.length,
          actualizado: new Date().toISOString()
        });
      } catch (error) {
        return json({
          estado: "ERROR_LISTANDO",
          mensaje: error.message
        }, 500);
      }
    }

    // Crear / reintentar punto
    if (url.pathname === "/api/reportar" && request.method === "POST") {
      let body;

      try {
        body = await request.json();
      } catch {
        return json({ error: "JSON inválido" }, 400);
      }

      const lat = Number(body.lat);
      const lng = Number(body.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return json({ error: "Coordenadas inválidas" }, 400);
      }

      // Área amplia de Cali y alrededores
      if (lat < 3.0 || lat > 3.8 || lng < -77.0 || lng > -76.1) {
        return json({ error: "Punto fuera del área admitida" }, 400);
      }

      const categorias = ["estructura","albergue","acopio","salud","movilidad","apoyo"];
      const categoria = categorias.includes(body.categoria)
        ? body.categoria
        : "estructura";

      const nombre = String(body.nombre || "").trim().slice(0, 240);
      const necesidades = String(body.necesidades || "").trim().slice(0, 1200);
      const actualizado = new Date().toISOString();

      // Si el frontend manda client_id, el reintento no duplica.
      const clientId = String(body.client_id || "").trim();
      const id = /^[A-Za-z0-9_.:-]{3,100}$/.test(clientId)
        ? clientId
        : "web_" + crypto.randomUUID();

      try {
        await env.DB
          .prepare(`
            INSERT INTO reportes
              (id, lat, lng, nombre, categoria, necesidades, actualizado)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              lat = excluded.lat,
              lng = excluded.lng,
              nombre = excluded.nombre,
              categoria = excluded.categoria,
              necesidades = excluded.necesidades,
              actualizado = excluded.actualizado
          `)
          .bind(id, lat, lng, nombre, categoria, necesidades, actualizado)
          .run();

        const saved = await env.DB
          .prepare(`
            SELECT id, lat, lng, nombre, categoria, necesidades, actualizado
            FROM reportes
            WHERE id = ?
          `)
          .bind(id)
          .first();

        return json({
          ok: true,
          punto: convertir(saved)
        }, 201);

      } catch (error) {
        return json({
          estado: "ERROR_GUARDANDO",
          mensaje: error.message
        }, 500);
      }
    }

    return json({ error: "Ruta no encontrada" }, 404);
  }
};
