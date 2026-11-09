import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { ApiError } from "../src/services/api-client.js";
import * as asignaciones from "../src/services/asignaciones-client.js";

const fetchOriginal = globalThis.fetch;
const consoleErrorOriginal = console.error;
const REQ = { session: { accessToken: "tok-123" } };
let llamadas;

function responder(status, cuerpo, contentType = "application/json") {
  globalThis.fetch = async (url, init) => {
    llamadas.push({ url, init });
    const texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
    return new Response(texto, { status, headers: { "content-type": contentType } });
  };
}

const errorDTO = (status, codigo, mensaje) => ({ status, codigo, mensaje });

beforeEach(() => {
  llamadas = [];
  console.error = () => {};
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  console.error = consoleErrorOriginal;
});

test("listarPendientes pide la página, el tamaño y la subcategoría solo si viene", async () => {
  responder(200, { contenido: [], pagina: 0, tamanio: 20, totalElementos: 0, totalPaginas: 0 });
  await asignaciones.listarPendientes(REQ, { page: 2, subcategoriaId: 3 });
  await asignaciones.listarPendientes(REQ);
  assert.equal(llamadas[0].url, "http://localhost:8080/api/asignaciones/pendientes?page=2&size=20&subcategoriaId=3");
  assert.equal(llamadas[1].url, "http://localhost:8080/api/asignaciones/pendientes?page=0&size=20");
  assert.equal(llamadas[0].init.headers.get("Authorization"), "Bearer tok-123");
});

test("asignarDonacion hace PATCH con ASIGNACION_REALIZADA y la entidad", async () => {
  responder(200, { id: 128, estado: "ASIGNACION_REALIZADA" });
  await asignaciones.asignarDonacion(REQ, 128, 4);
  assert.equal(llamadas[0].url, "http://localhost:8080/api/donaciones/128");
  assert.equal(llamadas[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(llamadas[0].init.body), { tipoEstado: "ASIGNACION_REALIZADA", entidadId: 4 });
});

test("marcarVencida hace PATCH con VENCIDA y sin entidad", async () => {
  responder(200, { id: 128, estado: "VENCIDA" });
  await asignaciones.marcarVencida(REQ, 128);
  assert.deepEqual(JSON.parse(llamadas[0].init.body), { tipoEstado: "VENCIDA" });
});

test("un 4xx con ErrorDTO deja el codigo y usa el mensaje del backend", async () => {
  responder(409, errorDTO(409, "CONFLICTO_CONCURRENCIA", "Otra persona ya actualizó esta donación."));
  await assert.rejects(asignaciones.asignarDonacion(REQ, 128, 4), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.codigo, "CONFLICTO_CONCURRENCIA");
    assert.equal(error.mensajeUsuario, "Otra persona ya actualizó esta donación.");
    return true;
  });
});

test("un 4xx sin ErrorDTO usa el texto de la acción", async () => {
  responder(404, "");
  await assert.rejects(asignaciones.obtenerRanking(REQ, 128), (error) => {
    assert.equal(error.status, 404);
    assert.equal(error.codigo, undefined);
    assert.equal(error.mensajeUsuario, "No se pudo cargar el ranking de la donación #128.");
    return true;
  });
});

test("un 500 usa el texto de la acción aunque el backend mande mensaje", async () => {
  responder(500, errorDTO(500, "ERROR_INTERNO", "Ocurrió un error inesperado."));
  await assert.rejects(asignaciones.marcarVencida(REQ, 7), {
    codigo: "ERROR_INTERNO",
    mensajeUsuario: "No se pudo marcar como vencida la donación #7.",
  });
});

test("sin conexión da status 0 y el mensaje de servicio no disponible", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(asignaciones.listarPendientes(REQ), (error) => {
    assert.equal(asignaciones.esServicioNoDisponible(error), true);
    assert.equal(error.mensajeUsuario, asignaciones.MENSAJE_NO_DISPONIBLE);
    return true;
  });
});

test("listarDonaciones filtra el estado en el backend y la subcategoría en el BFF, la más reciente primero", async () => {
  responder(200, [
    { id: 1, subcategoriaId: 3, fechaIngreso: "2026-11-01T10:00:00" },
    { id: 2, subcategoriaId: 5, fechaIngreso: "2026-11-07T10:00:00" },
    { id: 3, subcategoriaId: 3, fechaIngreso: "2026-11-05T10:00:00" },
    { id: 4, subcategoriaId: 3, fechaIngreso: "2026-11-05T10:00:00" },
  ]);
  const todas = await asignaciones.listarDonaciones(REQ, { estado: "VENCIDA" });
  const deUna = await asignaciones.listarDonaciones(REQ, { subcategoriaId: 3 });
  assert.equal(llamadas[0].url, "http://localhost:8080/api/donaciones?tipoEstado=VENCIDA");
  assert.equal(llamadas[1].url, "http://localhost:8080/api/donaciones");
  assert.deepEqual(todas.map((donacion) => donacion.id), [2, 4, 3, 1]);
  assert.deepEqual(deUna.map((donacion) => donacion.id), [4, 3, 1]);
});

test("listarDonaciones rechaza una respuesta que no es lista", async () => {
  responder(200, { contenido: [] });
  await assert.rejects(asignaciones.listarDonaciones(REQ), { mensajeUsuario: "No se pudo cargar la lista de donaciones." });
});

test("listarDonacionesDeEntidad repite el parámetro estado", async () => {
  responder(200, { contenido: [], pagina: 1, tamanio: 20, totalElementos: 0, totalPaginas: 0 });
  await asignaciones.listarDonacionesDeEntidad(REQ, 4, { estados: ["EN_TRASLADO", "ENTREGADA"], page: 1 });
  assert.equal(
    llamadas[0].url,
    "http://localhost:8080/api/entidades-beneficiarias/4/donaciones?estado=EN_TRASLADO&estado=ENTREGADA&page=1&size=20",
  );
});
