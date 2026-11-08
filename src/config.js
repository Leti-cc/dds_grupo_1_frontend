const env = process.env;

export const PORT = Number(env.PORT) || 3000;

export const API_URLS = Object.freeze({
  donaciones: env.DONACIONES_API_URL || "http://localhost:8080",
  notificaciones: env.NOTIFICACIONES_API_URL || "http://localhost:8081",
  incentivos: env.INCENTIVOS_API_URL || "http://localhost:8082",
  logistica: env.LOGISTICA_API_URL || "http://localhost:8083",
  auth: env.AUTH_API_URL || "http://localhost:8084",
});

export const API_TIMEOUT_MS = 5000;

export const AUTH_LOGIN_PATH = "/api/auth/login";
export const AUTH_CALLBACK_PATH = "/api/auth/oauth/callback";

export const OAUTH_URLS = Object.freeze({
  google: env.AUTH_GOOGLE_URL ?? "",
  microsoft: env.AUTH_MICROSOFT_URL ?? "",
  institucional: env.AUTH_INSTITUCIONAL_URL ?? "",
});

export const AUTH_DEV_BYPASS = env.AUTH_DEV_BYPASS === "true";

export const REMEMBER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
