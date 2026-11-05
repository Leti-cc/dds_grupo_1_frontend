const env = import.meta.env;

export const API_URLS = Object.freeze({
  donaciones: env.VITE_API_DONACIONES ?? "http://localhost:8080",
  notificaciones: env.VITE_API_NOTIFICACIONES ?? "http://localhost:8081",
  incentivos: env.VITE_API_INCENTIVOS ?? "http://localhost:8082",
  logistica: env.VITE_API_LOGISTICA ?? "http://localhost:8083",
  auth: env.VITE_API_AUTH ?? "http://localhost:8084",
});

export const AUTH_LOGIN_PATH = "/api/auth/login";
export const AUTH_CALLBACK_PATH = "/api/auth/oauth/callback";

export const OAUTH_URLS = Object.freeze({
  google: env.VITE_AUTH_GOOGLE_URL ?? "",
  microsoft: env.VITE_AUTH_MICROSOFT_URL ?? "",
  institucional: env.VITE_AUTH_INSTITUCIONAL_URL ?? "",
});

export const ACCESS_TOKEN_KEY = "donatrack.accessToken";
export const USER_KEY = "donatrack.user";
