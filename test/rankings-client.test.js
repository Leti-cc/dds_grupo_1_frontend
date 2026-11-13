import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { donatrackService } from "../src/services/donatrack-service.js";

const fetchOriginal = globalThis.fetch;
const REQUEST = { session: { accessToken: "admin-token" } };
let calls;

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response("[]", { headers: { "content-type": "application/json" } });
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

test("consulta los períodos de ranking con el token de la sesión", async () => {
  await donatrackService.getRankingPeriods(REQUEST);
  assert.equal(calls[0].url, "http://localhost:8082/api/incentivos/rankings");
  assert.equal(calls[0].init.headers.get("Authorization"), "Bearer admin-token");
});

test("consulta el ranking del período elegido y conserva ultimo como valor por defecto", async () => {
  await donatrackService.getDonorRanking(REQUEST, "2026-10");
  await donatrackService.getDonorRanking(REQUEST);
  assert.equal(calls[0].url, "http://localhost:8082/api/incentivos/rankings/2026-10/destacados");
  assert.equal(calls[1].url, "http://localhost:8082/api/incentivos/rankings/ultimo/destacados");
});
