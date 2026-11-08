import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import express from "express";
import {
  diferenciar,
  etiquetaEstado,
  textoActualizado,
  textoDetalleLista,
  textoIndicador,
  tieneCoordenadas,
} from "../public/js/logistica/mapa-datos.js";
import logisticaRoutes from "../routes/logistica.js";
import { leerPollingMs } from "../src/config.js";
import { datosMapa } from "../src/lib/logistica-vista.js";

const AHORA = new Date(2026, 10, 5, 12, 0, 0).getTime();
const CAMION = {
  patente: "AB123CD",
  capacidadVolumen: 10,
  altura: 2.5,
  capacidadCarga: 1500,
  activo: true,
  latitud: -34.6,
  longitud: -58.4,
  ultimaActualizacionUbicacion: "2026-11-05T11:55:00",
  rutaActiva: null,
};

test("datosMapa devuelve solo los 5 campos del contrato del front", () => {
  assert.deepEqual(datosMapa([CAMION], AHORA), [
    { patente: "AB123CD", latitud: -34.6, longitud: -58.4, enRuta: false, ultimaActualizacion: "hace 5 min" },
  ]);
});

test("datosMapa marca enRuta según rutaActiva", () => {
  const [camion] = datosMapa([{ ...CAMION, rutaActiva: { id: "r1" } }], AHORA);
  assert.equal(camion.enRuta, true);
});

test("datosMapa conserva la falta de ubicación", () => {
  const sinDatos = { ...CAMION, latitud: null, longitud: undefined, ultimaActualizacionUbicacion: null };
  assert.deepEqual(datosMapa([sinDatos], AHORA), [
    { patente: "AB123CD", latitud: null, longitud: null, enRuta: false, ultimaActualizacion: "Sin datos" },
  ]);
});

test("MAPA_POLLING_MS usa el valor válido y si no, 10 segundos", () => {
  assert.equal(leerPollingMs("15000"), 15000);
  assert.equal(leerPollingMs("1000"), 1000);
  for (const invalido of [undefined, "", "abc", "0", "-5", "999", "Infinity"]) {
    assert.equal(leerPollingMs(invalido), 10000, String(invalido));
  }
});

test("tieneCoordenadas exige latitud y longitud numéricas", () => {
  assert.equal(tieneCoordenadas({ latitud: -34.6, longitud: -58.4 }), true);
  assert.equal(tieneCoordenadas({ latitud: 0, longitud: 0 }), true);
  assert.equal(tieneCoordenadas({ latitud: null, longitud: -58.4 }), false);
  assert.equal(tieneCoordenadas({ latitud: -34.6, longitud: null }), false);
  assert.equal(tieneCoordenadas({ latitud: "-34.6", longitud: "-58.4" }), false);
  assert.equal(tieneCoordenadas({}), false);
});

test("arma los textos de estado y actualización", () => {
  assert.equal(etiquetaEstado(true), "En ruta");
  assert.equal(etiquetaEstado(false), "Disponible");
  assert.equal(textoActualizado("hace 5 min"), "Actualizado hace 5 min");
  assert.equal(textoActualizado("Sin datos"), "Sin datos de actualización");
  assert.equal(textoDetalleLista({ latitud: null, longitud: null, ultimaActualizacion: "Sin datos" }), "Sin ubicación");
  assert.equal(textoDetalleLista({ latitud: 1, longitud: 2, ultimaActualizacion: "hace 1 h" }), "Actualizado hace 1 h");
});

test("textoIndicador expresa el tiempo desde la última actualización", () => {
  assert.equal(textoIndicador(0), "Actualizado hace un instante");
  assert.equal(textoIndicador(2), "Actualizado hace 2 s");
  assert.equal(textoIndicador(59), "Actualizado hace 59 s");
  assert.equal(textoIndicador(125), "Actualizado hace 2 min");
});

test("diferenciar separa lo que hay que agregar y quitar, sin tocar lo que sigue", () => {
  assert.deepEqual(diferenciar(["A", "B"], ["B", "C"]), { agregar: ["C"], quitar: ["A"] });
  assert.deepEqual(diferenciar(["A"], ["A"]), { agregar: [], quitar: [] });
  assert.deepEqual(diferenciar(new Map([["A", 1]]).keys(), []), { agregar: [], quitar: ["A"] });
});

/* ---------- Endpoint JSON del front ---------- */

const fetchOriginal = globalThis.fetch;
const consoleErrorOriginal = console.error;
let servidor;
let base;
let respuestaBackend;

before(async () => {
  console.error = () => {};
  globalThis.fetch = async (url, init) => {
    if (String(url).includes(":8083")) {
      return respuestaBackend();
    }
    return fetchOriginal(url, init);
  };
  const app = express();
  app.use(logisticaRoutes);
  await new Promise((resolve) => { servidor = app.listen(0, resolve); });
  base = `http://localhost:${servidor.address().port}`;
});

after(async () => {
  globalThis.fetch = fetchOriginal;
  console.error = consoleErrorOriginal;
  servidor.closeAllConnections?.();
  await new Promise((resolve) => { servidor.close(resolve); });
});

beforeEach(() => {
  respuestaBackend = () => new Response(JSON.stringify([CAMION]), { headers: { "content-type": "application/json" } });
});

test("GET /mapa/datos responde JSON sin cache y solo con los campos permitidos", async () => {
  const respuesta = await fetch(`${base}/mapa/datos`);
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get("cache-control"), "no-store");
  const [camion] = await respuesta.json();
  assert.deepEqual(Object.keys(camion).sort(), ["enRuta", "latitud", "longitud", "patente", "ultimaActualizacion"]);
});

test("GET /mapa/datos responde 503 si el servicio no está disponible", async () => {
  respuestaBackend = () => {
    throw new TypeError("fetch failed");
  };
  const respuesta = await fetch(`${base}/mapa/datos`);
  assert.equal(respuesta.status, 503);
  assert.deepEqual(await respuesta.json(), { mensaje: "El servicio de logística no está disponible en este momento" });
});

test("GET /mapa/datos responde 502 ante un error del backend, sin filtrar su detalle", async () => {
  respuestaBackend = () => new Response('{"status":500,"error":"Internal Server Error"}', {
    status: 500,
    headers: { "content-type": "application/json" },
  });
  const respuesta = await fetch(`${base}/mapa/datos`);
  assert.equal(respuesta.status, 502);
  const cuerpo = await respuesta.text();
  assert.doesNotMatch(cuerpo, /Internal Server Error/);
});

test("GET /mapa/datos responde 502 si la lista no tiene el formato esperado", async () => {
  respuestaBackend = () => new Response('{"no":"lista"}', { headers: { "content-type": "application/json" } });
  const respuesta = await fetch(`${base}/mapa/datos`);
  assert.equal(respuesta.status, 502);
});
