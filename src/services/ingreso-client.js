import { ApiError, apiRequest } from "./api-client.js";

// Cliente HTTP del flujo 3 (ingreso de donaciones). Corre en el servidor del front, nunca en el navegador.
// Usa solo servicio-donaciones: donantes, subcategorías, donaciones y la importación CSV.

export const MENSAJE_NO_DISPONIBLE = "El servicio de donaciones no está disponible en este momento";

/** La importación de ~20.000 filas es sincrónica en el backend: el timeout normal (5 s) no alcanza. */
export const TIMEOUT_IMPORTACION_MS = 120_000;

/**
 * Registrar una donación segmenta, guarda y avisa a Incentivos por cada donación resultante: puede
 * tardar más que una consulta. Con el timeout normal, una respuesta lenta parecería un fallo y
 * se volvería a enviar una donación que ya quedó registrada.
 */
export const TIMEOUT_REGISTRO_MS = 30_000;

export const MENSAJE_REGISTRO_INCIERTO =
  "El servicio tardó en responder y no sabemos si la donación se registró. Revisala en “Todas las donaciones” antes de volver a cargarla, así no se duplica.";

/** Máximo de donantes que devuelve la búsqueda del backend (DonantesService.buscarDonantes). */
export const MAX_RESULTADOS_BUSQUEDA = 20;

function textoDelBackend(data) {
  return typeof data?.mensaje === "string" && data.mensaje.trim() ? data.mensaje.trim() : undefined;
}

/**
 * Llama a servicio-donaciones y deja en el error lo que necesita el router:
 * - codigo: el codigo del ErrorDTO del backend (SOLICITUD_INVALIDA, ERROR_INTERNO...).
 * - mensajeUsuario: el mensaje del ErrorDTO si es un 4xx; si no, el texto por defecto de la acción.
 *
 * api-client.js no lee el campo "mensaje" del ErrorDTO, por eso se lee acá (igual que asignaciones-client.js).
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

/** El pedido salió pero venció el tiempo de espera: no se sabe si el backend llegó a procesarlo. */
export function esTimeout(error) {
  return error instanceof ApiError && error.status === 0 && ["TimeoutError", "AbortError"].includes(error.data?.name);
}

const segmento = (valor) => encodeURIComponent(valor);

function exigirLista(respuesta, mensajeUsuario) {
  if (!Array.isArray(respuesta)) {
    throw new ApiError("La respuesta del backend no tiene el formato de lista esperado.", { status: 502, mensajeUsuario });
  }
  return respuesta;
}

/* ---------- Donantes ---------- */

/** Busca por nombre, apellido, documento, razón social o email. El backend devuelve hasta 20. */
export async function buscarDonantes(req, texto) {
  const mensaje = "No se pudo buscar donantes.";
  const respuesta = await llamar(req, `/api/donantes?q=${segmento(texto)}`, {}, mensaje);
  return exigirLista(respuesta, mensaje);
}

export function obtenerDonante(req, donanteId) {
  return llamar(req, `/api/donantes/${segmento(donanteId)}`, {}, "No se pudo cargar el donante.");
}

export function crearDonante(req, donante) {
  return llamar(
    req,
    "/api/donantes",
    { method: "POST", body: donante },
    "No se pudo registrar el donante. Probá de nuevo en unos minutos.",
  );
}

/**
 * Importación masiva (POST multipart, campo "file"). Devuelve ImportacionCsvResultadoDTO:
 * { totalProcesados, creados, actualizados, errores: [{ linea, motivo }] }.
 * archivo: un File/Blob con name (lo que devuelve formData() de la API web).
 */
export function importarDonantes(req, archivo) {
  const form = new FormData();
  form.append("file", archivo, archivo.name);
  return llamar(
    req,
    "/api/donantes/importaciones",
    { method: "POST", form, timeoutMs: TIMEOUT_IMPORTACION_MS },
    "No se pudo importar el archivo. Probá de nuevo en unos minutos.",
  );
}

/* ---------- Catálogo ---------- */

export async function listarSubcategorias(req) {
  const mensaje = "No se pudieron cargar las subcategorías.";
  return exigirLista(await llamar(req, "/api/subcategorias", {}, mensaje), mensaje);
}

/* ---------- Donaciones ---------- */

/**
 * Registra la donación completa. El backend la segmenta por subcategoría y devuelve la LISTA de
 * donaciones resultantes (201 Created).
 */
export async function registrarDonacion(req, donacion) {
  const mensaje = "No se pudo registrar la donación. Probá de nuevo en unos minutos.";
  let respuesta;
  try {
    respuesta = await llamar(
      req,
      "/api/donaciones",
      { method: "POST", body: donacion, timeoutMs: TIMEOUT_REGISTRO_MS },
      mensaje,
    );
  } catch (error) {
    if (esTimeout(error)) {
      error.mensajeUsuario = MENSAJE_REGISTRO_INCIERTO;
    }
    throw error;
  }
  return exigirLista(respuesta, mensaje);
}

export function obtenerDonacion(req, donacionId) {
  return llamar(
    req,
    `/api/donaciones/${segmento(donacionId)}`,
    {},
    `No se pudo cargar la donación #${donacionId}.`,
  );
}
