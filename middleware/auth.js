import { AUTH_DEV_BYPASS } from "../src/config.js";
import { authService } from "../src/services/auth-service.js";

/**
 * Renueva el access token de Keycloak antes de que venza, así las APIs nunca reciben un token expirado.
 * Va después de express-session y antes de las rutas.
 */
export async function refreshSession(req, res, next) {
  try {
    await authService.refreshIfNeeded(req);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Alias de rol: el backend de autenticación todavía no fijó los nombres definitivos,
 * así que cada rol lógico acepta las variantes que ya se usaban en el front.
 */
export const ROLE_ALIASES = Object.freeze({
  ADMIN: [
    "ADMIN",
    "ADMINISTRADOR",
    "ROLE_ADMIN",
    "ROLE_ADMINISTRADOR",
    "LOGISTICA_ADMIN",
    "ROLE_LOGISTICA_ADMIN",
  ],
  DONANTE: ["DONANTE", "ROLE_DONANTE"],
  ENTIDAD: ["ENTIDAD", "ENTIDAD_BENEFICIARIA", "ROLE_ENTIDAD_BENEFICIARIA"],
});

export function userHasRole(user, roles) {
  const role = user?.role ?? user?.rol;
  return roles.includes(role);
}

function expandRoles(roles) {
  return roles.flatMap((role) => ROLE_ALIASES[role] ?? [role]);
}

/**
 * Autorización por rol a partir de la sesión creada en el callback OIDC (roles del realm de Keycloak).
 * Con AUTH_DEV_BYPASS=true en .env se saltea el chequeo para desarrollar sin Keycloak;
 * nunca activarlo en producción.
 */
export function requireRole(...roles) {
  const allowedRoles = expandRoles(roles);
  return (req, res, next) => {
    if (AUTH_DEV_BYPASS) {
      return next();
    }

    const user = req.session?.user;
    if (!user || !req.session.accessToken) {
      req.flash({ type: "info", toast: "Iniciá sesión para acceder a esa sección." });
      return res.redirect("/login");
    }
    if (!userHasRole(user, allowedRoles)) {
      return res.status(403).render("error", {
        title: "Acceso denegado",
        heading: "No tenés permisos para ver esta sección",
        message: "Tu cuenta no tiene el perfil requerido. Si creés que es un error, contactá a la administración.",
      });
    }
    return next();
  };
}
