export const MAX_ENTREGAS_POR_LOTE = 100;

/**
 * Hace de optimizador externo en la demo: reparte las entregas entre los camiones disponibles
 * en round-robin y arma el body del webhook POST /rutas.
 */
export function armarRutasSimuladas(entregas, camiones) {
  const disponibles = camiones.filter(
    (camion) => camion.rutaActiva == null && camion.activo !== false,
  );
  if (disponibles.length === 0) {
    return [];
  }

  const rutas = disponibles.map((camion) => ({ patenteCamion: camion.patente, entregas: [] }));
  entregas.slice(0, MAX_ENTREGAS_POR_LOTE).forEach((entrega, indice) => {
    const ruta = rutas[indice % rutas.length];
    ruta.entregas.push({
      id: entrega.id,
      donacionId: entrega.donacionId,
      direccionDestino: entrega.direccionDestino,
      ordenVisita: ruta.entregas.length + 1,
    });
  });

  return rutas.filter((ruta) => ruta.entregas.length > 0);
}
