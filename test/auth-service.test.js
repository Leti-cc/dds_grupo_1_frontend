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
