import assert from "node:assert/strict";
import test from "node:test";
import { navigationFor } from "../middleware/locals.js";

const etiquetas = (links) => links.map((link) => link.label);
const PUBLICOS = ["Inicio", "Fotos de entregas", "Seguimiento"];

test("sin sesión solo se ven las pestañas públicas", () => {
  assert.deepEqual(etiquetas(navigationFor(null, "/", { bypass: false })), PUBLICOS);
});

test("una persona donante no ve entidad ni administración", () => {
  const links = etiquetas(navigationFor({ role: "DONANTE" }, "/donante", { bypass: false }));
  assert.deepEqual(links, [...PUBLICOS, "Donante"]);
});

test("una entidad solo suma sus pestañas", () => {
  const links = etiquetas(navigationFor({ role: "ENTIDAD_BENEFICIARIA" }, "/", { bypass: false }));
  assert.deepEqual(links, [...PUBLICOS, "Entidad", "Donaciones asignadas"]);
});

test("en las donaciones de la entidad se marca solo esa pestaña, no también Entidad", () => {
  const entidad = { role: "ENTIDAD" };
  const activas = (ruta) =>
    navigationFor(entidad, ruta, { bypass: false }).filter((link) => link.active).map((link) => link.label);
  assert.deepEqual(activas("/entidad/donaciones"), ["Donaciones asignadas"]);
  assert.deepEqual(activas("/entidad/donaciones/12"), ["Donaciones asignadas"]);
  assert.deepEqual(activas("/entidad"), ["Entidad"]);
});

test("administración ve sus pestañas y no las de donante/entidad", () => {
  const links = etiquetas(navigationFor({ role: "ADMIN" }, "/", { bypass: false }));
  assert.deepEqual(links, [...PUBLICOS, "Administración", "Donaciones", "Logística", "Rankings"]);
});

test("con AUTH_DEV_BYPASS se ve todo", () => {
  assert.equal(navigationFor(null, "/", { bypass: true }).length, 10);
});

test("la misma navegación en páginas públicas y privadas (marca la activa)", () => {
  const admin = { role: "ADMIN" };
  const enInicio = navigationFor(admin, "/", { bypass: false });
  const enDonaciones = navigationFor(admin, "/admin/donaciones/todas", { bypass: false });
  assert.deepEqual(etiquetas(enInicio), etiquetas(enDonaciones));
  assert.deepEqual(enDonaciones.filter((link) => link.active).map((link) => link.label), ["Donaciones"]);
  assert.deepEqual(
    navigationFor(admin, "/administracion", { bypass: false }).filter((link) => link.active).map((link) => link.label),
    ["Administración"],
  );
});
