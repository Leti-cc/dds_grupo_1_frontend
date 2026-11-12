import assert from "node:assert/strict";
import { test } from "node:test";
import { gruposSubcategoria, pasosIngreso, vistaDonante, vistaFilas, vistaResultadoImportacion, vistaSegmentacion } from "../src/lib/ingreso-vista.js";

test("pasosIngreso marca hecho, actual y pendiente", () => {
  const pasos = pasosIngreso(2, { 1: "/x" });
  assert.deepEqual(pasos.map((p) => p.estado), ["hecho", "actual", "pendiente"]);
  assert.equal(pasos[0].href, "/x");
  assert.equal(pasos[1].href, null);
});

test("vistaDonante resuelve humana y jurídica", () => {
  const h = vistaDonante({ id: 1, tipo: "HUMANA", nombre: "Ana", apellido: "Pérez", dni: "1", contactos: [{ medio: "MAIL", valor: "a@b.com" }] });
  assert.equal(h.nombre, "Ana Pérez");
  assert.equal(h.email, "a@b.com");
  assert.equal(h.hrefElegir, "/admin/donaciones/nueva/1");
  const j = vistaDonante({ id: 2, tipo: "JURIDICA", razonSocial: "X SA", cuit: "30-1", tipoPersonaJuridica: "ONG" });
  assert.equal(j.documentoEtiqueta, "CUIT");
  assert.equal(j.email, "—");
});

test("gruposSubcategoria agrupa por categoría con sus banderas", () => {
  const g = gruposSubcategoria([
    { id: 2, nombre: "Sillas", categoriaNombre: "Mobiliario", requiereEstadoUso: true },
    { id: 1, nombre: "Arroz", categoriaNombre: "Alimentos", perecedero: true },
  ], 1);
  assert.deepEqual(g.map((x) => x.categoria), ["Alimentos", "Mobiliario"]);
  assert.equal(g[0].opciones[0].seleccionado, true);
  assert.equal(g[1].opciones[0].requiereEstadoUso, true);
});

test("vistaFilas muestra los campos según la subcategoría", () => {
  const subs = [{ id: 1, nombre: "Arroz", categoriaNombre: "A", perecedero: true }, { id: 2, nombre: "Silla", categoriaNombre: "M", requiereEstadoUso: true }];
  const [a, b] = vistaFilas([{ subcategoriaId: "1" }, { subcategoriaId: "2" }], subs);
  assert.deepEqual([a.muestraVencimiento, a.muestraMedida, a.muestraEstadoUso], [true, true, false]);
  assert.deepEqual([b.muestraVencimiento, b.muestraMedida, b.muestraEstadoUso], [false, false, true]);
  assert.equal(b.ids.nombre, "item-2-nombre");
});

test("vistaSegmentacion y vistaResultadoImportacion", () => {
  const s = vistaSegmentacion([{ id: 1, items: [{}, {}], cantidadTotal: 3, donanteNombre: "Ana", donanteId: 4 }], "/v");
  assert.equal(s.titulo, "Se registró 1 donación");
  assert.equal(s.donanteId, 4);
  const errores = Array.from({ length: 60 }, (_, i) => ({ linea: i + 2, motivo: "x" }));
  const r = vistaResultadoImportacion({ totalProcesados: 100, creados: 40, actualizados: 0, errores });
  assert.equal(r.estado, "info");
  assert.equal(r.errores.length, 50);
  assert.equal(r.erroresOmitidos, 10);
  assert.equal(vistaResultadoImportacion({ totalProcesados: 1, creados: 1, actualizados: 0, errores: [] }).estado, "success");
});
