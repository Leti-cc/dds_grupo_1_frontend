import { Router } from "express";
import { AUTH_DEV_BYPASS } from "../src/config.js";
import { filtrarDonaciones, leerFecha } from "../src/lib/donante-filtros.js";
import { ESTADOS_DONACION, leerEstado, leerId, leerPagina, urlVolverSegura } from "../src/lib/asignaciones-validacion.js";
import {

  conParametros, opcionesEstado, opcionesSubcategoria, pasosLinea,
  textoCantidadDonaciones, vistaDonacion, vistaPaginacion,

} from "../src/lib/asignaciones-vista.js";

import * as donaciones from "../src/services/asignaciones-client.js";

const router = Router();
const PREFIJO = "/donante/donaciones";

// El donante sale de la sesión. Con AUTH_DEV_BYPASS=true se acepta ?donanteId= para probar.

function donanteActual(req) {
  
  const deLaUrl = AUTH_DEV_BYPASS ? leerId(req.query.donanteId) : null;
  if (deLaUrl) return { donanteId: deLaUrl, conservar: { donanteId: deLaUrl } };
  return { donanteId: leerId(req.session?.user?.donanteId), conservar: {} };

}

function noEncontrada(res) {
    
    return res.status(404).render("error", {
        title: "Donación no encontrada",
        heading: "No encontramos esa donación",
        message: "Revisá el enlace o volvé a tus donaciones.",
    });
}

router.get("/", async (req, res) => {

  const { donanteId, conservar } = donanteActual(req);
  const estado = leerEstado(req.query.estado, ESTADOS_DONACION);
  const categoriaId = leerId(req.query.categoria);
  const subcategoriaId = leerId(req.query.subcategoria);
  const desde = leerFecha(req.query.desde);
  const hasta = leerFecha(req.query.hasta);
  const modelo = { title: "Mis donaciones", conservarDonante: conservar.donanteId, urlQuitarFiltro: conParametros(PREFIJO, conservar) };
  if (!donanteId) return res.render("donante/donaciones/listado", { ...modelo, sinDonante: true });

  try {

    const [todas, subcategorias] = await Promise.all([
      donaciones.listarDonaciones(req, { estado }),
      donaciones.listarSubcategorias(req),
    ]);

    const lista = filtrarDonaciones(todas, { donanteId, categoriaId, subcategoriaId, desde, hasta }, subcategorias);

    const totalPaginas = Math.max(Math.ceil(lista.length / donaciones.TAMANIO_PAGINA), 1);
    const pagina = Math.min(leerPagina(req.query.page), totalPaginas);
    const urlFiltros = conParametros(PREFIJO, { ...conservar, estado, categoria: categoriaId, subcategoria: subcategoriaId, desde, hasta });
    const urlActual = conParametros(urlFiltros, { page: pagina > 1 ? pagina : null });

    const categorias = [...new Map(subcategorias.map((s) => [s.categoriaId, s])).values()].map((s) => ({
      valor: s.categoriaId, texto: s.categoriaNombre, seleccionado: s.categoriaId === categoriaId,
    }));

    return res.render("donante/donaciones/listado", {

      ...modelo,
      listaCargada: true,
      estados: opcionesEstado(ESTADOS_DONACION, estado, "Todos"),
      categorias: [{ valor: "", texto: "Todas", seleccionado: categoriaId == null }, ...categorias],
      subcategorias: opcionesSubcategoria(subcategorias, subcategoriaId),
      desde, hasta,
      filtroActivo: Boolean(estado || categoriaId || subcategoriaId || desde || hasta),
      totalTexto: textoCantidadDonaciones(lista.length),
      donaciones: lista
        .slice((pagina - 1) * donaciones.TAMANIO_PAGINA, pagina * donaciones.TAMANIO_PAGINA)
        .map((d) => ({ ...vistaDonacion(d), hrefDetalle: conParametros(`${PREFIJO}/${d.id}`, { ...conservar, volver: urlActual }) })),
      paginacion: vistaPaginacion({ pagina: pagina - 1, totalPaginas }, urlFiltros),
      
    });

  } catch (error) {

    const noDisponible = donaciones.esServicioNoDisponible(error);
    if (!error.mensajeUsuario) console.error("[donaciones-donante] Error inesperado:", error);

    return res.render("donante/donaciones/listado", {
      ...modelo,
      urlReintento: req.originalUrl,
      servicioNoDisponible: noDisponible,
      errorLista: noDisponible ? undefined : (error.mensajeUsuario ?? "No se pudieron cargar tus donaciones."),
    });

  }
});

router.get("/:id", async (req, res) => {
    
  const id = leerId(req.params.id);
  const { donanteId, conservar } = donanteActual(req);
  const volver = urlVolverSegura(req.query.volver, PREFIJO, conParametros(PREFIJO, conservar));
  if (!id || !donanteId) return noEncontrada(res);
  
  try {
    const donacion = await donaciones.obtenerDonacion(req, id);
    if (donacion?.donanteId !== donanteId) return noEncontrada(res);
    return res.render("donante/donaciones/detalle", {
      title: `Donación #${id}`, id, volver,
      donacion: vistaDonacion(donacion),
      pasos: pasosLinea(donacion.estado, { desdeDeposito: true }),
    });

  } catch (error) {

    if (error.status === 404) return noEncontrada(res);
    const noDisponible = donaciones.esServicioNoDisponible(error);
    return res.render("donante/donaciones/detalle", {
      title: `Donación #${id}`, id, volver, urlReintento: req.originalUrl,
      servicioNoDisponible: noDisponible,
      errorCarga: noDisponible ? undefined : (error.mensajeUsuario ?? "No se pudo cargar la donación."),
    });
  }
  
});

export default router;