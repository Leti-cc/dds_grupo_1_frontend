import { Router } from "express";
import { leerMultipart } from "../src/lib/multipart.js";
import { formErrorStatus } from "../src/lib/page-data.js";
import {
  CAMPOS_DONANTE_HUMANA,
  CAMPOS_DONANTE_JURIDICA,
  construirDonacion,
  construirDonante,
  leerBusqueda,
  leerId,
  leerIds,
  leerTipoDonante,
  LIMITES,
  MAX_IMPORT_BYTES,
  validarArchivoCsv,
} from "../src/lib/ingreso-validacion.js";
import {
  conParametros,
  filaPlantilla,
  formatoTamanio,
  mapaDeSubcategorias,
  opcionesGenero,
  opcionesTipoJuridica,
  pasosIngreso,
  resumenErrores,
  URL_BUSCAR,
  URL_IMPORTAR,
  URL_NUEVO_DONANTE,
  URL_RESULTADO,
  urlCargarDonacion,
  vistaDonante,
  vistaFilas,
  vistaResultadoImportacion,
  vistaSegmentacion,
} from "../src/lib/ingreso-vista.js";
import * as ingreso from "../src/services/ingreso-client.js";

// Flujo 3: ingreso de donaciones. Montado en /admin/donaciones con requireRole("ADMIN") y ANTES del
// router de asignaciones (server.js), porque ese router tiene una ruta /:id que se llevaría "nueva" e "importar".
//
//   GET  /nueva                  Paso 1: buscar al donante.
//   GET  /nueva/donante          Alta de un donante nuevo (persona humana o jurídica).
//   POST /nueva/donante
//   GET  /nueva/:donanteId       Paso 2: cargar la donación con sus bienes.
//   POST /nueva/:donanteId
//   GET  /nueva/resultado        Paso 3: cómo quedó segmentada la donación.
//   GET  /importar               Importación masiva de donantes por CSV.
//   POST /importar
const router = Router();

function mensajeDe(error, porDefecto) {
  if (!error.mensajeUsuario) {
    console.error("[ingreso] Error inesperado:", error);
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
      noDisponible: ingreso.esServicioNoDisponible(error),
      error: mensajeDe(error, "No se pudo cargar la información."),
    };
  }
}

function noEncontrado(res, { heading, message }) {
  return res.status(404).render("error", { title: "No encontrado", heading, message });
}

/* ====================== Paso 1: buscar al donante ====================== */

router.get("/nueva", async (req, res) => {
  const { texto, error: errorBusqueda } = leerBusqueda(req.query.q);
  const buscado = Boolean(texto) && !errorBusqueda;
  const busqueda = buscado
    ? await cargarSeccion(
        () => ingreso.buscarDonantes(req, texto),
        (lista) => lista.map(vistaDonante),
      )
    : null;

  const resultados = busqueda?.datos ?? [];
  res.render("admin/ingreso/donante", {
    title: "Registrar donación · Donaciones",
    tab: "nueva",
    pasos: pasosIngreso(1),
    q: texto,
    errorBusqueda,
    buscado,
    resultados,
    sinResultados: Boolean(busqueda?.datos) && resultados.length === 0,
    // El backend corta en 20: si llegó al tope, probablemente haya más coincidencias.
    hayMas: resultados.length >= ingreso.MAX_RESULTADOS_BUSQUEDA,
    servicioNoDisponible: busqueda?.noDisponible,
    errorLista: busqueda?.noDisponible ? undefined : busqueda?.error,
    urlReintento: req.originalUrl,
    urlNuevoDonante: URL_NUEVO_DONANTE,
  });
});

/* ====================== Alta de un donante nuevo ====================== */

function renderAlta(res, status, { tipo, valores = {}, errores = {}, errorGeneral } = {}) {
  const esJuridica = tipo === "JURIDICA";
  return res.status(status).render("admin/ingreso/registrar-donante", {
    title: "Registrar donante · Donaciones",
    tab: "nueva",
    pasos: pasosIngreso(1),
    esHumana: !esJuridica,
    esJuridica,
    valores,
    errores,
    errorGeneral,
    resumen: resumenErrores(errores, esJuridica ? CAMPOS_DONANTE_JURIDICA : CAMPOS_DONANTE_HUMANA),
    generos: opcionesGenero(valores.genero ?? ""),
    tiposJuridica: opcionesTipoJuridica(valores.tipoPersonaJuridica ?? "EMPRESA"),
    urlHumana: URL_NUEVO_DONANTE,
    urlJuridica: conParametros(URL_NUEVO_DONANTE, { tipo: "JURIDICA" }),
    urlVolver: URL_BUSCAR,
  });
}

router.get("/nueva/donante", (req, res) => renderAlta(res, 200, { tipo: leerTipoDonante(req.query.tipo) }));

router.post("/nueva/donante", async (req, res) => {
  const { donante, errores, valores } = construirDonante(req.body);
  if (!donante) {
    return renderAlta(res, 400, { tipo: valores.tipo, valores, errores });
  }

  let creado;
  try {
    creado = await ingreso.crearDonante(req, donante);
  } catch (error) {
    return renderAlta(res, formErrorStatus(error), {
      tipo: valores.tipo,
      valores,
      errorGeneral: mensajeDe(error, "No se pudo registrar el donante."),
    });
  }

  const donanteId = leerId(creado?.id);
  if (!donanteId) {
    req.flash({ type: "success", toast: "Donante registrado. Buscalo para cargar su donación." });
    return res.redirect(URL_BUSCAR);
  }
  req.flash({ type: "success", toast: `Donante registrado: ${vistaDonante(creado).nombre}. Ahora cargá su donación.` });
  return res.redirect(urlCargarDonacion(donanteId));
});

/* ====================== Paso 2: cargar la donación ====================== */

function cargarDatosDeCarga(req, donanteId) {
  return Promise.all([
    cargarSeccion(() => ingreso.obtenerDonante(req, donanteId), vistaDonante),
    cargarSeccion(() => ingreso.listarSubcategorias(req)),
  ]);
}

function renderCarga(res, status, { donanteId, donante, subcategorias, valores = {}, filas = [], errores = {}, resumen = [], errorGeneral }) {
  const hayFormulario = Boolean(donante.datos && subcategorias.datos?.length);
  const lista = subcategorias.datos ?? [];
  return res.status(status).render("admin/ingreso/donacion", {
    title: "Registrar donación · Donaciones",
    tab: "nueva",
    pasos: pasosIngreso(2, { 1: URL_BUSCAR }),
    donanteId,
    donante: donante.datos,
    hayFormulario,
    sinSubcategorias: Boolean(subcategorias.datos) && lista.length === 0,
    servicioNoDisponible: donante.noDisponible || subcategorias.noDisponible,
    errorCarga: donante.noDisponible || subcategorias.noDisponible ? undefined : (donante.error ?? subcategorias.error),
    urlReintento: urlCargarDonacion(donanteId),
    valores,
    errores,
    resumen,
    errorGeneral,
    filas: vistaFilas(filas, lista),
    filaPlantilla: filaPlantilla(lista),
    maxBienes: LIMITES.maxBienes,
    maxDescripcion: LIMITES.descripcionDonacion,
    urlAction: urlCargarDonacion(donanteId),
    urlCambiarDonante: URL_BUSCAR,
  });
}

router.get("/nueva/resultado", async (req, res) => {
  const ids = leerIds(req.query.ids);
  if (ids.length === 0) {
    return res.redirect(URL_BUSCAR);
  }
  const urlActual = conParametros(URL_RESULTADO, { ids: ids.join(","), donante: leerId(req.query.donante) });

  const respuestas = await Promise.allSettled(ids.map((id) => ingreso.obtenerDonacion(req, id)));
  const donaciones = respuestas.filter((respuesta) => respuesta.status === "fulfilled").map((respuesta) => respuesta.value);
  const noCargadas = respuestas.length - donaciones.length;
  const servicioNoDisponible = respuestas.some(
    (respuesta) => respuesta.status === "rejected" && ingreso.esServicioNoDisponible(respuesta.reason),
  );
  for (const respuesta of respuestas) {
    if (respuesta.status === "rejected" && !respuesta.reason?.mensajeUsuario) {
      console.error("[ingreso] Error inesperado:", respuesta.reason);
    }
  }

  const segmentacion = vistaSegmentacion(donaciones, urlActual);
  const donanteId = leerId(req.query.donante) ?? segmentacion.donanteId;
  res.render("admin/ingreso/resultado", {
    title: "Donación registrada · Donaciones",
    tab: "nueva",
    pasos: pasosIngreso(3, { 1: URL_BUSCAR, 2: donanteId ? urlCargarDonacion(donanteId) : null }),
    ...segmentacion,
    hayDonaciones: donaciones.length > 0,
    noCargadas,
    servicioNoDisponible,
    urlReintento: urlActual,
    urlOtraDelDonante: donanteId ? urlCargarDonacion(donanteId) : null,
    urlNuevaCarga: URL_BUSCAR,
    urlAsignar: "/admin/donaciones/pendientes",
  });
});

router.get("/nueva/:donanteId", async (req, res) => {
  const donanteId = leerId(req.params.donanteId);
  if (!donanteId) {
    return noEncontrado(res, { heading: "No encontramos a ese donante", message: "Volvé a buscarlo para cargar su donación." });
  }
  const [donante, subcategorias] = await cargarDatosDeCarga(req, donanteId);
  if (donante.status === 404) {
    req.flash({ type: "error", toast: "Ese donante no existe. Buscalo de nuevo o registralo." });
    return res.redirect(URL_BUSCAR);
  }
  return renderCarga(res, 200, { donanteId, donante, subcategorias });
});

router.post("/nueva/:donanteId", async (req, res) => {
  const donanteId = leerId(req.params.donanteId);
  if (!donanteId) {
    return noEncontrado(res, { heading: "No encontramos a ese donante", message: "Volvé a buscarlo para cargar su donación." });
  }
  const [donante, subcategorias] = await cargarDatosDeCarga(req, donanteId);
  if (donante.status === 404) {
    req.flash({ type: "error", toast: "Ese donante no existe. Buscalo de nuevo o registralo." });
    return res.redirect(URL_BUSCAR);
  }
  if (!donante.datos || !subcategorias.datos) {
    // No se puede validar sin las subcategorías: se vuelve a mostrar el formulario con lo escrito.
    const { valores, filas } = construirDonacion(req.body, donanteId);
    return renderCarga(res, 503, { donanteId, donante, subcategorias, valores, filas });
  }

  const { donacion, valores, filas, errores, resumen } = construirDonacion(
    req.body,
    donanteId,
    mapaDeSubcategorias(subcategorias.datos),
  );
  if (!donacion) {
    return renderCarga(res, 400, { donanteId, donante, subcategorias, valores, filas, errores, resumen });
  }

  let creadas;
  try {
    creadas = await ingreso.registrarDonacion(req, donacion);
  } catch (error) {
    return renderCarga(res, formErrorStatus(error), {
      donanteId,
      donante,
      subcategorias,
      valores,
      filas,
      errorGeneral: mensajeDe(error, "No se pudo registrar la donación."),
    });
  }

  const ids = creadas.map((creada) => leerId(creada?.id)).filter(Boolean);
  if (ids.length === 0) {
    req.flash({ type: "success", toast: "Donación registrada. Podés verla en Todas las donaciones." });
    return res.redirect("/admin/donaciones/todas");
  }
  req.flash({
    type: "success",
    toast: ids.length === 1 ? "Donación registrada." : `Donación registrada: se generaron ${ids.length} donaciones.`,
  });
  return res.redirect(conParametros(URL_RESULTADO, { ids: ids.join(","), donante: donanteId }));
});

/* ====================== Importación masiva por CSV ====================== */

function renderImportar(res, status, { error, resultado = null } = {}) {
  return res.status(status).render("admin/ingreso/importar", {
    title: "Importar donantes · Donaciones",
    tab: "importar",
    errorArchivo: error,
    resultado,
    maxMb: Math.round(MAX_IMPORT_BYTES / (1024 * 1024)),
    maxBytes: MAX_IMPORT_BYTES,
    maxTexto: formatoTamanio(MAX_IMPORT_BYTES),
  });
}

router.get("/importar", (req, res) => renderImportar(res, 200, { resultado: res.locals.flash?.importacion ?? null }));

router.post("/importar", async (req, res) => {
  // Un poco más que el máximo del archivo: el multipart suma encabezados.
  if (Number(req.headers["content-length"] ?? 0) > MAX_IMPORT_BYTES + 64 * 1024) {
    return renderImportar(res, 413, { error: validarArchivoCsv({ name: "x.csv", size: MAX_IMPORT_BYTES + 1 }) });
  }

  let archivo;
  try {
    archivo = (await leerMultipart(req)).get("file");
  } catch (error) {
    console.error("[ingreso] No se pudo leer el archivo de importación:", error.message);
    return renderImportar(res, 400, { error: "No pudimos leer el archivo. Volvé a elegirlo e intentá de nuevo." });
  }

  const errorArchivo = validarArchivoCsv(archivo);
  if (errorArchivo) {
    return renderImportar(res, errorArchivo.includes("máximo") ? 413 : 400, { error: errorArchivo });
  }

  let respuesta;
  try {
    respuesta = await ingreso.importarDonantes(req, archivo);
  } catch (error) {
    return renderImportar(res, formErrorStatus(error), { error: mensajeDe(error, "No se pudo importar el archivo.") });
  }

  const resultado = vistaResultadoImportacion(respuesta);
  req.flash({
    type: resultado.estado,
    toast: resultado.hayErrores ? "La importación terminó con errores." : "La importación terminó correctamente.",
    importacion: resultado,
  });
  return res.redirect(URL_IMPORTAR);
});

export default router;
