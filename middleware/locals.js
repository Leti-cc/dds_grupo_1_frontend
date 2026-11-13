import { ROLE_ALIASES, userHasRole } from "./auth.js";
import { AUTH_DEV_BYPASS } from "../src/config.js";

const NAVIGATION = [
  { path: "/", label: "Inicio" },
  { path: "/galeria", label: "Fotos de entregas" },
  { path: "/seguimiento", label: "Seguimiento" },
  { path: "/donante", label: "Donante" },
  { path: "/entidad", label: "Entidad" },
  { path: "/administracion", label: "Administración" },
];

// Solo para administración: se suma al menú según el rol de la sesión.
const LOGISTICA_LINK = {
  path: "/admin/logistica/camiones",
  activePrefix: "/admin/logistica",
  label: "Logística",
};

// Flujo 5: también solo para administración, con la misma condición que Logística.
const DONACIONES_LINK = {
  path: "/admin/donaciones/pendientes",
  activePrefix: "/admin/donaciones",
  label: "Donaciones",
};

const RANKINGS_LINK = {
  path: "/administracion?periodo=ultimo#ranking-titulo",
  activePrefix: "/administracion",
  label: "Rankings",
};

function userLabel(user) {
  return user?.nombre ?? user?.username ?? user?.email ?? "Sesión iniciada";
}

function isActive(itemPath, requestPath) {
  if (itemPath === "/") {
    return requestPath === "/";
  }
  return requestPath === itemPath || requestPath.startsWith(`${itemPath}/`);
}

/** Datos comunes del layout: usuario de la sesión y navegación principal. */
export function layoutLocals(req, res, next) {
  const user = req.session?.user ?? null;
  res.locals.user = user;
  res.locals.userLabel = userLabel(user);
  const canSeeLogistica = AUTH_DEV_BYPASS || userHasRole(user, ROLE_ALIASES.ADMIN);
  const navigation = canSeeLogistica ? [...NAVIGATION, DONACIONES_LINK, LOGISTICA_LINK, RANKINGS_LINK] : NAVIGATION;
  res.locals.links = navigation.map((item) => ({
    ...item,
    href: item.path,
    active: isActive(item.activePrefix ?? item.path, req.path),
  }));
  next();
}
