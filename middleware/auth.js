import { AUTH_DEV_BYPASS } from "../src/config.js";

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
 * Middleware provisorio de autorización por rol.
 *
 * TODO: reemplazar cuando el servicio de autenticación defina su contrato definitivo
 * (roles, expiración y renovación del token). Con AUTH_DEV_BYPASS=true en .env se saltea
 * el chequeo para poder desarrollar sin backend de auth; nunca activarlo en producción.
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
