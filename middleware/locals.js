const NAVIGATION = [
  { path: "/", label: "Inicio" },
  { path: "/seguimiento", label: "Seguimiento" },
  { path: "/donante", label: "Donante" },
  { path: "/entidad", label: "Entidad" },
  { path: "/administracion", label: "Administración" },
];

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
  res.locals.links = NAVIGATION.map((item) => ({
    ...item,
    href: item.path,
    active: isActive(item.path, req.path),
  }));
  next();
}
