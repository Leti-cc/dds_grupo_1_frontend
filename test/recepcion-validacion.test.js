import assert from "node:assert/strict";
import {test} from "node:test";
import {validarFotos, validarMotivo} from "../src/lib/recepcion-validacion.js"

const foto = (type = "image/png", size = 1000) => ({type, size});

test("validarFotos exige al menos una foto válida", () => {

  assert.match(validarFotos([]).error, /al menos una foto/);
  assert.match(validarFotos([foto("application/pdf")]).error, /JPG, PNG o WebP/);
  assert.match(validarFotos([foto("image/png", 6 * 1024 * 1024)]).error, /5 MB/);
  assert.equal(validarFotos([foto()]).fotos.length, 1);

});

test("validarMotivo exige texto y limita el largo", () => {

  assert.match(validarMotivo(" ").error, /por qué/);
  assert.match(validarMotivo("x".repeat(251)).error, /250/);
  assert.equal(validarMotivo("Nadie atendió").motivo, "Nadie atendió");

});