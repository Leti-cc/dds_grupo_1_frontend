import { Router } from "express";
import { AUTH_DEV_BYPASS, PORT } from "../src/config.js";
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
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { leerMultipart } from "../src/lib/multipart.js";
import { MAX_BYTES_FOTO, MAX_FOTOS, TIPOS_FOTO, validarFotos, validarMotivo } from "../src/lib/recepcion-validacion.js";
import * as logistica from "../src/services/logistica-client.js";

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

// Manejo de las rutas

const DIR_UPLOADS = new URL("../uploads/", import.meta.url);
const BASE_PUBLICA = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const LIMITE_FORMULARIO = MAX_FOTOS * MAX_BYTES_FOTO + 256 * 1024;

async function prepararRecepcion(req, res, volverDelForm) {

  const id = leerId(req.params.id);
  if (!id) return { respuesta: noEncontrada(res) };

  const { entidadId, conservar } = entidadActual(req);
  const volver = urlVolverSegura(volverDelForm, PREFIJO, conParametros(`${PREFIJO}/${id}`, conservar));
  if (!entidadId) return { respuesta: res.redirect(volver) };

  const donacion = await donaciones.obtenerDonacion(req, id);
  if (donacion?.entidadId !== entidadId) return { respuesta: noEncontrada(res) };
  if (donacion.estado !== "EN_TRASLADO") {

    req.flash({ type: "error", toast: "Esta donación ya no está en traslado." });
    return { respuesta: res.redirect(volver) };

  }

  const entrega = await logistica.entregaEnTrasladoDeDonacion(req, id);
  if (!entrega) {

    req.flash({ type: "error", toast: "No encontramos la entrega en logística. Probá de nuevo en un momento." });
    return { respuesta: res.redirect(volver) };

  }

  return { id, entrega, volver };
}

function falla(req, res, volver, error, porDefecto) {
  
  if (!error.mensajeUsuario) console.error("[donaciones-entidad] Error inesperado:", error);
  req.flash({ type: "error", toast: error.mensajeUsuario ?? porDefecto });
  return res.redirect(volver);

}

router.post("/:id/recepcion", async (req, res) => {
  
  const { conservar } = entidadActual(req);
  const urlDetalle = conParametros(`${PREFIJO}/${leerId(req.params.id) ?? ""}`, conservar);
  
  if (Number(req.headers["content-length"] ?? 0) > LIMITE_FORMULARIO) {
    
    req.flash({ type: "error", toast: "Las fotos pesan demasiado. Subí hasta 3 de 5 MB cada una." });
    return res.redirect(urlDetalle);

  }

  let formulario;
  
  try {
    formulario = await leerMultipart(req);
  
  } catch {
    
    req.flash({ type: "error", toast: "No pudimos leer las fotos. Probá de nuevo." });
    return res.redirect(urlDetalle);
  }
  let contexto;
  try {
    contexto = await prepararRecepcion(req, res, formulario.get("volver"));
  
  } catch (error) {
    
    return falla(req, res, URL_LISTA, error, "No se pudo cargar la donación.");
  }
  
  if (contexto.respuesta) return contexto.respuesta;
  
  const { id, entrega, volver } = contexto;

  const { fotos, error: errorFotos } = validarFotos(formulario.getAll("fotos"));
  
  if (errorFotos) {
    
    req.flash({ type: "error", toast: errorFotos });
    return res.redirect(volver);
  
  }
  
  try {
    
    await mkdir(DIR_UPLOADS, { recursive: true });
    const urls = [];
    
    for (const foto of fotos) {
      
      const nombre = `${id}-${randomUUID()}.${TIPOS_FOTO[foto.type]}`;
      await writeFile(new URL(nombre, DIR_UPLOADS), Buffer.from(await foto.arrayBuffer()));
      urls.push(`${BASE_PUBLICA}/uploads/${nombre}`);
    
    }
    
    await logistica.cambiarEstadoEntrega(req, entrega.id, { nuevoEstado: "ENTREGADA", fotoUrl: urls.join("|") });
    req.flash({ type: "success", toast: "Recepción confirmada. El estado se actualiza en unos instantes." });
    return res.redirect(volver);
  
  } catch (error) {
    
    return falla(req, res, volver, error, "No se pudo registrar la recepción.");
  }

});

router.post("/:id/no-recibida", async (req, res) => {
  
  let contexto;
  
  try {
    contexto = await prepararRecepcion(req, res, req.body?.volver);
  
  } catch (error) {
  
    return falla(req, res, URL_LISTA, error, "No se pudo cargar la donación.");
  }
  
  if (contexto.respuesta) return contexto.respuesta;
  const { entrega, volver } = contexto;
  const { motivo, error: errorMotivo } = validarMotivo(req.body?.motivo);
  
  if (errorMotivo) {
  
    req.flash({ type: "error", toast: errorMotivo });
    return res.redirect(volver);
  
  }
  
  try {
    
    await logistica.cambiarEstadoEntrega(req, entrega.id, { nuevoEstado: "NO_RECIBIDA", motivo });
    req.flash({ type: "success", toast: "Registramos que no recibiste la donación. La administración la va a revisar." });
    return res.redirect(volver);
  
  } catch (error) {
  
    return falla(req, res, volver, error, "No se pudo registrar la novedad.");
  }
  
});

export default router;