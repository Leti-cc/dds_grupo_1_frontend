import assert from "node:assert/strict";
import { test } from "node:test";
import { crearPoller } from "../public/js/logistica/poller.js";

/** Reloj manual: guarda el timer pendiente y lo dispara a pedido. */
function crearEntorno({ tarea = async () => {} } = {}) {
  const entorno = { visible: true, pendiente: null, ms: null, llamadas: 0 };
  entorno.poller = crearPoller({
    intervaloMs: 10000,
    estaVisible: () => entorno.visible,
    tarea: async () => {
      entorno.llamadas += 1;
      await tarea();
    },
    programar: (funcion, ms) => {
      entorno.pendiente = funcion;
      entorno.ms = ms;
      return Symbol("timer");
    },
    cancelar: () => {
      entorno.pendiente = null;
    },
  });
  entorno.vencerTimer = async () => {
    const funcion = entorno.pendiente;
    entorno.pendiente = null;
    await funcion();
  };
  return entorno;
}

test("consulta al iniciar y agenda la siguiente con el intervalo configurado", async () => {
  const e = crearEntorno();
  await e.poller.iniciar();
  assert.equal(e.llamadas, 1);
  assert.equal(e.ms, 10000);
  await e.vencerTimer();
  assert.equal(e.llamadas, 2);
  assert.ok(e.pendiente, "queda agendada la próxima");
});

test("no arranca si la pestaña empieza oculta", async () => {
  const e = crearEntorno();
  e.visible = false;
  await e.poller.iniciar();
  assert.equal(e.llamadas, 0);
  assert.equal(e.pendiente, null);
});

test("se pausa al ocultar la pestaña y consulta enseguida al volver", async () => {
  const e = crearEntorno();
  await e.poller.iniciar();
  e.visible = false;
  e.poller.visibilidadCambio();
  assert.equal(e.pendiente, null, "cancela el timer");
  assert.equal(e.llamadas, 1);
  e.visible = true;
  await e.poller.visibilidadCambio();
  assert.equal(e.llamadas, 2);
  assert.ok(e.pendiente);
});

test("no agenda otra consulta si se ocultó mientras una estaba en curso", async () => {
  let terminar;
  const e = crearEntorno({ tarea: () => new Promise((resolve) => { terminar = resolve; }) });
  const consulta = e.poller.iniciar();
  e.visible = false;
  terminar();
  await consulta;
  assert.equal(e.pendiente, null);
});

test("nunca superpone consultas y repite una sola vez la pedida en el medio", async () => {
  let enCurso = 0;
  let maximo = 0;
  const terminaciones = [];
  const e = crearEntorno({
    tarea: () => new Promise((resolve) => {
      enCurso += 1;
      maximo = Math.max(maximo, enCurso);
      terminaciones.push(() => { enCurso -= 1; resolve(); });
    }),
  });
  const primera = e.poller.iniciar();
  e.poller.consultarAhora();
  e.poller.consultarAhora();
  assert.equal(e.llamadas, 1);
  terminaciones[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(e.llamadas, 2);
  terminaciones[1]();
  await primera;
  assert.equal(maximo, 1);
  assert.equal(e.llamadas, 2);
});

test("si una consulta falla, sigue con el próximo ciclo", async (t) => {
  t.mock.method(console, "error", () => {});
  const e = crearEntorno({ tarea: async () => { throw new Error("backend caído"); } });
  await e.poller.iniciar();
  assert.equal(e.llamadas, 1);
  assert.ok(e.pendiente, "reintenta en el ciclo siguiente");
});

test("consultarAhora (Reintentar) adelanta la consulta sin duplicar el timer", async () => {
  const e = crearEntorno();
  await e.poller.iniciar();
  await e.poller.consultarAhora();
  assert.equal(e.llamadas, 2);
  await e.vencerTimer();
  assert.equal(e.llamadas, 3);
});
