const env = process.env;

export const PORT = Number(env.PORT) || 3000;

export const API_URLS = Object.freeze({
  donaciones: env.DONACIONES_API_URL || "http://localhost:8080",
  notificaciones: env.NOTIFICACIONES_API_URL || "http://localhost:8081",
  incentivos: env.INCENTIVOS_API_URL || "http://localhost:8082",
  logistica: env.LOGISTICA_API_URL || "http://localhost:8083",
});

export const API_TIMEOUT_MS = 5000;

export const KEYCLOAK_ISSUER = env.KEYCLOAK_ISSUER || "http://localhost:8084/realms/donatrack";
export const KEYCLOAK_CLIENT_ID = env.KEYCLOAK_CLIENT_ID || "donatrack-frontend";
export const KEYCLOAK_REDIRECT_URI = env.KEYCLOAK_REDIRECT_URI || "http://localhost:3000/auth/callback";
export const KEYCLOAK_REGISTRATION_CLIENT_ID = env.KEYCLOAK_REGISTRATION_CLIENT_ID || "donatrack-registration";
export const KEYCLOAK_REGISTRATION_CLIENT_SECRET = env.KEYCLOAK_REGISTRATION_CLIENT_SECRET || "";

export const AUTH_DEV_BYPASS = env.AUTH_DEV_BYPASS === "true";

export const ENABLE_DEMO_TOOLS = env.ENABLE_DEMO_TOOLS === "true";

const POLLING_MAPA_POR_DEFECTO_MS = 10000;
const POLLING_MAPA_MINIMO_MS = 1000;

export function leerPollingMs(valor) {
  const milisegundos = Number(valor);
  return Number.isFinite(milisegundos) && milisegundos >= POLLING_MAPA_MINIMO_MS
    ? milisegundos
    : POLLING_MAPA_POR_DEFECTO_MS;
}

export const MAPA_POLLING_MS = leerPollingMs(env.MAPA_POLLING_MS);
