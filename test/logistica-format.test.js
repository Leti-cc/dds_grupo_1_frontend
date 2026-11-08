import assert from "node:assert/strict";
import { test } from "node:test";
import { statusLabel } from "../src/helpers/handlebars.js";
import {
  fechaCorta,
  fechaHora,
  fechaRelativa,
  formatoNumero,
  horaMinuto,
} from "../src/lib/logistica-format.js";

const AHORA = new Date(2026, 10, 5, 12, 0, 0).getTime();

test("mapea los estados de entrega a sus etiquetas", () => {
  assert.equal(statusLabel("PENDIENTE"), "Pendiente");
  assert.equal(statusLabel("EN_TRASLADO"), "En camino");
  assert.equal(statusLabel("ENTREGADA"), "Entregada");
  assert.equal(statusLabel("NO_RECIBIDA"), "No recibida");
});

test("fechaRelativa expresa minutos, horas y días", () => {
  assert.equal(fechaRelativa("2026-11-05T11:55:00", AHORA), "hace 5 min");
  assert.equal(fechaRelativa("2026-11-05T09:00:00", AHORA), "hace 3 h");
  assert.equal(fechaRelativa("2026-11-04T11:00:00", AHORA), "hace 1 día");
  assert.equal(fechaRelativa("2026-11-02T12:00:00", AHORA), "hace 3 días");
});

test("fechaRelativa respeta los cortes entre unidades", () => {
  assert.equal(fechaRelativa("2026-11-05T11:59:30", AHORA), "hace un momento");
  assert.equal(fechaRelativa("2026-11-05T11:59:00", AHORA), "hace 1 min");
  assert.equal(fechaRelativa("2026-11-05T11:00:01", AHORA), "hace 59 min");
  assert.equal(fechaRelativa("2026-11-05T11:00:00", AHORA), "hace 1 h");
});

test("fechaRelativa no devuelve tiempos negativos con fechas futuras", () => {
  assert.equal(fechaRelativa("2026-11-05T12:30:00", AHORA), "hace un momento");
});

test("fechaRelativa dice Sin datos cuando no hay fecha válida", () => {
  assert.equal(fechaRelativa(null, AHORA), "Sin datos");
  assert.equal(fechaRelativa(undefined, AHORA), "Sin datos");
  assert.equal(fechaRelativa("no es fecha", AHORA), "Sin datos");
  assert.equal(fechaRelativa("2026-13-45T10:00:00", AHORA), "Sin datos");
});

test("formatea fechas como dd/mm/aaaa hh:mm", () => {
  assert.equal(fechaHora("2026-11-05T08:07:00"), "05/11/2026 08:07");
  assert.equal(fechaCorta("2026-11-05"), "05/11/2026");
  assert.equal(horaMinuto("2026-11-05T08:07:00"), "08:07");
  assert.equal(fechaHora(null), "—");
});

test("formatea números con el formato es-AR", () => {
  assert.equal(formatoNumero(1500), "1.500");
  assert.equal(formatoNumero(2.5), "2,5");
  assert.equal(formatoNumero(null), "—");
});
