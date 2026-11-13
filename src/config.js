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
export const KEYCLOAK_POST_LOGOUT_REDIRECT_URI = env.KEYCLOAK_POST_LOGOUT_REDIRECT_URI
  || `${new URL(KEYCLOAK_REDIRECT_URI).origin}/`;

/** Proveedores de social login que se ofrecen en la pantalla de ingreso (alias del IdP en Keycloak). */
export const SOCIAL_PROVIDER_NAMES = Object.freeze({
  google: "Google",
  github: "GitHub",
});

export function leerProveedoresSociales(valor) {
  return String(valor ?? "")
    .split(",")
    .map((alias) => alias.trim().toLowerCase())
    .filter((alias, indice, todos) => alias in SOCIAL_PROVIDER_NAMES && todos.indexOf(alias) === indice);
}

export const SOCIAL_LOGIN_PROVIDERS = Object.freeze(leerProveedoresSociales(env.SOCIAL_LOGIN_PROVIDERS));
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
