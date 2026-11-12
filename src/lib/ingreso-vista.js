// Adaptadores puros del flujo 3: convierten los DTOs del backend y lo escrito en los formularios
// en lo que muestran las vistas. Las plantillas no calculan nada; todo se prueba sin Express.

import { fechaCorta, formatoNumero } from "./logistica-format.js";
import { conParametros, vistaEstado } from "./asignaciones-vista.js";
import { ESTADOS_USO, FILA_VACIA, GENEROS, TIPOS_JURIDICA, UNIDADES } from "./ingreso-validacion.js";

export { conParametros };

const SIN_DATO = "—";

export const URL_BASE = "/admin/donaciones/nueva";
export const URL_BUSCAR = URL_BASE;
export const URL_NUEVO_DONANTE = `${URL_BASE}/donante`;
export const URL_RESULTADO = `${URL_BASE}/resultado`;
export const URL_IMPORTAR = "/admin/donaciones/importar";

export const urlCargarDonacion = (donanteId) => `${URL_BASE}/${donanteId}`;

/** "1 bien" / "3 bienes". */
export function plural(cantidad, singular, pluralTexto) {
  return `${formatoNumero(cantidad)} ${cantidad === 1 ? singular : pluralTexto}`;
}

/* ---------- Pasos de la carga ---------- */

const NOMBRES_PASOS = Object.freeze(["Donante", "Bienes", "Resultado"]);

/**
 * Indicador de progreso "Paso 1 de 3". actual va de 1 a 3. Los pasos ya hechos son links
 * (hrefs[numero]) para poder volver; el resultado nunca es un link hacia atrás.
 */
export function pasosIngreso(actual, hrefs = {}) {
  return NOMBRES_PASOS.map((texto, indice) => {
    const numero = indice + 1;
    const estado = numero < actual ? "hecho" : numero === actual ? "actual" : "pendiente";
    return { numero, texto, estado, actual: estado === "actual", hecho: estado === "hecho", href: estado === "hecho" ? (hrefs[numero] ?? null) : null };
  });
}

/* ---------- Opciones de <select> ---------- */

function opciones(catalogo, seleccionado) {
  return catalogo.map((opcion) => ({ ...opcion, seleccionado: opcion.valor === seleccionado }));
}

export const opcionesUnidad = (seleccionada) => opciones(UNIDADES, seleccionada);
export const opcionesTipoJuridica = (seleccionado) => opciones(TIPOS_JURIDICA, seleccionado);
export const opcionesEstadoUso = (seleccionado) => [
  { valor: "", texto: "Elegí una opción", seleccionado: !seleccionado },
  ...opciones(ESTADOS_USO, seleccionado),
];
export const opcionesGenero = (seleccionado) => [
  { valor: "", texto: "Sin especificar", seleccionado: !seleccionado },
  ...opciones(GENEROS, seleccionado),
];

/**
 * Subcategorías agrupadas por categoría, para <optgroup>. Cada opción lleva sus dos banderas
 * (perecedero y requiereEstadoUso) como data-attributes: con ellas donacion.js muestra u oculta
 * el vencimiento y el estado de uso apenas se elige la subcategoría.
 */
export function gruposSubcategoria(subcategorias, seleccionada = "") {
  const grupos = new Map();
  for (const subcategoria of subcategorias) {
    const categoria = subcategoria.categoriaNombre ?? "Sin categoría";
    if (!grupos.has(categoria)) {
      grupos.set(categoria, []);
    }
    grupos.get(categoria).push({
      valor: subcategoria.id,
      texto: subcategoria.nombre,
      perecedero: Boolean(subcategoria.perecedero),
      requiereEstadoUso: Boolean(subcategoria.requiereEstadoUso),
      seleccionado: String(subcategoria.id) === String(seleccionada),
    });
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "es"))
    .map(([categoria, lista]) => ({
      categoria,
      opciones: lista.sort((a, b) => a.texto.localeCompare(b.texto, "es")),
    }));
}

export function mapaDeSubcategorias(subcategorias) {
  return new Map(subcategorias.map((subcategoria) => [Number(subcategoria.id), subcategoria]));
}

/**
 * Resumen de errores del principio de un formulario: lista { campo, mensaje } en el orden de los campos,
 * para que cada ítem enlace a su campo (id = campo).
 */
export function resumenErrores(errores, ordenDeCampos) {
  return ordenDeCampos.filter((campo) => errores[campo]).map((campo) => ({ campo, mensaje: errores[campo] }));
}

/* ---------- Donantes ---------- */

function emailDe(donante) {
  return donante.contactos?.find((contacto) => String(contacto.medio).toUpperCase() === "MAIL")?.valor ?? null;
}

export function vistaDonante(donante) {
  const juridica = donante.tipo === "JURIDICA";
  const tipoJuridica = TIPOS_JURIDICA.find((tipo) => tipo.valor === donante.tipoPersonaJuridica)?.texto;
  const nombre = juridica
    ? donante.razonSocial || "Organización sin nombre"
    : [donante.nombre, donante.apellido].filter(Boolean).join(" ") || "Persona sin nombre";
  const detalle = juridica
    ? [donante.rubro, tipoJuridica].filter(Boolean).join(" · ")
    : [typeof donante.edad === "number" ? `${donante.edad} años` : null, donante.direccion].filter(Boolean).join(" · ");
  return {
    id: donante.id,
    nombre,
    juridica,
    tipoTexto: juridica ? "Persona jurídica" : "Persona humana",
    tipoClase: juridica ? "tag-violet" : "tag-blue",
    documentoEtiqueta: juridica ? "CUIT" : "DNI",
    documento: (juridica ? donante.cuit : donante.dni) || SIN_DATO,
    email: emailDe(donante) ?? SIN_DATO,
    detalle: detalle || null,
    inicial: nombre.trim().charAt(0).toUpperCase() || "?",
    hrefElegir: urlCargarDonacion(donante.id),
  };
}

/* ---------- Filas de bienes del formulario ---------- */

/**
 * Una fila lista para la plantilla: valores escritos, errores, listas de opciones ya marcadas y qué
 * campos corresponden según la subcategoría elegida. Sin subcategoría se muestran los campos de
 * medida (los más comunes); el JS los ajusta apenas se elige una.
 */
export function vistaFila(fila, indice, subcategorias, subcategoriasPorId) {
  const valores = { ...FILA_VACIA, ...fila };
  const subcategoria = subcategoriasPorId.get(Number(valores.subcategoriaId));
  const requiereEstadoUso = Boolean(subcategoria?.requiereEstadoUso);
  const perecedero = Boolean(subcategoria?.perecedero) && !requiereEstadoUso;
  const n = indice + 1;
  return {
    n,
    // Ids de los campos, que además son el destino de los links del resumen de errores.
    ids: Object.fromEntries(
      ["nombre", "subcategoriaId", "cantidad", "medida", "unidad", "estadoUso", "vencimiento", "descripcion", "foto"].map((campo) => [campo, `item-${n}-${campo}`]),
    ),
    ...valores,
    errores: fila.errores ?? {},
    extraAbierto: Boolean(valores.descripcion || valores.foto || fila.errores?.descripcion || fila.errores?.foto),
    hayErrores: Object.keys(fila.errores ?? {}).length > 0,
    grupos: gruposSubcategoria(subcategorias, valores.subcategoriaId),
    unidades: opcionesUnidad(valores.unidad),
    estadosUso: opcionesEstadoUso(valores.estadoUso),
    muestraEstadoUso: requiereEstadoUso,
    muestraMedida: !requiereEstadoUso,
    muestraVencimiento: perecedero,
  };
}

export function vistaFilas(filas, subcategorias) {
  const porId = mapaDeSubcategorias(subcategorias);
  const lista = filas.length ? filas : [{}];
  return lista.map((fila, indice) => vistaFila(fila, indice, subcategorias, porId));
}

/** Fila en blanco para el <template> que clona donacion.js al tocar "Agregar otro bien". */
export function filaPlantilla(subcategorias) {
  return vistaFila({}, 0, subcategorias, mapaDeSubcategorias(subcategorias));
}

/* ---------- Resultado de la carga (segmentación) ---------- */

const UNIDADES_CORTAS = Object.freeze({ GRAMO: "g", KILOGRAMO: "kg", LITRO: "l", UNIDAD: "u." });

/** Un bien de la donación resultante: nombre y la característica que lo distingue. */
export function vistaBien(bien) {
  const detalles = [];
  if (typeof bien.estadoUso === "boolean") {
    detalles.push(bien.estadoUso ? "Usado" : "Nuevo");
  }
  if (typeof bien.cantidadBien === "number") {
    detalles.push(`${formatoNumero(bien.cantidadBien)} ${UNIDADES_CORTAS[bien.unidad] ?? ""}`.trim() + " c/u");
  }
  return {
    nombre: bien.nombre ?? "Bien sin nombre",
    detalle: detalles.join(" · ") || null,
    vencimientoTexto: bien.fechaVencimiento ? fechaCorta(bien.fechaVencimiento) : null,
  };
}

/** Una de las donaciones que generó la segmentación. */
export function vistaDonacionCreada(donacion, urlVolver) {
  const items = donacion.items ?? [];
  return {
    id: donacion.id,
    subcategoriaNombre: donacion.subcategoriaNombre ?? SIN_DATO,
    descripcion: donacion.descripcion || `Donación #${donacion.id}`,
    cantidadTexto: plural(donacion.cantidadTotal ?? 0, "unidad", "unidades"),
    bienesTexto: plural(items.length, "bien", "bienes"),
    items: items.map(vistaBien),
    estado: vistaEstado(donacion.estado),
    fechaIngresoTexto: fechaCorta(donacion.fechaIngreso),
    hrefDetalle: conParametros(`/admin/donaciones/${donacion.id}`, { volver: urlVolver }),
  };
}

/** Resumen del resultado: cuántas donaciones salieron de la carga y de qué donante. */
export function vistaSegmentacion(donaciones, urlVolver) {
  const lista = donaciones.map((donacion) => vistaDonacionCreada(donacion, urlVolver));
  const totalBienes = lista.reduce((suma, donacion) => suma + donacion.items.length, 0);
  return {
    donaciones: lista,
    total: lista.length,
    titulo: lista.length === 1 ? "Se registró 1 donación" : `Se registraron ${lista.length} donaciones`,
    explicacion: `${plural(totalBienes, "bien", "bienes")} agrupados por subcategoría. Cada grupo es una donación independiente que se asigna por separado a una entidad.`,
    donanteNombre: donaciones[0]?.donanteNombre ?? null,
    donanteId: donaciones[0]?.donanteId ?? null,
  };
}

/* ---------- Importación CSV ---------- */

export const MAX_ERRORES_VISIBLES = 50;

/**
 * Resultado de la importación (ImportacionCsvResultadoDTO) listo para mostrar. Se guarda en la sesión
 * como mensaje flash, así que solo conserva los primeros errores: un archivo de 20.000 filas con
 * todas mal no puede llenar la sesión.
 */
export function vistaResultadoImportacion(resultado, maxErrores = MAX_ERRORES_VISIBLES) {
  const errores = Array.isArray(resultado?.errores) ? resultado.errores : [];
  const creados = resultado?.creados ?? 0;
  const actualizados = resultado?.actualizados ?? 0;
  const procesados = resultado?.totalProcesados ?? creados + actualizados + errores.length;
  const estado = errores.length === 0 ? "success" : creados + actualizados > 0 ? "info" : "error";
  return {
    estado,
    titulo:
      estado === "success"
        ? "La importación terminó sin errores"
        : estado === "info"
          ? "La importación terminó con algunas filas rechazadas"
          : "No se pudo importar ninguna fila",
    procesados: formatoNumero(procesados),
    creados: formatoNumero(creados),
    actualizados: formatoNumero(actualizados),
    cantidadErrores: formatoNumero(errores.length),
    hayErrores: errores.length > 0,
    errores: errores.slice(0, maxErrores).map((error) => ({
      linea: error.linea > 0 ? formatoNumero(error.linea) : "Archivo",
      motivo: error.motivo ?? "Motivo no informado",
    })),
    erroresOmitidos: Math.max(errores.length - maxErrores, 0),
  };
}

/** Texto de ayuda del tamaño del archivo elegido (también lo usa importar.js en el navegador). */
export function formatoTamanio(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
