import * as oidc from "openid-client";
import {
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_ISSUER,
  KEYCLOAK_POST_LOGOUT_REDIRECT_URI,
  KEYCLOAK_REDIRECT_URI,
  KEYCLOAK_REGISTRATION_CLIENT_ID,
  KEYCLOAK_REGISTRATION_CLIENT_SECRET,
  SOCIAL_LOGIN_PROVIDERS,
} from "../config.js";

const ALLOWED_ROLES = ["ADMIN", "ENTIDAD", "DONANTE"];
const KEYCLOAK_TIMEOUT_MS = 5000;
// Se renueva el access token si le quedan menos de 30 s, para que no venza en medio de una llamada a las APIs.
const REFRESH_MARGIN_MS = 30_000;
let configurationPromise;

export class RegistrationError extends Error {
  constructor(message) {
    super(message);
    this.name = "RegistrationError";
  }
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

function issuerUrl() {
  return new URL(KEYCLOAK_ISSUER);
}

function realmName() {
  return issuerUrl().pathname.split("/").filter(Boolean).at(-1);
}

function oidcConfiguration() {
  if (!configurationPromise) {
    const issuer = issuerUrl();
    const localHttp = issuer.protocol === "http:"
      && ["localhost", "127.0.0.1"].includes(issuer.hostname);
    configurationPromise = oidc.discovery(
      issuer,
      KEYCLOAK_CLIENT_ID,
      undefined,
      oidc.None(),
      localHttp ? { execute: [oidc.allowInsecureRequests] } : undefined,
    ).catch((error) => {
      // Si Keycloak todavía no levantó, no se cachea el error: el próximo intento vuelve a consultar.
      configurationPromise = undefined;
      throw error;
    });
  }
  return configurationPromise;
}

/** Guarda en la sesión del servidor los tokens de una respuesta del token endpoint. */
function storeTokens(session, tokens) {
  session.accessToken = tokens.access_token;
  if (tokens.refresh_token) session.refreshToken = tokens.refresh_token;
  if (tokens.id_token) session.idToken = tokens.id_token;
  const expiresIn = typeof tokens.expiresIn === "function" ? tokens.expiresIn() : tokens.expires_in;
  session.accessTokenExpiresAt = Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : undefined;
}

function clearAuthentication(session) {
  if (!session) return;
  for (const key of ["accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "user", "oidcLogin"]) {
    delete session[key];
  }
}

export function needsRefresh(session, now = Date.now()) {
  return Boolean(session?.accessToken && session.accessTokenExpiresAt)
    && now >= session.accessTokenExpiresAt - REFRESH_MARGIN_MS;
}

export function socialProviderHint(provider) {
  const alias = String(provider ?? "").trim().toLowerCase();
  return SOCIAL_LOGIN_PROVIDERS.includes(alias) ? alias : undefined;
}

async function registrationAdminToken() {
  if (!KEYCLOAK_REGISTRATION_CLIENT_SECRET) {
    throw new RegistrationError("El registro de cuentas todavía no está configurado.");
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: KEYCLOAK_REGISTRATION_CLIENT_ID,
    client_secret: KEYCLOAK_REGISTRATION_CLIENT_SECRET,
  });
  const response = await fetch(`${KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(KEYCLOAK_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new RegistrationError("No pudimos conectar el registro con Keycloak.");
  }
  const tokens = await response.json();
  if (typeof tokens.access_token !== "string") {
    throw new RegistrationError("Keycloak no devolvió una credencial administrativa válida.");
  }
  return tokens.access_token;
}

function adminUrl(path) {
  return `${issuerUrl().origin}/admin/realms/${encodeURIComponent(realmName())}${path}`;
}

async function keycloakRequest(token, path, options = {}) {
  return fetch(adminUrl(path), {
    ...options,
    signal: AbortSignal.timeout(KEYCLOAK_TIMEOUT_MS),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
}

async function deleteKeycloakUser(token, userId) {
  const response = await keycloakRequest(token, `/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new RegistrationError("No se pudo eliminar la cuenta incompleta de Keycloak.");
  }
}

/**
 * Nombre con el que el Servicio de Incentivos registra al donante. Donaciones lo arma igual
 * (DestinatarioResolver.nombreUsuarioDe): "Nombre Apellido" o la razón social.
 */
export function incentivosUsernameFor(donor) {
  if (!donor) return undefined;
  if (donor.tipo === "JURIDICA") return donor.razonSocial || undefined;
  const nombre = `${donor.nombre ?? ""} ${donor.apellido ?? ""}`.trim();
  return nombre || undefined;
}

export function userFromClaims(claims) {
  const roles = Array.isArray(claims?.roles) ? claims.roles : [];
  const role = ALLOWED_ROLES.find((candidate) => roles.includes(candidate));
  if (!role) {
    throw new Error("La cuenta no tiene un rol habilitado en DonaTrack.");
  }
  return {
    id: claims.sub,
    username: claims.preferred_username,
    email: claims.email,
    nombre: claims.name,
    role,
  };
}

export const authService = {
  /**
   * Arma la URL de autorización (Authorization Code + PKCE). Con un proveedor social habilitado se agrega
   * kc_idp_hint para que Keycloak salte su formulario y vaya directo a Google/GitHub.
   */
  async startLogin(req, { provider } = {}) {
    const config = await oidcConfiguration();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    req.session.oidcLogin = { codeVerifier, state, nonce };

    const idpHint = socialProviderHint(provider);
    return oidc.buildAuthorizationUrl(config, {
      redirect_uri: KEYCLOAK_REDIRECT_URI,
      scope: "openid profile email",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      nonce,
      ...(idpHint ? { kc_idp_hint: idpHint } : {}),
    }).href;
  },

  async completeLogin(req, callbackUrl) {
    const pending = req.session?.oidcLogin;
    if (!pending) {
      throw new Error("No hay un inicio de sesión pendiente.");
    }
    const config = await oidcConfiguration();
    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: pending.codeVerifier,
      expectedState: pending.state,
      expectedNonce: pending.nonce,
    });
    const user = userFromClaims(tokens.claims());

    // Sesión nueva tras autenticarse: evita la fijación de sesión.
    await regenerateSession(req);
    storeTokens(req.session, tokens);
    req.session.user = user;
    return user;
  },

  /**
   * Renueva el access token con el refresh token cuando está por vencer (Keycloak lo emite por 5 minutos).
   * Si Keycloak ya no acepta el refresh token (sesión SSO vencida o cerrada), se descarta la autenticación
   * y la próxima ruta protegida pide iniciar sesión de nuevo.
   */
  async refreshIfNeeded(req) {
    const session = req.session;
    if (!needsRefresh(session)) return;
    if (!session.refreshToken) {
      clearAuthentication(session);
      return;
    }
    try {
      const config = await oidcConfiguration();
      const tokens = await oidc.refreshTokenGrant(config, session.refreshToken);
      const claims = tokens.claims();
      // Los roles pueden cambiar en Keycloak; los vínculos con Donaciones (entidadId/donanteId) se conservan.
      if (claims) session.user = { ...session.user, ...userFromClaims(claims) };
      storeTokens(session, tokens);
    } catch (error) {
      console.warn("[auth] No se pudo renovar la sesión; se pide iniciar sesión otra vez:", error.message);
      clearAuthentication(session);
    }
  },

  async registerEntityAccount({ email, password, firstName, lastName }) {
    const token = await registrationAdminToken();
    const response = await keycloakRequest(token, "/users", {
      method: "POST",
      body: JSON.stringify({
        username: email,
        email,
        firstName,
        lastName,
        enabled: true,
        emailVerified: false,
        credentials: [{ type: "password", value: password, temporary: false }],
      }),
    });
    if (response.status === 409) {
      throw new RegistrationError("Ya existe una cuenta con ese correo electrónico.");
    }
    if (response.status !== 201) {
      throw new RegistrationError("No pudimos crear la cuenta de acceso.");
    }

    const location = response.headers.get("location");
    const userId = location?.split("/").filter(Boolean).at(-1);
    if (!userId) {
      throw new RegistrationError("Keycloak no informó el identificador de la cuenta creada.");
    }

    try {
      const roleResponse = await keycloakRequest(token, "/roles/ENTIDAD");
      if (!roleResponse.ok) throw new Error("No se encontró el rol ENTIDAD");
      const role = await roleResponse.json();
      const assignment = await keycloakRequest(
        token,
        `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
        { method: "POST", body: JSON.stringify([role]) },
      );
      if (!assignment.ok) throw new Error("No se pudo asignar el rol ENTIDAD");
      return userId;
    } catch (error) {
      await deleteKeycloakUser(token, userId);
      throw new RegistrationError("La cuenta no pudo recibir el rol de entidad.");
    }
  },

  async deleteRegisteredAccount(userId) {
    const token = await registrationAdminToken();
    await deleteKeycloakUser(token, userId);
  },

  getSession(req) {
    const { user, accessToken } = req.session ?? {};
    return user && accessToken ? { user, token: accessToken } : null;
  },

  /**
   * Cierra la sesión local y devuelve a dónde redirigir. Si hay id_token se cierra también la sesión SSO
   * de Keycloak (RP-initiated logout); si no, "Ingresar" volvería a entrar sin pedir credenciales.
   */
  async logout(req) {
    const idToken = req.session?.idToken;
    await destroySession(req);
    if (!idToken) return "/";
    try {
      const config = await oidcConfiguration();
      return oidc.buildEndSessionUrl(config, {
        id_token_hint: idToken,
        post_logout_redirect_uri: KEYCLOAK_POST_LOGOUT_REDIRECT_URI,
      }).href;
    } catch (error) {
      console.warn("[auth] No se pudo armar el logout de Keycloak:", error.message);
      return "/";
    }
  },
};
