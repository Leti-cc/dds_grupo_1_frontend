import { ApiError, apiRequest } from "./api-client.js";

export const MENSAJE_NO_DISPONIBLE = "El servicio de donaciones no está disponible en este momento";

/** Tamaño de página de la cola de pendientes y de la lista de la entidad (el backend acepta hasta 50). */
export const TAMANIO_PAGINA = 20;

function textoDelBackend(data) {
  return typeof data?.mensaje === "string" && data.mensaje.trim() ? data.mensaje.trim() : undefined;
}

/**
 * Llama a servicio-donaciones y deja en el error lo que necesita el router:
 * - codigo: el codigo del ErrorDTO del backend (TRANSICION_INVALIDA, RANKING_NO_CALCULADO...).
 * - mensajeUsuario: el mensaje del ErrorDTO si es un 4xx; si no, el texto por defecto de la acción.
 *
 * api-client.js no lee el campo "mensaje" del ErrorDTO, por eso se lee acá (ver docs/coordinacion-flujo-5.md, punto 4).
 */
async function llamar(req, path, opciones, mensajePorDefecto) {
  try {
    return await apiRequest(req, "donaciones", path, opciones);
  } catch (error) {
    if (error instanceof ApiError) {
      error.codigo = typeof error.data?.codigo === "string" ? error.data.codigo : undefined;
      if (error.status === 0) {
        error.mensajeUsuario = MENSAJE_NO_DISPONIBLE;
      } else if (error.status >= 400 && error.status < 500) {
        error.mensajeUsuario = textoDelBackend(error.data) ?? mensajePorDefecto;
      } else {
        error.mensajeUsuario = mensajePorDefecto;
      }
    }
    throw error;
  }
}

/** Conexión rechazada o timeout: el backend ni siquiera respondió. */
export function esServicioNoDisponible(error) {
  return error instanceof ApiError && error.status === 0;
}

function query(parametros) {
  const busqueda = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    for (const item of Array.isArray(valor) ? valor : [valor]) {
      if (item !== undefined && item !== null && item !== "") {
        busqueda.append(clave, String(item));
      }
    }
  }
  const texto = busqueda.toString();
  return texto ? `?${texto}` : "";
}

const segmento = (valor) => encodeURIComponent(valor);

/* ---------- Asignaciones (admin) ---------- */

/** Cola de donaciones en depósito. page empieza en 0, como en el backend. */
export function listarPendientes(req, { page = 0, size = TAMANIO_PAGINA, subcategoriaId } = {}) {
  return llamar(
    req,
    `/api/asignaciones/pendientes${query({ page, size, subcategoriaId })}`,
    {},
    "No se pudo cargar la lista de donaciones pendientes.",
  );
}

/** Ranking completo de una donación. 404 si ya no está en depósito. */
export function obtenerRanking(req, donacionId) {
  return llamar(
    req,
    `/api/asignaciones/pendientes/${segmento(donacionId)}`,
    {},
    `No se pudo cargar el ranking de la donación #${donacionId}.`,
  );
}

export function asignarDonacion(req, donacionId, entidadId) {
  return llamar(
    req,
    `/api/donaciones/${segmento(donacionId)}`,
    { method: "PATCH", body: { tipoEstado: "ASIGNACION_REALIZADA", entidadId } },
    `No se pudo asignar la donación #${donacionId}. Probá de nuevo en unos minutos.`,
  );
}

export function marcarVencida(req, donacionId) {
  return llamar(
    req,
    `/api/donaciones/${segmento(donacionId)}`,
    { method: "PATCH", body: { tipoEstado: "VENCIDA" } },
    `No se pudo marcar como vencida la donación #${donacionId}.`,
  );
}

/* ---------- Donaciones ---------- */

export function obtenerDonacion(req, donacionId) {
  return llamar(
    req,
    `/api/donaciones/${segmento(donacionId)}`,
    {},
    `No se pudo cargar la donación #${donacionId}.`,
  );
}

function fechaIngresoDescendente(a, b) {
  const porFecha = String(b.fechaIngreso ?? "").localeCompare(String(a.fechaIngreso ?? ""));
  return porFecha !== 0 ? porFecha : (b.id ?? 0) - (a.id ?? 0);
}

/**
 * Todas las donaciones, en cualquier estado, con la más reciente primero.
 *
 * Por ahora usa GET /api/donaciones, que no pagina: el estado lo filtra el backend (?tipoEstado=)
 * y la subcategoría y el orden se resuelven acá. Cuando exista GET /api/donaciones/paginadas,
 * solo cambia esta función (ver docs/coordinacion-flujo-5.md, punto 1).
 */
export async function listarDonaciones(req, { estado, subcategoriaId } = {}) {
  const respuesta = await llamar(
    req,
    `/api/donaciones${query({ tipoEstado: estado })}`,
    {},
    "No se pudo cargar la lista de donaciones.",
  );
  if (!Array.isArray(respuesta)) {
    throw new ApiError("La respuesta de donaciones no tiene el formato de lista esperado.", {
      status: 502,
      mensajeUsuario: "No se pudo cargar la lista de donaciones.",
    });
  }
  return respuesta
    .filter((donacion) => subcategoriaId == null || donacion.subcategoriaId === subcategoriaId)
    .sort(fechaIngresoDescendente);
}

export function listarSubcategorias(req) {
  return llamar(req, "/api/subcategorias", {}, "No se pudieron cargar las subcategorías.");
}

/* ---------- Entidad ---------- */

/** Donaciones asignadas a una entidad. 404 si la entidad no existe. page empieza en 0. */
export function listarDonacionesDeEntidad(req, entidadId, { estados = [], page = 0, size = TAMANIO_PAGINA } = {}) {
  return llamar(
    req,
    `/api/entidades-beneficiarias/${segmento(entidadId)}/donaciones${query({ estado: estados, page, size })}`,
    {},
    "No se pudieron cargar las donaciones asignadas.",
  );
}
