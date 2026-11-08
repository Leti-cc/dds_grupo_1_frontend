// Lógica del mapa sin DOM ni Leaflet, para poder testearla.

export function tieneCoordenadas(camion) {
  return Number.isFinite(camion.latitud) && Number.isFinite(camion.longitud);
}

export function etiquetaEstado(enRuta) {
  return enRuta ? "En ruta" : "Disponible";
}

/** ultimaActualizacion ya llega relativa desde el servidor ("hace 5 min" o "Sin datos"). */
export function textoActualizado(ultimaActualizacion) {
  return ultimaActualizacion && ultimaActualizacion !== "Sin datos"
    ? `Actualizado ${ultimaActualizacion}`
    : "Sin datos de actualización";
}

export function textoDetalleLista(camion) {
  return tieneCoordenadas(camion) ? textoActualizado(camion.ultimaActualizacion) : "Sin ubicación";
}

export function textoIndicador(segundos) {
  if (segundos < 2) {
    return "Actualizado hace un instante";
  }
  return segundos < 60 ? `Actualizado hace ${segundos} s` : `Actualizado hace ${Math.floor(segundos / 60)} min`;
}

/** Compara lo que hay en pantalla con lo que llegó, para no recrear lo que sigue. */
export function diferenciar(actuales, nuevas) {
  const existentes = new Set(actuales);
  const recibidas = new Set(nuevas);
  return {
    agregar: [...recibidas].filter((clave) => !existentes.has(clave)),
    quitar: [...existentes].filter((clave) => !recibidas.has(clave)),
  };
}
