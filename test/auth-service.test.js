import test from "node:test";
import assert from "node:assert/strict";
import { userFromClaims } from "../src/services/auth-service.js";

test("construye una sesión de entidad a partir de claims validados", () => {
  assert.deepEqual(userFromClaims({
    sub: "user-1",
    preferred_username: "entidad-demo",
    email: "entidad@donatrack.local",
    name: "Entidad Demo",
    roles: ["default-roles-donatrack", "ENTIDAD"],
  }), {
    id: "user-1",
    username: "entidad-demo",
    email: "entidad@donatrack.local",
    nombre: "Entidad Demo",
    role: "ENTIDAD",
  });
});

test("prioriza ADMIN si una cuenta tiene más de un rol", () => {
  assert.equal(userFromClaims({ roles: ["DONANTE", "ADMIN"] }).role, "ADMIN");
});

test("rechaza cuentas sin un rol de DonaTrack", () => {
  assert.throws(
    () => userFromClaims({ roles: ["offline_access"] }),
    /no tiene un rol habilitado/,
  );
});

test("renueva el token solo cuando está por vencer", async () => {
  const { needsRefresh } = await import("../src/services/auth-service.js");
  const ahora = 1_000_000;
  assert.equal(needsRefresh({ accessToken: "t", accessTokenExpiresAt: ahora + 120_000 }, ahora), false);
  assert.equal(needsRefresh({ accessToken: "t", accessTokenExpiresAt: ahora + 10_000 }, ahora), true);
  assert.equal(needsRefresh({ accessToken: "t", accessTokenExpiresAt: ahora - 1 }, ahora), true);
  assert.equal(needsRefresh({}, ahora), false);
  assert.equal(needsRefresh(undefined, ahora), false);
});

test("solo acepta proveedores de social login conocidos", async () => {
  const { leerProveedoresSociales } = await import("../src/config.js");
  assert.deepEqual(leerProveedoresSociales(" Google, github,google, evil.com "), ["google", "github"]);
  assert.deepEqual(leerProveedoresSociales(""), []);
  assert.deepEqual(leerProveedoresSociales(undefined), []);
});

test("arma el nombre de usuario de Incentivos igual que Donaciones", async () => {
  const { incentivosUsernameFor } = await import("../src/services/auth-service.js");
  assert.equal(incentivosUsernameFor({ tipo: "HUMANA", nombre: "Ana", apellido: "Pérez" }), "Ana Pérez");
  assert.equal(incentivosUsernameFor({ tipo: "JURIDICA", razonSocial: "Arcos Plateados S.A." }), "Arcos Plateados S.A.");
  assert.equal(incentivosUsernameFor({ tipo: "HUMANA" }), undefined);
  assert.equal(incentivosUsernameFor(null), undefined);
});
