import assert from "node:assert/strict";
import { test } from "node:test";
import { filtrarDonaciones, leerFecha } from "../src/lib/donante-filtros.js";

const subcategorias = [{ id: 1, categoriaId: 10 }, { id: 2, categoriaId: 20 }];
const donaciones = [

  { id: 1, donanteId: 7, subcategoriaId: 1, fechaIngreso: "2026-11-01T10:00:00" },
  { id: 2, donanteId: 7, subcategoriaId: 2, fechaIngreso: "2026-11-10T10:00:00" },
  { id: 3, donanteId: 8, subcategoriaId: 1, fechaIngreso: "2026-11-02T10:00:00" },

];

const ids = (lista) => lista.map((d) => d.id);

test("filtrarDonaciones deja solo las del donante", () => {
  
    assert.deepEqual(ids(filtrarDonaciones(donaciones, { donanteId: 7 }, subcategorias)), [1, 2]);
});

test("filtra por categoría, subcategoría y rango de fechas", () => {

  assert.deepEqual(ids(filtrarDonaciones(donaciones, { donanteId: 7, categoriaId: 20 }, subcategorias)), [2]);
  assert.deepEqual(ids(filtrarDonaciones(donaciones, { donanteId: 7, subcategoriaId: 1 }, subcategorias)), [1]);
  assert.deepEqual(ids(filtrarDonaciones(donaciones, { donanteId: 7, desde: "2026-11-05" }, subcategorias)), [2]);
  assert.deepEqual(ids(filtrarDonaciones(donaciones, { donanteId: 7, hasta: "2026-11-05" }, subcategorias)), [1]);

});

test("leerFecha acepta solo AAAA-MM-DD", () => {

  assert.equal(leerFecha("2026-11-05"), "2026-11-05");
  assert.equal(leerFecha("05/11/2026"), null);
  assert.equal(leerFecha(undefined), null);
  
});