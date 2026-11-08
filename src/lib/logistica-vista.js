import { fechaCorta, fechaHora, fechaRelativa, formatoNumero, horaMinuto } from "./logistica-format.js";

export function vistaCamion(camion, ahora = Date.now()) {
  return {
    ...camion,
    patenteUrl: encodeURIComponent(camion.patente),
    enRuta: camion.rutaActiva != null,
    cargaTexto: formatoNumero(camion.capacidadCarga),
    volumenTexto: formatoNumero(camion.capacidadVolumen),
    alturaTexto: formatoNumero(camion.altura),
    ultimaUbicacion: fechaRelativa(camion.ultimaActualizacionUbicacion, ahora),
  };
}

/** Lo único que recibe el navegador para el mapa, en el formato de /admin/logistica/mapa/datos. */
export function datosMapa(camiones, ahora = Date.now()) {
  return camiones.map((camion) => ({
    patente: camion.patente,
    latitud: camion.latitud ?? null,
    longitud: camion.longitud ?? null,
    enRuta: camion.rutaActiva != null,
    ultimaActualizacion: fechaRelativa(camion.ultimaActualizacionUbicacion, ahora),
  }));
}

export function vistaEntrega(entrega) {
  return { ...entrega, fechaCreacionTexto: fechaHora(entrega.fechaCreacion) };
}

function compararOrdenVisita(a, b) {
  return (a.ordenVisita ?? Number.MAX_SAFE_INTEGER) - (b.ordenVisita ?? Number.MAX_SAFE_INTEGER);
}

function textoConfirmacionInicio(cantidad) {
  return cantidad === 1
    ? "La entrega pasará a En camino y se notificará a las entidades y donantes."
    : `Las ${cantidad} entregas pasarán a En camino y se notificará a las entidades y donantes.`;
}

export function vistaRuta(ruta) {
  const entregas = [...(ruta.entregas ?? [])].sort(compararOrdenVisita);
  const iniciada = ruta.fechaHoraInicio != null;
  return {
    ...ruta,
    entregas,
    patenteUrl: encodeURIComponent(ruta.patenteCamion),
    fechaTexto: fechaCorta(ruta.fechaPlanificacion),
    cantidadTexto: textoCantidadEntregas(entregas.length),
    iniciada,
    estadoTexto: iniciada ? `En curso desde ${horaMinuto(ruta.fechaHoraInicio)}` : "Lista para salir",
    confirmacionInicio: textoConfirmacionInicio(entregas.length),
  };
}

export function textoCantidadEntregas(cantidad) {
  return `${cantidad} ${cantidad === 1 ? "entrega" : "entregas"}`;
}

export function textoEntregasPendientes(cantidad) {
  return cantidad === 1 ? "1 entrega pendiente" : `${cantidad} entregas pendientes`;
}
