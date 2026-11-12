import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import * as ingreso from "../src/services/ingreso-client.js";

const fetchOriginal = globalThis.fetch;
const errorOriginal = console.error;
const REQ = { session: { accessToken: "tok" } };
let llamadas;
const responder = (status, cuerpo) => {
  globalThis.fetch = async (url, init) => {
    llamadas.push({ url, init });
    return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
  };
};
beforeEach(() => { llamadas = []; console.error = () => {}; });
afterEach(() => { globalThis.fetch = fetchOriginal; console.error = errorOriginal; });

test("buscarDonantes codifica el texto y manda el token", async () => {
  responder(200, []);
  await ingreso.buscarDonantes(REQ, "ana pérez");
  assert.equal(llamadas[0].url, "http://localhost:8080/api/donantes?q=ana%20p%C3%A9rez");
  assert.equal(llamadas[0].init.headers.get("Authorization"), "Bearer tok");
});

test("registrarDonacion hace POST y exige una lista", async () => {
  responder(201, [{ id: 1 }]);
  assert.deepEqual(await ingreso.registrarDonacion(REQ, { donanteId: 1 }), [{ id: 1 }]);
  assert.equal(llamadas[0].init.method, "POST");
  responder(201, { id: 1 });
  await assert.rejects(ingreso.registrarDonacion(REQ, {}), (e) => e.status === 502);
});

test("los errores 4xx traen el mensaje del ErrorDTO", async () => {
  responder(400, { status: 400, codigo: "SOLICITUD_INVALIDA", mensaje: "El donante indicado no existe." });
  await assert.rejects(ingreso.crearDonante(REQ, {}), (e) => e.mensajeUsuario === "El donante indicado no existe." && e.codigo === "SOLICITUD_INVALIDA");
});

test("un timeout al registrar avisa que no se sabe si quedó registrada", async () => {
  globalThis.fetch = async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); };
  await assert.rejects(ingreso.registrarDonacion(REQ, {}), (e) => e.mensajeUsuario === ingreso.MENSAJE_REGISTRO_INCIERTO);
});

test("importarDonantes sube multipart con el campo file", async () => {
  responder(200, { totalProcesados: 1, creados: 1, actualizados: 0, errores: [] });
  await ingreso.importarDonantes(REQ, new File(["a"], "d.csv"));
  assert.ok(llamadas[0].init.body instanceof FormData);
  assert.equal(llamadas[0].init.body.get("file").name, "d.csv");
});
