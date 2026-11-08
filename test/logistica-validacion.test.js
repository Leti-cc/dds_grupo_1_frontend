import assert from "node:assert/strict";
import { test } from "node:test";
import { validarCamion } from "../src/lib/logistica-validacion.js";

const VALIDO = { patente: "AB123CD", capacidadCarga: "1500", capacidadVolumen: "10", altura: "2.5" };

test("acepta los formatos de patente argentinos", () => {
  for (const patente of ["ABC123", "AB123CD"]) {
    assert.equal(validarCamion({ ...VALIDO, patente }).valido, true, patente);
  }
});

test("pasa la patente a mayúsculas y recorta espacios", () => {
  const { datos, valido } = validarCamion({ ...VALIDO, patente: "  ab123cd " });
  assert.equal(valido, true);
  assert.equal(datos.patente, "AB123CD");
});

test("rechaza patentes con formato inválido", () => {
  for (const patente of ["", "AB12CD", "ABCD123", "AB-123-CD", "AB 123 CD", "1234567", "ABC1234"]) {
    const { errores, valido } = validarCamion({ ...VALIDO, patente });
    assert.equal(valido, false, patente);
    assert.ok(errores.patente, patente);
  }
});

test("rechaza números menores o iguales a cero, vacíos o no numéricos", () => {
  for (const campo of ["capacidadCarga", "capacidadVolumen", "altura"]) {
    for (const valor of ["0", "-1", "", "abc", "Infinity"]) {
      const { errores, valido } = validarCamion({ ...VALIDO, [campo]: valor });
      assert.equal(valido, false, `${campo}=${valor}`);
      assert.ok(errores[campo], `${campo}=${valor}`);
    }
  }
});

test("convierte los datos para la API y conserva lo cargado para la vista", () => {
  const { datos, valores } = validarCamion(VALIDO);
  assert.deepEqual(datos, { patente: "AB123CD", capacidadCarga: 1500, capacidadVolumen: 10, altura: 2.5 });
  assert.equal(valores.altura, "2.5");
});

test("informa todos los errores juntos y sin datos rompe limpio", () => {
  const { errores } = validarCamion(undefined);
  assert.deepEqual(Object.keys(errores).sort(), ["altura", "capacidadCarga", "capacidadVolumen", "patente"]);
});

test("en la edición usa la patente de la URL e ignora la del formulario", () => {
  const { datos, errores, valido } = validarCamion({ ...VALIDO, patente: "OTRA" }, { patente: "ABC123" });
  assert.equal(valido, true);
  assert.equal(datos.patente, "ABC123");
  assert.equal(errores.patente, undefined);
});
