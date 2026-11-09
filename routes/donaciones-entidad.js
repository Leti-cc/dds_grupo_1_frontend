import { Router } from "express";
import { AUTH_DEV_BYPASS } from "../src/config.js";
import { ESTADOS_ENTIDAD, leerEstado, leerId, leerPagina, urlVolverSegura } from "../src/lib/asignaciones-validacion.js";
import {
  conParametros,
  opcionesEstado,
  pasosLinea,
  textoCantidadDonaciones,
  vistaDonacion,
  vistaPaginacion,
} from "../src/lib/asignaciones-vista.js";
import * as donaciones from "../src/services/asignaciones-client.js";

// Montado en /entidad/donaciones con requireRole("ENTIDAD") (server.js).
const router = Router();

const URL_LISTA = "/entidad/donaciones";
const PREFIJO = "/entidad/donaciones";

/**
 * La entidad sale de la sesión (F7). Solo con AUTH_DEV_BYPASS=true se acepta ?entidadId= para probar
 * sin el servicio de autenticación; en ese caso los links lo conservan.
 */
function entidadActual(req) {
  const deLaUrl = AUTH_DEV_BYPASS ? leerId(req.query.entidadId) : null;
  if (deLaUrl) {
    return { entidadId: deLaUrl, conservar: { entidadId: deLaUrl } };
  }
  return { entidadId: leerId(req.session?.user?.entidadId), conservar: {} };
}

const TEXTO_SIN_ENTIDAD = AUTH_DEV_BYPASS
  ? "Modo desarrollo: agregá ?entidadId= a la URL (por ejemplo, /entidad/donaciones?entidadId=4) para ver las donaciones de una entidad."
  : "Tu cuenta no tiene una entidad beneficiaria asociada. Si creés que es un error, contactá a la administración.";

function noEncontrada(res) {
  return res.status(404).render("error", {
    title: "Donación no encontrada",
    heading: "No encontramos esa donación",
    message: "Revisá el enlace o volvé a la lista de donaciones asignadas.",
  });
}

function mensajeDe(error, porDefecto) {
  if (!error.mensajeUsuario) {
    console.error("[donaciones-entidad] Error inesperado:", error);
  }
  return error.mensajeUsuario ?? porDefecto;
}

router.get("/", async (req, res) => {
  const { entidadId, conservar } = entidadActual(req);
  const estado = leerEstado(req.query.estado, ESTADOS_ENTIDAD);
  const pagina = leerPagina(req.query.page);
  const modelo = {
    title: "Donaciones asignadas · Entidad",
    estados: opcionesEstado(ESTADOS_ENTIDAD, estado, "Todas"),
    conservarEntidad: conservar.entidadId,
    urlQuitarFiltro: conParametros(URL_LISTA, conservar),
  };

  if (!entidadId) {
    return res.render("entidad/donaciones/listado", { ...modelo, sinEntidad: TEXTO_SIN_ENTIDAD });
  }

  const urlFiltros = conParametros(URL_LISTA, { ...conservar, estado });
  const urlActual = conParametros(urlFiltros, { page: pagina > 1 ? pagina : null });

  let paginaDTO;
  try {
    paginaDTO = await donaciones.listarDonacionesDeEntidad(req, entidadId, {
      estados: estado ? [estado] : [],
      page: pagina - 1,
    });
  } catch (error) {
    const noDisponible = donaciones.esServicioNoDisponible(error);
    return res.render("entidad/donaciones/listado", {
      ...modelo,
      urlReintento: req.originalUrl,
      servicioNoDisponible: noDisponible,
      errorLista:
        error.status === 404
          ? "No encontramos la entidad asociada a tu cuenta."
          : noDisponible
            ? undefined
            : mensajeDe(error, "No se pudieron cargar las donaciones asignadas."),
    });
  }

  // Página fuera de rango (F5): a la última válida.
  const ultima = Math.max(paginaDTO?.totalPaginas ?? 0, 1);
  if (pagina > ultima) {
    return res.redirect(conParametros(urlActual, { page: ultima > 1 ? ultima : null }));
  }

  const filas = (paginaDTO?.contenido ?? []).map((donacion) => ({
    ...vistaDonacion(donacion),
    hrefDetalle: conParametros(`${PREFIJO}/${donacion.id}`, { ...conservar, volver: urlActual }),
  }));

  return res.render("entidad/donaciones/listado", {
    ...modelo,
    listaCargada: true,
    donaciones: filas,
    totalTexto: textoCantidadDonaciones(paginaDTO?.totalElementos ?? filas.length),
    paginacion: vistaPaginacion(paginaDTO, urlFiltros),
    filtroActivo: Boolean(estado),
  });
});

router.get("/:id", async (req, res) => {
  const id = leerId(req.params.id);
  if (!id) {
    return noEncontrada(res);
  }
  const { entidadId, conservar } = entidadActual(req);
  const volver = urlVolverSegura(req.query.volver, PREFIJO, conParametros(URL_LISTA, conservar));
  if (!entidadId) {
    return res.redirect(volver);
  }

  let donacion;
  try {
    donacion = await donaciones.obtenerDonacion(req, id);
  } catch (error) {
    if (error.status === 404) {
      return noEncontrada(res);
    }
    const noDisponible = donaciones.esServicioNoDisponible(error);
    return res.render("entidad/donaciones/detalle", {
      title: `Donación #${id} · Entidad`,
      id,
      volver,
      urlReintento: req.originalUrl,
      servicioNoDisponible: noDisponible,
      errorCarga: noDisponible ? undefined : mensajeDe(error, "No se pudo cargar la donación."),
    });
  }

  // F8: el backend todavía no controla que la donación sea de esta entidad. Si no lo es, se responde
  // igual que si no existiera, para no revelar que el id es válido.
  if (donacion?.entidadId !== entidadId) {
    return noEncontrada(res);
  }

  return res.render("entidad/donaciones/detalle", {
    title: `Donación #${id} · Entidad`,
    id,
    volver,
    donacion: vistaDonacion(donacion),
    pasos: pasosLinea(donacion.estado),
  });
});

export default router;
