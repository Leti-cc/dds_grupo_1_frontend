import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ESTADOS_ENTIDAD,
  leerEstado,
  leerEstados,
  leerId,
  leerPagina,
  urlVolverSegura,
} from "../src/lib/asignaciones-validacion.js";

test("leerId acepta solo enteros positivos", () => {
  assert.equal(leerId("128"), 128);
  assert.equal(leerId(" 7 "), 7);
  assert.equal(leerId(["5", "6"]), 5);
  for (const invalido of ["0", "-3", "1.5", "abc", "", undefined, null, "12abc", "99999999999999999999"]) {
    assert.equal(leerId(invalido), null, `debería rechazar ${invalido}`);
  }
});

test("leerPagina devuelve 1 ante cualquier valor inválido", () => {
  assert.equal(leerPagina("3"), 3);
  assert.equal(leerPagina("0"), 1);
  assert.equal(leerPagina("-1"), 1);
  assert.equal(leerPagina(undefined), 1);
});

test("leerEstado solo deja pasar estados permitidos", () => {
  assert.equal(leerEstado("VENCIDA"), "VENCIDA");
  assert.equal(leerEstado("vencida"), "");
  assert.equal(leerEstado("VENCIDA", ESTADOS_ENTIDAD), "");
  assert.equal(leerEstado(undefined), "");
});

test("leerEstados acepta el parámetro repetido y descarta inválidos y repetidos", () => {
  assert.deepEqual(leerEstados(["EN_TRASLADO", "X", "EN_TRASLADO", "ENTREGADA"]), ["EN_TRASLADO", "ENTREGADA"]);
  assert.deepEqual(leerEstados("ENTREGADA"), ["ENTREGADA"]);
  assert.deepEqual(leerEstados(undefined), []);
});

test("urlVolverSegura acepta rutas internas del flujo y conserva la query", () => {
  const prefijo = "/admin/donaciones/";
  const porDefecto = "/admin/donaciones/pendientes";
  assert.equal(
    urlVolverSegura("/admin/donaciones/pendientes?page=2&subcategoriaId=3", prefijo, porDefecto),
    "/admin/donaciones/pendientes?page=2&subcategoriaId=3",
  );
  assert.equal(urlVolverSegura("/admin/donaciones/todas#x", prefijo, porDefecto), "/admin/donaciones/todas");
});

test("urlVolverSegura evita el open redirect y las rutas fuera del flujo", () => {
  const prefijo = "/admin/donaciones/";
  const porDefecto = "/admin/donaciones/pendientes";
  for (const peligrosa of [
    "https://malo.com/admin/donaciones/",
    "//malo.com/admin/donaciones/",
    "/\\malo.com",
    "/admin/donaciones/../../logout",
    "/admin/logistica/camiones",
    "/admin/donaciones/\\malo.com",
    "/admin/donaciones/x\nLocation: https://malo.com",
    "",
    undefined,
  ]) {
    assert.equal(urlVolverSegura(peligrosa, prefijo, porDefecto), porDefecto, `debería rechazar ${peligrosa}`);
  }
});
