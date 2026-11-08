import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { ApiError, parseResponseBody } from "../src/services/api-client.js";
import * as logistica from "../src/services/logistica-client.js";

const fetchOriginal = globalThis.fetch;
const consoleErrorOriginal = console.error;
const SPRING_500 = '{"timestamp":"2026-11-05T10:00:00","status":500,"error":"Internal Server Error","path":"/x"}';
const REQ = { session: { accessToken: "tok-123" } };
let llamadas;

function responder(status, cuerpo, contentType) {
  globalThis.fetch = async (url, init) => {
    llamadas.push({ url, init });
    return new Response(cuerpo, { status, headers: contentType ? { "content-type": contentType } : {} });
  };
}

beforeEach(() => {
  llamadas = [];
  console.error = () => {};
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  console.error = consoleErrorOriginal;
});

test("parseResponseBody interpreta JSON y texto según el content-type", () => {
  assert.deepEqual(parseResponseBody('{"a":1}', "application/json"), { a: 1 });
  assert.equal(parseResponseBody("Camión dado de baja.", "text/plain;charset=UTF-8"), "Camión dado de baja.");
  assert.equal(parseResponseBody('{"a":1}', "text/plain"), '{"a":1}');
  assert.equal(parseResponseBody("", "application/json"), null);
  assert.equal(parseResponseBody("no es json", "application/json"), "no es json");
  assert.deepEqual(parseResponseBody("[1]", ""), [1]);
});

test("una respuesta JSON llega parseada y va a la URL del contrato", async () => {
  responder(200, '[{"patente":"AB123CD"}]', "application/json");
  assert.deepEqual(await logistica.listarCamiones(REQ), [{ patente: "AB123CD" }]);
  assert.equal(llamadas[0].url, "http://localhost:8083/api/logistica/camiones");
});

test("una respuesta text/plain llega como texto", async () => {
  responder(202, "Solicitud enviada", "text/plain;charset=UTF-8");
  assert.equal(await logistica.solicitarPlanificacion(REQ), "Solicitud enviada");
  assert.equal(llamadas[0].init.method, "POST");
});

test("manda el token de la sesión solo si existe", async () => {
  responder(200, "[]", "application/json");
  await logistica.listarCamiones(REQ);
  await logistica.listarCamiones({ session: {} });
  assert.equal(llamadas[0].init.headers.get("Authorization"), "Bearer tok-123");
  assert.equal(llamadas[1].init.headers.has("Authorization"), false);
});

test("iniciarRuta hace PATCH con estado EN_CURSO y escapa la patente", async () => {
  responder(200, "ok", "text/plain");
  await logistica.iniciarRuta(REQ, "AB/1");
  assert.match(llamadas[0].url, /camiones\/AB%2F1\/ruta-activa$/);
  assert.equal(llamadas[0].init.method, "PATCH");
  assert.equal(llamadas[0].init.body, '{"estado":"EN_CURSO"}');
});

test("listarEntregas agrega el estado solo cuando se pide", async () => {
  responder(200, "[]", "application/json");
  await logistica.listarEntregas(REQ, "PENDIENTE");
  await logistica.listarEntregas(REQ);
  assert.match(llamadas[0].url, /\/entregas\?estado=PENDIENTE$/);
  assert.match(llamadas[1].url, /\/entregas$/);
});

test("un 500 da un ApiError con mensaje de la acción, sin el JSON de Spring", async () => {
  responder(500, SPRING_500, "application/json");
  await assert.rejects(logistica.darDeBajaCamion(REQ, "AB123CD"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 500);
    assert.match(error.mensajeUsuario, /No se pudo dar de baja el camión AB123CD/);
    assert.doesNotMatch(error.mensajeUsuario, /Internal Server Error|timestamp/);
    return true;
  });
});

test("un 500 al crear se informa como patente repetida", async () => {
  responder(500, SPRING_500, "application/json");
  await assert.rejects(logistica.crearCamion(REQ, { patente: "AB123CD" }), {
    mensajeUsuario: "Ya existe un camión con esa patente",
  });
});

test("sin conexión da status 0 y el mensaje de servicio no disponible", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(logistica.listarCamiones(REQ), (error) => {
    assert.equal(error.status, 0);
    assert.equal(error.mensajeUsuario, logistica.MENSAJE_NO_DISPONIBLE);
    assert.equal(logistica.esServicioNoDisponible(error), true);
    return true;
  });
});

test("un timeout durante la lectura del cuerpo también es servicio no disponible", async () => {
  globalThis.fetch = async () => ({
    text: async () => {
      throw new DOMException("timeout", "TimeoutError");
    },
  });
  await assert.rejects(logistica.listarCamiones(REQ), (error) => logistica.esServicioNoDisponible(error));
});

test("un error HTTP no se considera servicio no disponible", async () => {
  responder(500, SPRING_500, "application/json");
  await assert.rejects(logistica.listarCamiones(REQ), (error) => !logistica.esServicioNoDisponible(error));
});
