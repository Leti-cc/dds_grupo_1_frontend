import { Router } from "express";
import {
  ESTADOS_DONACION,
  leerEstado,
  leerId,
  leerPagina,
  urlVolverSegura,
} from "../src/lib/asignaciones-validacion.js";
import {
  conParametros,
  opcionesEstado,
  opcionesSubcategoria,
  pasosLinea,
  resultadoDeError,
  TEXTO_YA_NO_EN_DEPOSITO,
  textoCantidadDonaciones,
  vistaDonacion,
  vistaPaginacion,
  vistaPendiente,
  vistaRanking,
} from "../src/lib/asignaciones-vista.js";
import * as donaciones from "../src/services/asignaciones-client.js";

// Montado en /admin/donaciones con requireRole("ADMIN") (server.js).
const router = Router();

const PREFIJO = "/admin/donaciones/";
const URL_PENDIENTES = "/admin/donaciones/pendientes";
const URL_TODAS = "/admin/donaciones/todas";

function mensajeDe(error, porDefecto) {
  if (!error.mensajeUsuario) {
    console.error("[asignaciones] Error inesperado:", error);
  }
  return error.mensajeUsuario ?? porDefecto;
}

/** Carga una sección sin romper la página si el backend falla. */
async function cargarSeccion(pedido, adaptar = (valor) => valor) {
  try {
    return { datos: adaptar(await pedido()) };
  } catch (error) {
    return {
      status: error.status,
      noDisponible: donaciones.esServicioNoDisponible(error),
      error: mensajeDe(error, "No se pudo cargar la información de donaciones."),
    };
  }
}

function cargarSubcategorias(req, seleccionada) {
  return cargarSeccion(
    () => donaciones.listarSubcategorias(req),
    (valor) => opcionesSubcategoria(Array.isArray(valor) ? valor : [], seleccionada),
  );
}

function cargarPanel(req, donacionId, abrirVencer) {
  return cargarSeccion(
    () => Promise.all([donaciones.obtenerRanking(req, donacionId), donaciones.obtenerDonacion(req, donacionId)]),
    ([ranking, donacion]) => ({
      donacion: vistaDonacion(donacion),
      ranking: vistaRanking(ranking),
      abrirRanking: !abrirVencer,
      abrirVencer,
    }),
  );
}

function noEncontrada(res) {
  return res.status(404).render("error", {
    title: "Donación no encontrada",
    heading: "No encontramos esa donación",
    message: "Revisá el enlace o volvé a la lista de donaciones.",
  });
}

/** Página pedida fuera de rango (F5): la última página válida, o null si está bien. */
function paginaCorregida(pagina, paginaDTO) {
  const ultima = Math.max(paginaDTO?.totalPaginas ?? 0, 1);
  return paginaDTO && pagina > ultima ? ultima : null;
}

router.get("/", (req, res) => res.redirect(URL_PENDIENTES));

/* ---------- Pendientes de asignación: cola + ranking en un modal (?donacion=128) ---------- */

router.get("/pendientes", async (req, res) => {
  const pagina = leerPagina(req.query.page);
  const subcategoriaId = leerId(req.query.subcategoriaId);
  const donacionId = leerId(req.query.donacion);
  const urlFiltros = conParametros(URL_PENDIENTES, { subcategoriaId });
  const urlLista = conParametros(urlFiltros, { page: pagina > 1 ? pagina : null });

  const [lista, subcategorias, panel] = await Promise.all([
    cargarSeccion(() => donaciones.listarPendientes(req, { page: pagina - 1, subcategoriaId })),
    cargarSubcategorias(req, subcategoriaId),
    donacionId ? cargarPanel(req, donacionId, req.query.confirmar === "vencer") : null,
  ]);

  if (panel?.status === 404) {
    req.flash({ type: "error", toast: TEXTO_YA_NO_EN_DEPOSITO });
    return res.redirect(urlLista);
  }

  const corregida = paginaCorregida(pagina, lista.datos);
  if (corregida) {
    return res.redirect(
      conParametros(req.originalUrl, { page: corregida > 1 ? corregida : null }),
    );
  }

  const paginaDTO = lista.datos;
  return res.render("admin/donaciones/pendientes", {
    title: "Pendientes de asignación · Donaciones",
    tab: "pendientes",
    urlReintento: req.originalUrl,
    servicioNoDisponible: lista.noDisponible || panel?.noDisponible,
    errorLista: lista.noDisponible ? undefined : lista.error,
    listaCargada: Boolean(paginaDTO),
    pendientes: (paginaDTO?.contenido ?? []).map((pendiente) => vistaPendiente(pendiente, urlLista, donacionId)),
    totalTexto: `${textoCantidadDonaciones(paginaDTO?.totalElementos ?? 0)} en depósito`,
    paginacion: paginaDTO ? vistaPaginacion(paginaDTO, urlFiltros) : null,
    filtroActivo: subcategoriaId != null,
    subcategorias: subcategorias.datos,
    urlQuitarFiltro: URL_PENDIENTES,
    volver: urlLista,
    panel: panel && {
      id: donacionId,
      urlCerrar: urlLista,
      ...(panel.datos ?? { error: panel.noDisponible ? undefined : panel.error, sinDatos: true, abrirRanking: true }),
    },
  });
});

/* ---------- Todas las donaciones: consulta de solo lectura (F2) ---------- */

router.get("/todas", async (req, res) => {
  const estado = leerEstado(req.query.estado);
  const subcategoriaId = leerId(req.query.subcategoriaId);
  const urlActual = conParametros(URL_TODAS, { estado, subcategoriaId });

  const [lista, subcategorias] = await Promise.all([
    cargarSeccion(() => donaciones.listarDonaciones(req, { estado, subcategoriaId })),
    cargarSubcategorias(req, subcategoriaId),
  ]);

  const filas = (lista.datos ?? []).map((donacion) => ({
    ...vistaDonacion(donacion),
    hrefDetalle: conParametros(`${PREFIJO}${donacion.id}`, { volver: urlActual }),
    hrefAsignar: donacion.estado === "EN_DEPOSITO" ? conParametros(URL_PENDIENTES, { donacion: donacion.id }) : null,
  }));

  res.render("admin/donaciones/todas", {
    title: "Todas las donaciones · Donaciones",
    tab: "todas",
    urlReintento: req.originalUrl,
    servicioNoDisponible: lista.noDisponible,
    errorLista: lista.noDisponible ? undefined : lista.error,
    listaCargada: Boolean(lista.datos),
    donaciones: filas,
    totalTexto: textoCantidadDonaciones(filas.length),
    filtroActivo: Boolean(estado) || subcategoriaId != null,
    estados: opcionesEstado(ESTADOS_DONACION, estado),
    subcategorias: subcategorias.datos,
    urlQuitarFiltro: URL_TODAS,
  });
});

/* ---------- Detalle de cualquier donación ---------- */

router.get("/:id", async (req, res) => {
  const id = leerId(req.params.id);
  if (!id) {
    return noEncontrada(res);
  }
  const volver = urlVolverSegura(req.query.volver, PREFIJO, URL_TODAS);

  const detalle = await cargarSeccion(() => donaciones.obtenerDonacion(req, id));
  if (detalle.status === 404) {
    req.flash({ type: "error", toast: "La donación no existe." });
    return res.redirect(volver);
  }

  const donacion = detalle.datos;
  return res.render("admin/donaciones/detalle", {
    title: `Donación #${id} · Donaciones`,
    id,
    volver,
    urlReintento: req.originalUrl,
    servicioNoDisponible: detalle.noDisponible,
    errorCarga: detalle.noDisponible ? undefined : detalle.error,
    donacion: donacion && vistaDonacion(donacion),
    pasos: donacion && pasosLinea(donacion.estado, { desdeDeposito: true }),
    hrefAsignar: donacion?.estado === "EN_DEPOSITO" ? conParametros(URL_PENDIENTES, { donacion: id }) : null,
  });
});

/* ---------- Acciones: asignar y marcar vencida (PRG) ---------- */

/**
 * Ejecuta la acción y aplica Post/Redirect/Get. Si sale bien vuelve a la lista (la donación ya no
 * está en la cola); si falla, el destino depende del codigo del error (resultadoDeError).
 */
async function accion(req, res, ejecutar, textoExito) {
  const id = leerId(req.params.id);
  if (!id) {
    return noEncontrada(res);
  }
  const volver = urlVolverSegura(req.body?.volver, PREFIJO, URL_PENDIENTES);
  const destinos = {
    lista: conParametros(volver, { donacion: null, confirmar: null }),
    panel: conParametros(volver, { donacion: id, confirmar: null }),
  };

  try {
    const donacion = await ejecutar(id);
    req.flash({ type: "success", toast: textoExito(id, donacion) });
    return res.redirect(destinos.lista);
  } catch (error) {
    if (!error.mensajeUsuario) {
      console.error("[asignaciones] Error inesperado:", error);
    }
    const { toast, destino } = resultadoDeError(error, destinos);
    // Si se vuelve al modal, un toast quedaría tapado por el fondo del modal: el error va adentro del modal.
    req.flash(destino === destinos.panel ? { type: "error", form: "ranking", message: toast } : { type: "error", toast });
    return res.redirect(destino);
  }
}

// Mismo tratamiento que un 400 del backend: toast y vuelta al panel.
const SIN_ENTIDAD = Object.freeze({ codigo: "SOLICITUD_INVALIDA", mensajeUsuario: "Elegí una entidad del ranking." });

router.post("/:id/asignar", (req, res) => {
  const entidadId = leerId(req.body?.entidadId);
  return accion(
    req,
    res,
    (id) => (entidadId ? donaciones.asignarDonacion(req, id, entidadId) : Promise.reject(SIN_ENTIDAD)),
    (id, donacion) => `La donación #${id} se asignó correctamente a ${donacion?.entidadNombre ?? "la entidad elegida"}.`,
  );
});

router.post("/:id/vencer", (req, res) =>
  accion(
    req,
    res,
    (id) => donaciones.marcarVencida(req, id),
    (id) => `La donación #${id} se marcó como vencida.`,
  ),
);

export default router;
