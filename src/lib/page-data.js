import { ApiError } from "../services/api-client.js";

export function readArray(value, endpointName) {
  if (!Array.isArray(value)) {
    throw new Error(`La respuesta de ${endpointName} no tiene el formato de lista esperado.`);
  }
  return value;
}

export async function loadSection(request, normalize = (value) => value) {
  try {
    return { data: normalize(await request()) };
  } catch (error) {
    return { error: error.message || "No se pudo cargar la información." };
  }
}

export function normalizeDelivery(delivery) {
  const latestEvent = delivery.historial?.at(-1);
  return {
    ...delivery,
    displayName: `Donación ${delivery.donacionId ?? delivery.id}`,
    displayDescription: delivery.direccionDestino ?? "Destino no informado",
    updatedAt: latestEvent?.fecha ?? "Sin actualización",
  };
}

const ROUTES_BY_ROLE = {
  DONANTE: "/donante",
  ROLE_DONANTE: "/donante",
  ENTIDAD: "/entidad",
  ENTIDAD_BENEFICIARIA: "/entidad",
  ROLE_ENTIDAD_BENEFICIARIA: "/entidad",
  ADMIN: "/administracion",
  ADMINISTRADOR: "/administracion",
  ROLE_ADMIN: "/administracion",
  ROLE_ADMINISTRADOR: "/administracion",
  LOGISTICA_ADMIN: "/administracion",
  ROLE_LOGISTICA_ADMIN: "/administracion",
};

export function getRoleRoute(role) {
  return ROUTES_BY_ROLE[role] ?? "/";
}

/** Status HTTP para volver a renderizar un formulario con error (siempre 4xx). */
export function formErrorStatus(error) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return error.status;
  }
  return 422;
}

/** Lee un campo de texto del body (urlencoded) ya recortado. */
export function field(body, name) {
  return String(body?.[name] ?? "").trim();
}
