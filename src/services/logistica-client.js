import { ApiError, apiRequest } from "./api-client.js";

export const MENSAJE_NO_DISPONIBLE = "El servicio de logística no está disponible en este momento";

/**
 * Llama a la API de logística y traduce cualquier error a un mensajeUsuario apto para la pantalla.
 * El detalle técnico (JSON de Spring, stack) queda en el log del servidor, lo escribe apiRequest.
 *
 * @param mensajes texto por defecto de la acción, o { default, [status]: texto }.
 */
async function llamar(req, path, opciones, mensajes) {
  try {
    return await apiRequest(req, "logistica", `/api/logistica${path}`, opciones);
  } catch (error) {
    if (error instanceof ApiError) {
      const porStatus = typeof mensajes === "string" ? { default: mensajes } : mensajes;
      error.mensajeUsuario =
        error.status === 0 ? MENSAJE_NO_DISPONIBLE : (porStatus[error.status] ?? porStatus.default);
    }
    throw error;
  }
}

/** Conexión rechazada o timeout: el backend ni siquiera respondió. */
export function esServicioNoDisponible(error) {
  return error instanceof ApiError && error.status === 0;
}

const segmento = (valor) => encodeURIComponent(valor);

export function listarCamiones(req) {
  return llamar(req, "/camiones", {}, "No se pudo cargar la lista de camiones.");
}

export function crearCamion(req, camion) {
  return llamar(req, "/camiones", { method: "POST", body: camion }, {
    500: "Ya existe un camión con esa patente",
    default: `No se pudo registrar el camión ${camion.patente}.`,
  });
}

export function modificarCamion(req, patente, camion) {
  return llamar(
    req,
    `/camiones/${segmento(patente)}`,
    { method: "PUT", body: camion },
    `No se pudo modificar el camión ${patente}.`,
  );
}

export function darDeBajaCamion(req, patente) {
  return llamar(req, `/camiones/${segmento(patente)}`, { method: "DELETE" }, {
    500: `No se pudo dar de baja el camión ${patente}. Revisá que no tenga una ruta activa.`,
    default: `No se pudo dar de baja el camión ${patente}.`,
  });
}

export function obtenerRutaActiva(req, patente) {
  return llamar(
    req,
    `/camiones/${segmento(patente)}/ruta-activa`,
    {},
    `No se pudo consultar la ruta activa del camión ${patente}.`,
  );
}

export function iniciarRuta(req, patente) {
  return llamar(
    req,
    `/camiones/${segmento(patente)}/ruta-activa`,
    { method: "PATCH", body: { estado: "EN_CURSO" } },
    `No se pudo iniciar la ruta del camión ${patente}.`,
  );
}

export function listarRutasActivas(req) {
  return llamar(req, "/rutas-activas", {}, "No se pudieron cargar las rutas activas.");
}

export function listarEntregas(req, estado) {
  const query = estado ? `?estado=${encodeURIComponent(estado)}` : "";
  return llamar(req, `/entregas${query}`, {}, "No se pudieron cargar las entregas.");
}

export function solicitarPlanificacion(req) {
  return llamar(
    req,
    "/planificaciones",
    { method: "POST" },
    "No se pudo enviar la solicitud de planificación.",
  );
}

/** Solo para la demo: hace de optimizador externo llamando al webhook POST /rutas. */
export function simularRespuestaPlanificador(req, rutas) {
  return llamar(
    req,
    "/rutas",
    { method: "POST", body: rutas },
    "No se pudo simular la respuesta del optimizador.",
  );
}

export function cambiarEstadoEntrega(req, id, {nuevoEstado, fotoUrl, motivo}) {

  const parametros = new URLSearchParams({ nuevoEstado });
  if (fotoUrl) parametros.set("fotoUrl", fotoUrl);
  if (motivo) parametros.set("motivo", motivo);
  return llamar(req, `/entregas/${segmento(id)}/estado?${parametros}`, {method: "PUT"}, {

    400: "La entrega ya no puede cambiar a ese estado.",
    default: "No se pudo registrar la recepción.",

  });
}

export async function entregaEnTrasladoDeDonacion(req, donacionId) {
  
  const entregas = await listarEntregas(req, "EN_TRASLADO");

  const propias = (Array.isArray(entregas) ? entregas : []).filter(

    (entrega) => String(entrega.donacionId) === String(donacionId),

  );
  
  return propias.at(-1) ?? null;
}