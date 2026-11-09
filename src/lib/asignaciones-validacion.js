// Lectura y validación de lo que llega en la URL y en los formularios del flujo 5.
// Todo valor inválido se descarta en lugar de romper la página.

/** Estados de una donación (TipoEstado del backend), en el orden en que se muestran en los filtros. */
export const ESTADOS_DONACION = Object.freeze([
  "EN_DEPOSITO",
  "ASIGNACION_REALIZADA",
  "LISTA_PARA_ENTREGAR",
  "EN_TRASLADO",
  "ENTREGADA",
  "ENTREGA_FALLIDA",
  "VENCIDA",
]);

/** Estados que puede tener una donación ya asignada a una entidad. */
export const ESTADOS_ENTIDAD = Object.freeze([
  "ASIGNACION_REALIZADA",
  "LISTA_PARA_ENTREGAR",
  "EN_TRASLADO",
  "ENTREGADA",
  "ENTREGA_FALLIDA",
]);

const ENTERO_POSITIVO = /^[1-9]\d*$/;

const primero = (valor) => (Array.isArray(valor) ? valor[0] : valor);

/** Id numérico positivo, o null si no es válido. */
export function leerId(valor) {
  const texto = String(primero(valor) ?? "").trim();
  if (!ENTERO_POSITIVO.test(texto)) {
    return null;
  }
  const numero = Number(texto);
  return Number.isSafeInteger(numero) ? numero : null;
}

/** Número de página tal como lo ve el usuario: desde 1. Cualquier otro valor da 1. */
export function leerPagina(valor) {
  return leerId(valor) ?? 1;
}

/** Un estado de la lista permitida, o "" (sin filtro). */
export function leerEstado(valor, permitidos = ESTADOS_DONACION) {
  const texto = String(primero(valor) ?? "").trim();
  return permitidos.includes(texto) ? texto : "";
}

/** Uno o varios estados de la lista permitida (el parámetro se puede repetir), sin repetidos. */
export function leerEstados(valor, permitidos = ESTADOS_DONACION) {
  const valores = Array.isArray(valor) ? valor : [valor];
  return [...new Set(valores.map((item) => String(item ?? "").trim()).filter((item) => permitidos.includes(item)))];
}

/**
 * Devuelve la URL a la que volver después de un POST, solo si es una ruta interna del prefijo.
 * Evita un open redirect: "//otro.sitio", "https://...", "/\otro" o rutas fuera del flujo caen en porDefecto.
 */
export function urlVolverSegura(valor, prefijo, porDefecto) {
  const texto = String(primero(valor) ?? "").trim();
  if (!texto.startsWith(prefijo) || texto.includes("\\") || /[\u0000-\u001f]/.test(texto)) {
    return porDefecto;
  }
  try {
    const base = "http://bff.local";
    const url = new URL(texto, base);
    if (url.origin !== base || !url.pathname.startsWith(prefijo)) {
      return porDefecto;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return porDefecto;
  }
}
