import { Router } from "express";
import { ENABLE_DEMO_TOOLS, MAPA_POLLING_MS } from "../src/config.js";
import { armarRutasSimuladas } from "../src/lib/logistica-simulador.js";
import { validarCamion } from "../src/lib/logistica-validacion.js";
import {
  datosMapa,
  textoEntregasPendientes,
  vistaCamion,
  vistaEntrega,
  vistaRuta,
} from "../src/lib/logistica-vista.js";
import { formErrorStatus, readArray } from "../src/lib/page-data.js";
import * as logistica from "../src/services/logistica-client.js";

const router = Router();

const URL_CAMIONES = "/admin/logistica/camiones";
const URL_ENTREGAS = "/admin/logistica/entregas";
const VISTA_CAMIONES = "admin/logistica/camiones";
const VISTA_EDITAR = "admin/logistica/camion-editar";
const VISTA_ENTREGAS = "admin/logistica/entregas";
const VISTA_MAPA = "admin/logistica/mapa";

const BANNER_PLANIFICACION =
  "Se envió la solicitud de planificación. Las rutas aparecerán cuando el optimizador responda.";
const SIN_DATOS_PARA_PLANIFICAR = /no hay|sin (entregas|camiones)/i;

function mensajeDe(error, porDefecto) {
  if (!error.mensajeUsuario) {
    console.error("[logistica] Error inesperado:", error);
  }
  return error.mensajeUsuario ?? porDefecto;
}

/** Carga una sección sin romper la página si el backend falla. */
async function cargarSeccion(pedido, adaptar) {
  try {
    return { datos: adaptar(await pedido()) };
  } catch (error) {
    return {
      noDisponible: logistica.esServicioNoDisponible(error),
      error: mensajeDe(error, "No se pudo cargar la información de logística."),
    };
  }
}

function cargarCamiones(req) {
  return cargarSeccion(
    () => logistica.listarCamiones(req),
    (valor) => readArray(valor, "camiones").map((camion) => vistaCamion(camion)),
  );
}

async function renderCamiones(req, res, { status = 200, ...extra } = {}) {
  const camiones = await cargarCamiones(req);
  res.status(status).render(VISTA_CAMIONES, {
    title: "Camiones · Logística",
    tab: "camiones",
    camiones: camiones.datos ?? [],
    listadoCargado: Boolean(camiones.datos),
    servicioNoDisponible: camiones.noDisponible,
    errorCarga: camiones.noDisponible ? undefined : camiones.error,
    ...extra,
  });
}

function renderEditar(res, patente, extra, status = 200) {
  res.status(status).render(VISTA_EDITAR, {
    title: `Editar ${patente} · Logística`,
    patente,
    patenteUrl: encodeURIComponent(patente),
    ...extra,
  });
}

router.get("/", (req, res) => res.redirect(URL_CAMIONES));

/* ---------- Camiones ---------- */

router.get("/camiones", (req, res) => renderCamiones(req, res));

router.post("/camiones", async (req, res) => {
  const { datos, errores, valores, valido } = validarCamion(req.body);
  if (!valido) {
    return renderCamiones(req, res, { status: 400, abrirAlta: true, valores, errores });
  }

  try {
    await logistica.crearCamion(req, datos);
  } catch (error) {
    const mensaje = mensajeDe(error, `No se pudo registrar el camión ${datos.patente}.`);
    // El contrato devuelve 500 cuando la patente está repetida: el error va junto a ese campo.
    const errorDeCampo = error.status === 500 ? { errores: { patente: mensaje } } : { errorFormulario: mensaje };
    return renderCamiones(req, res, {
      status: formErrorStatus(error),
      abrirAlta: true,
      valores,
      ...errorDeCampo,
    });
  }

  req.flash({ type: "success", toast: `Camión ${datos.patente} registrado.` });
  return res.redirect(URL_CAMIONES);
});

router.get("/camiones/:patente/editar", async (req, res) => {
  const { patente } = req.params;
  const camiones = await cargarCamiones(req);
  if (!camiones.datos) {
    return renderEditar(res, patente, {
      urlReintento: req.originalUrl,
      servicioNoDisponible: camiones.noDisponible,
      errorCarga: camiones.noDisponible ? undefined : camiones.error,
    });
  }

  const camion = camiones.datos.find((item) => item.patente === patente);
  if (!camion) {
    req.flash({ type: "error", toast: `No se encontró el camión ${patente}.` });
    return res.redirect(URL_CAMIONES);
  }

  return renderEditar(res, patente, {
    mostrarFormulario: true,
    valores: camion,
  });
});

router.post("/camiones/:patente/editar", async (req, res) => {
  const { patente } = req.params;
  const { datos, errores, valores, valido } = validarCamion(req.body, { patente });
  if (!valido) {
    return renderEditar(res, patente, { mostrarFormulario: true, valores, errores }, 400);
  }

  try {
    await logistica.modificarCamion(req, patente, datos);
  } catch (error) {
    return renderEditar(
      res,
      patente,
      {
        mostrarFormulario: true,
        valores,
        errorFormulario: mensajeDe(error, `No se pudo modificar el camión ${patente}.`),
      },
      formErrorStatus(error),
    );
  }

  req.flash({ type: "success", toast: `Camión ${patente} actualizado.` });
  return res.redirect(URL_CAMIONES);
});

router.post("/camiones/:patente/baja", async (req, res) => {
  const { patente } = req.params;
  try {
    await logistica.darDeBajaCamion(req, patente);
    req.flash({ type: "success", toast: `Camión ${patente} dado de baja.` });
  } catch (error) {
    req.flash({ type: "error", toast: mensajeDe(error, `No se pudo dar de baja el camión ${patente}.`) });
  }
  res.redirect(URL_CAMIONES);
});

/* ---------- Entregas y rutas ---------- */

router.get("/entregas", async (req, res) => {
  const [entregas, rutas] = await Promise.all([
    cargarSeccion(
      () => logistica.listarEntregas(req, "PENDIENTE"),
      (valor) => readArray(valor, "entregas").map(vistaEntrega),
    ),
    cargarSeccion(
      () => logistica.listarRutasActivas(req),
      (valor) => readArray(valor, "rutas activas").map(vistaRuta),
    ),
  ]);

  res.render(VISTA_ENTREGAS, {
    title: "Entregas y rutas · Logística",
    tab: "entregas",
    demoTools: ENABLE_DEMO_TOOLS,
    servicioNoDisponible: entregas.noDisponible || rutas.noDisponible,
    entregas: entregas.datos ?? [],
    entregasCargadas: Boolean(entregas.datos),
    errorEntregas: entregas.noDisponible ? undefined : entregas.error,
    contadorPendientes: textoEntregasPendientes(entregas.datos?.length ?? 0),
    rutas: rutas.datos ?? [],
    rutasCargadas: Boolean(rutas.datos),
    errorRutas: rutas.noDisponible ? undefined : rutas.error,
  });
});

router.post("/entregas/planificar", async (req, res) => {
  try {
    const respuesta = await logistica.solicitarPlanificacion(req);
    const sinDatos = typeof respuesta === "string" && SIN_DATOS_PARA_PLANIFICAR.test(respuesta);
    req.flash({
      type: "info",
      form: "planificacion",
      message: sinDatos ? respuesta : BANNER_PLANIFICACION,
    });
  } catch (error) {
    req.flash({ type: "error", toast: mensajeDe(error, "No se pudo enviar la solicitud de planificación.") });
  }
  res.redirect(URL_ENTREGAS);
});

router.post("/entregas/simular", async (req, res) => {
  if (!ENABLE_DEMO_TOOLS) {
    return res.status(404).render("error", {
      title: "No disponible",
      heading: "Herramienta no disponible",
      message: "La simulación del optimizador solo funciona con el modo demostración activado.",
    });
  }

  try {
    const [entregas, camiones] = await Promise.all([
      logistica.listarEntregas(req, "PENDIENTE"),
      logistica.listarCamiones(req),
    ]);
    const rutas = armarRutasSimuladas(entregas, camiones);
    if (rutas.length === 0) {
      req.flash({ type: "info", toast: "No hay entregas pendientes o camiones disponibles para simular." });
    } else {
      await logistica.simularRespuestaPlanificador(req, rutas);
      req.flash({
        type: "success",
        toast: `Optimizador simulado: ${rutas.length === 1 ? "se creó 1 ruta" : `se crearon ${rutas.length} rutas`}.`,
      });
    }
  } catch (error) {
    req.flash({ type: "error", toast: mensajeDe(error, "No se pudo simular la respuesta del optimizador.") });
  }
  return res.redirect(URL_ENTREGAS);
});

router.post("/rutas/:patente/iniciar", async (req, res) => {
  const { patente } = req.params;
  try {
    // La página pudo quedar vieja: el backend responde 500 si no hay ruta o si ya se inició.
    const ruta = await logistica.obtenerRutaActiva(req, patente);
    if (!ruta) {
      req.flash({ type: "error", toast: `El camión ${patente} ya no tiene una ruta activa.` });
    } else if (ruta.fechaHoraInicio != null) {
      req.flash({ type: "info", toast: `La ruta del camión ${patente} ya estaba iniciada.` });
    } else {
      await logistica.iniciarRuta(req, patente);
      req.flash({ type: "success", toast: `Ruta del camión ${patente} iniciada. Las entregas están En camino.` });
    }
  } catch (error) {
    req.flash({ type: "error", toast: mensajeDe(error, `No se pudo iniciar la ruta del camión ${patente}.`) });
  }
  res.redirect(URL_ENTREGAS);
});

/* ---------- Mapa ---------- */

// La página llega sin datos: los trae el navegador por polling contra /mapa/datos.
router.get("/mapa", (req, res) => {
  res.render(VISTA_MAPA, {
    title: "Mapa · Logística",
    tab: "mapa",
    leaflet: true,
    pollingMs: MAPA_POLLING_MS,
  });
});

// Endpoint del front: el navegador le pega a este, nunca a la API de logística.
router.get("/mapa/datos", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json(datosMapa(readArray(await logistica.listarCamiones(req), "camiones")));
  } catch (error) {
    res.status(logistica.esServicioNoDisponible(error) ? 503 : 502).json({
      mensaje: mensajeDe(error, "No se pudo actualizar el mapa."),
    });
  }
});

export default router;
