import { ROLE_ALIASES, userHasRole } from "./auth.js";
import { AUTH_DEV_BYPASS } from "../src/config.js";

/**
 * Navegación principal. Los ítems sin `role` son públicos; los demás solo se muestran a la
 * sesión con ese rol (la ruta además está protegida en el servidor). Así una persona donante
 * no ve las pestañas de entidad ni de administración.
 */
const NAVIGATION = [
  { path: "/", label: "Inicio" },
  { path: "/galeria", label: "Fotos de entregas" },
  { path: "/seguimiento", label: "Seguimiento" },
  { path: "/donante", label: "Donante", role: "DONANTE" },
  { path: "/entidad", label: "Entidad", role: "ENTIDAD" },
  { path: "/entidad/donaciones", label: "Donaciones asignadas", role: "ENTIDAD" },
  { path: "/administracion", label: "Administración", role: "ADMIN" },
  { path: "/admin/donaciones/pendientes", activePrefix: "/admin/donaciones", label: "Donaciones", role: "ADMIN" },
  { path: "/admin/logistica/camiones", activePrefix: "/admin/logistica", label: "Logística", role: "ADMIN" },
  // Ancla dentro de /administracion: no se marca activo para no duplicar "Administración".
  { path: "/administracion?periodo=ultimo#ranking-titulo", activePrefix: null, label: "Rankings", role: "ADMIN" },
];

function userLabel(user) {
  return user?.nombre ?? user?.username ?? user?.email ?? "Sesión iniciada";
}

function isActive(itemPath, requestPath) {
  if (!itemPath) {
    return false;
  }
  if (itemPath === "/") {
    return requestPath === "/";
  }
  return requestPath === itemPath || requestPath.startsWith(`${itemPath}/`);
}

function canSee(item, user, bypass) {
  return !item.role || bypass || userHasRole(user, ROLE_ALIASES[item.role]);
}

const prefixOf = (item) => (item.activePrefix === undefined ? item.path : item.activePrefix);

/**
 * Links del menú según la sesión y la ruta actual. Pura, para poder testearla.
 * Si varias pestañas coinciden (por ejemplo "/entidad" y "/entidad/donaciones"), se marca solo la más específica.
 */
export function navigationFor(user, requestPath, { bypass = AUTH_DEV_BYPASS } = {}) {
  const visibles = NAVIGATION.filter((item) => canSee(item, user, bypass));
  const activa = visibles
    .filter((item) => isActive(prefixOf(item), requestPath))
    .reduce((mejor, item) => (!mejor || prefixOf(item).length > prefixOf(mejor).length ? item : mejor), null);
  return visibles.map((item) => ({
    path: item.path,
    label: item.label,
    href: item.path,
    active: item === activa,
  }));
}

/** Datos comunes del layout: usuario de la sesión y navegación principal. */
export function layoutLocals(req, res, next) {
  const user = req.session?.user ?? null;
  res.locals.user = user;
  res.locals.userLabel = userLabel(user);
  res.locals.links = navigationFor(user, req.path);
  next();
}
