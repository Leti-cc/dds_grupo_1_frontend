import {
  ACCESS_TOKEN_KEY,
  AUTH_CALLBACK_PATH,
  AUTH_LOGIN_PATH,
  OAUTH_URLS,
  USER_KEY,
} from "../config.js";
import { apiRequest } from "./api-client.js";

export class AuthContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthContractError";
  }
}

function clearStoredSession() {
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(USER_KEY);
}

function saveSession(response, remember) {
  if (
    !response ||
    typeof response.accessToken !== "string" ||
    !response.accessToken ||
    !response.user ||
    typeof response.user !== "object" ||
    (typeof response.user.role !== "string" &&
      typeof response.user.rol !== "string")
  ) {
    throw new AuthContractError(
      "La respuesta de autenticación no tiene el formato esperado. Se necesitan accessToken y user.role.",
    );
  }

  clearStoredSession();
  const storage = remember ? window.localStorage : window.sessionStorage;
  storage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
  storage.setItem(USER_KEY, JSON.stringify(response.user));
  return response.user;
}

export const authService = {
  async login({ identifier, password, remember = false }) {
    const response = await apiRequest("auth", AUTH_LOGIN_PATH, {
      method: "POST",
      body: { identifier: identifier.trim(), password },
    });

    return saveSession(response, remember);
  },

  async completeSocialLogin({ code, state, remember = false }) {
    if (!code || !state) {
      throw new AuthContractError("El retorno de SSO necesita un código y un estado.");
    }

    const response = await apiRequest("auth", AUTH_CALLBACK_PATH, {
      method: "POST",
      body: { code, state },
    });
    return saveSession(response, remember);
  },

  startSocialLogin(provider) {
    const authorizationUrl = OAUTH_URLS[provider];
    if (!authorizationUrl) {
      throw new AuthContractError(
        `El inicio de sesión con ${provider} todavía no está configurado en el backend.`,
      );
    }

    window.location.assign(authorizationUrl);
  },

  getSession() {
    const storedUser =
      window.sessionStorage.getItem(USER_KEY) ??
      window.localStorage.getItem(USER_KEY);
    const token =
      window.sessionStorage.getItem(ACCESS_TOKEN_KEY) ??
      window.localStorage.getItem(ACCESS_TOKEN_KEY);

    if (!storedUser || !token) {
      return null;
    }

    try {
      return { user: JSON.parse(storedUser), token };
    } catch {
      clearStoredSession();
      return null;
    }
  },

  logout() {
    clearStoredSession();
  },

};
