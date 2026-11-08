import assert from "node:assert/strict";
import { test } from "node:test";
import { armarRutasSimuladas, MAX_ENTREGAS_POR_LOTE } from "../src/lib/logistica-simulador.js";

const entrega = (n) => ({
  id: `e${n}`,
  donacionId: String(n),
  direccionDestino: `Calle ${n}`,
  estado: "PENDIENTE",
  historial: [],
});
const entregas = (cantidad) => Array.from({ length: cantidad }, (_, i) => entrega(i + 1));
const camion = (patente, extra = {}) => ({ patente, activo: true, rutaActiva: null, ...extra });

test("reparte en round-robin entre los camiones disponibles", () => {
  const rutas = armarRutasSimuladas(entregas(5), [camion("AAA111"), camion("BBB222")]);
  assert.deepEqual(
    rutas.map((ruta) => [ruta.patenteCamion, ruta.entregas.map((e) => e.id)]),
    [
      ["AAA111", ["e1", "e3", "e5"]],
      ["BBB222", ["e2", "e4"]],
    ],
  );
});

test("numera ordenVisita desde 1 dentro de cada camión", () => {
  const rutas = armarRutasSimuladas(entregas(5), [camion("AAA111"), camion("BBB222")]);
  assert.deepEqual(rutas[0].entregas.map((e) => e.ordenVisita), [1, 2, 3]);
  assert.deepEqual(rutas[1].entregas.map((e) => e.ordenVisita), [1, 2]);
});

test("manda solo los campos del contrato de POST /rutas", () => {
  const [ruta] = armarRutasSimuladas(entregas(1), [camion("AAA111")]);
  assert.deepEqual(ruta, {
    patenteCamion: "AAA111",
    entregas: [{ id: "e1", donacionId: "1", direccionDestino: "Calle 1", ordenVisita: 1 }],
  });
});

test("no reparte más de 100 entregas", () => {
  const rutas = armarRutasSimuladas(entregas(150), [camion("AAA111"), camion("BBB222")]);
  const total = rutas.reduce((suma, ruta) => suma + ruta.entregas.length, 0);
  assert.equal(MAX_ENTREGAS_POR_LOTE, 100);
  assert.equal(total, 100);
  assert.ok(rutas.flatMap((ruta) => ruta.entregas).every((e) => Number(e.donacionId) <= 100));
});

test("ignora los camiones con ruta activa o inactivos", () => {
  const rutas = armarRutasSimuladas(entregas(2), [
    camion("AAA111", { rutaActiva: { id: "r1" } }),
    camion("BBB222", { activo: false }),
    camion("CCC333"),
  ]);
  assert.deepEqual(rutas.map((ruta) => ruta.patenteCamion), ["CCC333"]);
  assert.equal(rutas[0].entregas.length, 2);
});

test("no devuelve rutas vacías cuando hay más camiones que entregas", () => {
  const rutas = armarRutasSimuladas(entregas(1), [camion("AAA111"), camion("BBB222")]);
  assert.deepEqual(rutas.map((ruta) => ruta.patenteCamion), ["AAA111"]);
});

test("devuelve lista vacía sin entregas o sin camiones disponibles", () => {
  assert.deepEqual(armarRutasSimuladas([], [camion("AAA111")]), []);
  assert.deepEqual(armarRutasSimuladas(entregas(3), []), []);
  assert.deepEqual(armarRutasSimuladas(entregas(3), [camion("AAA111", { rutaActiva: {} })]), []);
});

test("no modifica los datos de entrada", () => {
  const entrada = entregas(3);
  const copia = structuredClone(entrada);
  armarRutasSimuladas(entrada, [camion("AAA111")]);
  assert.deepEqual(entrada, copia);
});
