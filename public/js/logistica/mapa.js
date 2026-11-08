// Mapa de camiones: Leaflet + lista accesible, alimentados por polling contra el servidor del front.
import {
  diferenciar,
  etiquetaEstado,
  textoActualizado,
  textoDetalleLista,
  textoIndicador,
  tieneCoordenadas,
} from "./mapa-datos.js";
import { crearPoller } from "./poller.js";

/* global L */

const URL_DATOS = "/admin/logistica/mapa/datos";
const MENSAJE_GENERICO = "No se pudo actualizar el mapa. Se va a reintentar en unos segundos.";
const CENTRO_CABA = [-34.6037, -58.3816];
const ZOOM_INICIAL = 12;
const ZOOM_DETALLE = 15;

const raiz = document.querySelector("[data-mapa]");
const lista = raiz.querySelector("[data-mapa-lista]");
const vacio = raiz.querySelector("[data-mapa-vacio]");
const indicador = raiz.querySelector("[data-mapa-indicador]");
const banner = raiz.querySelector("[data-mapa-banner]");
const bannerTexto = raiz.querySelector("[data-mapa-banner-texto]");
const reintentar = raiz.querySelector("[data-mapa-reintentar]");
const cargando = raiz.querySelector("[data-mapa-cargando]");
const canvas = raiz.querySelector("#mapa-camiones");

const animar = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const mapa = L.map(canvas, { zoomAnimation: animar, fadeAnimation: animar, markerZoomAnimation: animar });
mapa.setView(CENTRO_CABA, ZOOM_INICIAL);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(mapa);
mapa.attributionControl.setPrefix(false);

const marcadores = new Map();
const items = new Map();
let ultimaActualizacion = null;

function crearIcono(enRuta) {
  return L.divIcon({
    className: `mapa-marker ${enRuta ? "mapa-marker-ruta" : "mapa-marker-disponible"}`,
    html: `<span class="mapa-glifo" aria-hidden="true">${enRuta ? "▶" : "✓"}</span>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -18],
  });
}

const tituloMarcador = (camion) => `${camion.patente}: ${etiquetaEstado(camion.enRuta)}`;

/* ---------- Marcadores ---------- */

function crearPopup() {
  const nodo = document.createElement("div");
  nodo.className = "mapa-popup";
  const patente = document.createElement("strong");
  const estado = document.createElement("span");
  const actualizado = document.createElement("span");
  nodo.append(patente, estado, actualizado);
  return { nodo, patente, estado, actualizado };
}

function pintarPopup(popup, camion) {
  popup.patente.textContent = camion.patente;
  popup.estado.textContent = etiquetaEstado(camion.enRuta);
  popup.actualizado.textContent = textoActualizado(camion.ultimaActualizacion);
}

function crearMarcador(camion) {
  const popup = crearPopup();
  const marker = L.marker([camion.latitud, camion.longitud], {
    icon: crearIcono(camion.enRuta),
    title: tituloMarcador(camion),
  })
    .bindPopup(popup.nodo)
    .addTo(mapa);
  marcadores.set(camion.patente, { marker, popup, enRuta: camion.enRuta });
}

function actualizarMarcadores(camiones) {
  const conUbicacion = camiones.filter(tieneCoordenadas);
  const { quitar } = diferenciar(marcadores.keys(), conUbicacion.map((camion) => camion.patente));
  quitar.forEach((patente) => {
    marcadores.get(patente).marker.remove();
    marcadores.delete(patente);
  });

  conUbicacion.forEach((camion) => {
    if (!marcadores.has(camion.patente)) {
      crearMarcador(camion);
    }
    const actual = marcadores.get(camion.patente);
    actual.marker.setLatLng([camion.latitud, camion.longitud]);
    if (actual.enRuta !== camion.enRuta) {
      actual.enRuta = camion.enRuta;
      actual.marker.options.title = tituloMarcador(camion);
      actual.marker.setIcon(crearIcono(camion.enRuta));
      // setIcon reutiliza el nodo del divIcon y no reescribe el title.
      actual.marker.getElement()?.setAttribute("title", tituloMarcador(camion));
    }
    pintarPopup(actual.popup, camion);
  });
}

/* ---------- Lista accesible ---------- */

function enfocarCamion(patente) {
  const actual = marcadores.get(patente);
  if (!actual) {
    return;
  }
  mapa.setView(actual.marker.getLatLng(), Math.max(mapa.getZoom(), ZOOM_DETALLE), { animate: animar });
  actual.marker.openPopup();
}

function crearItem(patente) {
  const li = document.createElement("li");
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "mapa-item";
  const nombre = document.createElement("strong");
  nombre.textContent = patente;
  const estado = document.createElement("span");
  const detalle = document.createElement("span");
  detalle.className = "mapa-item-detalle";
  boton.append(nombre, estado, detalle);
  boton.addEventListener("click", () => enfocarCamion(patente));
  li.append(boton);
  lista.append(li);
  items.set(patente, { li, boton, estado, detalle });
}

// Se actualiza en el lugar para que un ciclo de polling no le saque el foco a quien usa teclado.
function actualizarLista(camiones) {
  const { agregar, quitar } = diferenciar(items.keys(), camiones.map((camion) => camion.patente));
  quitar.forEach((patente) => {
    items.get(patente).li.remove();
    items.delete(patente);
  });
  agregar.forEach(crearItem);

  camiones.forEach((camion) => {
    const item = items.get(camion.patente);
    item.estado.className = `tag ${camion.enRuta ? "tag-blue" : "tag-green"}`;
    item.estado.textContent = etiquetaEstado(camion.enRuta);
    item.detalle.textContent = textoDetalleLista(camion);
    if (tieneCoordenadas(camion)) {
      item.boton.removeAttribute("aria-disabled");
    } else {
      item.boton.setAttribute("aria-disabled", "true");
    }
  });
  vacio.hidden = camiones.length > 0;
}

/* ---------- Estado de la pantalla ---------- */

function terminarCargaInicial() {
  cargando.hidden = true;
  lista.removeAttribute("aria-busy");
  lista.querySelectorAll("[data-mapa-skeleton]").forEach((skeleton) => skeleton.remove());
}

function mostrarBanner(mensaje) {
  bannerTexto.textContent = mensaje;
  banner.hidden = false;
}

function ocultarBanner() {
  if (banner.hidden) {
    return;
  }
  // El botón Reintentar desaparece con el banner: el foco no se puede perder con él.
  if (document.activeElement === reintentar) {
    canvas.focus();
  }
  banner.hidden = true;
}

function pintarIndicador() {
  if (ultimaActualizacion !== null) {
    indicador.textContent = textoIndicador(Math.floor((Date.now() - ultimaActualizacion) / 1000));
  }
}

async function pedirDatos() {
  let respuesta;
  let cuerpo;
  try {
    respuesta = await fetch(URL_DATOS, { headers: { Accept: "application/json" }, cache: "no-store" });
    cuerpo = await respuesta.json();
  } catch {
    throw new Error(MENSAJE_GENERICO);
  }
  if (!respuesta.ok || !Array.isArray(cuerpo)) {
    throw new Error(cuerpo?.mensaje ?? MENSAJE_GENERICO);
  }
  return cuerpo;
}

async function actualizar() {
  indicador.textContent = "Actualizando…";
  try {
    const camiones = await pedirDatos();
    actualizarMarcadores(camiones);
    actualizarLista(camiones);
    ultimaActualizacion = Date.now();
    ocultarBanner();
  } catch (error) {
    mostrarBanner(error.message);
  } finally {
    terminarCargaInicial();
    if (ultimaActualizacion === null) {
      indicador.textContent = "Sin actualizar";
    } else {
      pintarIndicador();
    }
  }
}

/* ---------- Polling ---------- */

const poller = crearPoller({
  tarea: actualizar,
  intervaloMs: Number(raiz.dataset.pollingMs),
  estaVisible: () => document.visibilityState === "visible",
});

reintentar.addEventListener("click", () => poller.consultarAhora());
document.addEventListener("visibilitychange", () => poller.visibilidadCambio());
window.setInterval(() => {
  if (document.visibilityState === "visible" && indicador.textContent !== "Actualizando…") {
    pintarIndicador();
  }
}, 1000);

poller.iniciar();
