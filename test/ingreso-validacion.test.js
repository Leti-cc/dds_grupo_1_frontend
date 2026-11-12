import assert from "node:assert/strict";
import { test } from "node:test";
import {
  construirDonacion,
  construirDonante,
  esFechaValida,
  leerBusqueda,
  leerFilas,
  leerIds,
  normalizarCuit,
  validarArchivoCsv,
} from "../src/lib/ingreso-validacion.js";

const HOY = new Date(2026, 10, 12);
const SUBS = new Map([
  [1, { id: 1, nombre: "Fideos", perecedero: true, requiereEstadoUso: false }],
  [3, { id: 3, nombre: "Camperas", perecedero: false, requiereEstadoUso: true }],
  [5, { id: 5, nombre: "Útiles", perecedero: false, requiereEstadoUso: false }],
]);

test("leerBusqueda pide 2 caracteres y no busca sin texto", () => {
  assert.deepEqual(leerBusqueda(undefined), { texto: "", error: null });
  assert.ok(leerBusqueda("a").error);
  assert.deepEqual(leerBusqueda("  ana   perez "), { texto: "ana perez", error: null });
});

test("construirDonante humana valida y arma el cuerpo del backend", () => {
  const ok = construirDonante({ tipo: "HUMANA", nombre: "Ana", apellido: "Pérez", dni: "12.345.678", edad: "30", direccion: "Calle 1", email: "a@b.com" });
  assert.deepEqual(ok.errores, {});
  assert.equal(ok.donante.dni, "12345678");
  assert.deepEqual(ok.donante.contactoPredeterminado, { medio: "MAIL", valor: "a@b.com" });
  assert.equal(ok.donante.tipoUsuario, "PERSONA");
  const mal = construirDonante({ tipo: "HUMANA", email: "x", edad: "0", dni: "abc" });
  assert.equal(mal.donante, null);
  for (const campo of ["nombre", "apellido", "dni", "edad", "direccion", "email"]) assert.ok(mal.errores[campo], campo);
});

test("construirDonante jurídica normaliza el CUIT", () => {
  const ok = construirDonante({ tipo: "JURIDICA", razonSocial: "X SA", tipoPersonaJuridica: "ONG", cuit: "30123456789", rubro: "Textil", email: "a@b.com" });
  assert.equal(ok.donante.cuit, "30-12345678-9");
  assert.equal(ok.donante.tipoUsuario, "ORGANIZACION");
  assert.equal(normalizarCuit("123"), null);
});

test("leerFilas alinea las listas paralelas y tolera una sola fila", () => {
  assert.equal(leerFilas({ itemNombre: ["a", "b"], itemCantidad: ["1", "2"] }).length, 2);
  assert.equal(leerFilas({ itemNombre: "solo" })[0].nombre, "solo");
  assert.equal(leerFilas({}).length, 1);
});

test("construirDonacion respeta las reglas de cada subcategoría", () => {
  const body = {
    descripcion: "Mudanza",
    itemNombre: ["Fideos", "Campera", "Cuaderno"],
    itemSubcategoriaId: ["1", "3", "5"],
    itemCantidad: ["100", "5", "10"],
    itemUnidad: ["GRAMO", "UNIDAD", "UNIDAD"],
    itemMedida: ["500", "1", "1,5"],
    itemVencimiento: ["2027-01-01", "", ""],
    itemEstadoUso: ["", "USADO", ""],
  };
  const r = construirDonacion(body, 7, SUBS, HOY);
  assert.equal(r.hayErrores, false);
  const [fideos, campera, cuaderno] = r.donacion.items;
  assert.deepEqual(fideos, { nombre: "Fideos", descripcion: "Fideos", subcategoriaId: 1, cantidad: 100, unidad: "GRAMO", cantidadBien: 500, fechaVencimiento: "2027-01-01" });
  assert.deepEqual(campera, { nombre: "Campera", descripcion: "Campera", subcategoriaId: 3, cantidad: 5, estadoUso: true });
  assert.equal(cuaderno.cantidadBien, 1.5);
  assert.equal(cuaderno.fechaVencimiento, undefined);
  assert.equal(r.donacion.donanteId, 7);
});

test("construirDonacion informa errores por fila con el id del campo", () => {
  const r = construirDonacion(
    { descripcion: "", itemNombre: "", itemSubcategoriaId: "1", itemCantidad: "0", itemUnidad: "UNIDAD", itemMedida: "1", itemVencimiento: "2020-01-01" },
    1, SUBS, HOY,
  );
  assert.equal(r.donacion, null);
  const campos = r.resumen.map((e) => e.campo);
  for (const c of ["descripcion", "item-1-nombre", "item-1-cantidad", "item-1-vencimiento"]) assert.ok(campos.includes(c), c);
  const sinEstado = construirDonacion({ descripcion: "x", itemNombre: "C", itemSubcategoriaId: "3", itemCantidad: "1" }, 1, SUBS, HOY);
  assert.ok(sinEstado.filas[0].errores.estadoUso);
});

test("fechas, ids y archivo CSV", () => {
  assert.equal(esFechaValida("2027-02-30"), false);
  assert.equal(esFechaValida("2027-02-28"), true);
  assert.deepEqual(leerIds("3,3,x,-1,5"), [3, 5]);
  assert.ok(validarArchivoCsv({ name: "a.txt", size: 5 }));
  assert.ok(validarArchivoCsv({ name: "a.csv", size: 0 }));
  assert.ok(validarArchivoCsv({ name: "a.csv", size: 6 * 1024 * 1024 }));
  assert.equal(validarArchivoCsv({ name: "A.CSV", size: 100 }), null);
});
