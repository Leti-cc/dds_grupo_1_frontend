import assert from "node:assert/strict";
import test from "node:test";
import {
  credencialesIniciales,
  generarContrasenaTemporal,
  LARGO_CONTRASENA_TEMPORAL,
} from "../src/lib/contrasena-temporal.js";

test("la contraseña temporal cumple largo y clases de caracteres", () => {
  for (let i = 0; i < 200; i += 1) {
    const contrasena = generarContrasenaTemporal();
    assert.equal(contrasena.length, LARGO_CONTRASENA_TEMPORAL);
    assert.match(contrasena, /[A-Z]/);
    assert.match(contrasena, /[a-z]/);
    assert.match(contrasena, /[0-9]/);
    assert.match(contrasena, /[!@#$%*?\-_]/);
  }
});

test("cada alta genera una contraseña distinta y pide el envío por mail", () => {
  const a = credencialesIniciales();
  const b = credencialesIniciales();
  assert.notEqual(a.contrasenaTemporal, b.contrasenaTemporal);
  assert.equal(a.enviarCredencialesPorMail, true);
});
