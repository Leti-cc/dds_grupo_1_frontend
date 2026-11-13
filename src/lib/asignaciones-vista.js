// Adaptadores puros del flujo 5: convierten los DTOs del backend en lo que muestran las vistas.
// Las vistas no calculan nada; todo se puede testear sin Express.

import { fechaCorta, fechaHora, formatoNumero } from "./logistica-format.js";

const SIN_DATO = "—";

/* ---------- Estados de la donación ---------- */

const ESTADOS = Object.freeze({
  EN_DEPOSITO: { texto: "En depósito", clase: "tag-neutral" },
  ASIGNACION_REALIZADA: { texto: "Asignada", clase: "tag-blue" },
  LISTA_PARA_ENTREGAR: { texto: "Lista para entregar", clase: "tag-blue" },
  EN_TRASLADO: { texto: "En camino", clase: "tag-violet" },
  ENTREGADA: { texto: "Entregada", clase: "tag-green" },
  ENTREGA_FALLIDA: { texto: "Entrega fallida", clase: "tag-red" },
  VENCIDA: { texto: "Vencida", clase: "tag-red" },
});

/** "NOMBRE_DEL_ALGORITMO" → "Nombre del algoritmo". */
export function humanizar(codigo) {
  const texto = String(codigo ?? "").replaceAll("_", " ").trim().toLowerCase();
  return texto ? texto[0].toUpperCase() + texto.slice(1) : SIN_DATO;
}

export function vistaEstado(estado) {
  const conocido = ESTADOS[estado];
  return {
    codigo: estado ?? null,
    texto: conocido?.texto ?? humanizar(estado ?? "Sin estado"),
    clase: conocido?.clase ?? "tag-neutral",
  };
}

/** Opciones de un <select> de estado, con "Todos" primero. */
export function opcionesEstado(permitidos, seleccionado, textoTodos = "Todos") {
  return [
    { valor: "", texto: textoTodos, seleccionado: !seleccionado },
    ...permitidos.map((estado) => ({
      valor: estado,
      texto: vistaEstado(estado).texto,
      seleccionado: estado === seleccionado,
    })),
  ];
}

/** Opciones del <select> de subcategoría, con "Todas" primero. */
export function opcionesSubcategoria(subcategorias, seleccionada) {
  return [
    { valor: "", texto: "Todas", seleccionado: seleccionada == null },
    ...subcategorias.map((subcategoria) => ({
      valor: subcategoria.id,
      texto: subcategoria.nombre,
      seleccionado: subcategoria.id === seleccionada,
    })),
  ];
}

/* ---------- URLs ---------- */

/** Agrega, cambia o saca (con null, undefined o "") parámetros de una ruta interna. */
export function conParametros(url, parametros) {
  const base = "http://bff.local";
  const resultado = new URL(url, base);
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor === undefined || valor === null || valor === "") {
      resultado.searchParams.delete(clave);
    } else {
      resultado.searchParams.set(clave, String(valor));
    }
  }
  return `${resultado.pathname}${resultado.search}`;
}

/**
 * Paginado del partial paginacion.hbs. pagina viene del backend (desde 0);
 * el usuario ve las páginas desde 1. Con una sola página no se muestra.
 */
export function vistaPaginacion({ pagina = 0, totalPaginas = 0 } = {}, urlBase) {
  if (!(totalPaginas > 1)) {
    return null;
  }
  const actual = pagina + 1;
  const enlace = (numero) => conParametros(urlBase, { page: numero > 1 ? numero : null });
  return {
    texto: `Página ${actual} de ${totalPaginas}`,
    anterior: actual > 1 ? enlace(actual - 1) : null,
    siguiente: actual < totalPaginas ? enlace(actual + 1) : null,
  };
}

/* ---------- Donación ---------- */

const UNIDADES = Object.freeze({ GRAMO: "g", KILOGRAMO: "kg", LITRO: "l" });

function hoyIso(hoy) {
  const pad = (valor) => String(valor).padStart(2, "0");
  return `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
}

/** Venció si la fecha de vencimiento ya pasó (el mismo día todavía no venció). */
function vencido(fechaVencimiento, hoy) {
  return typeof fechaVencimiento === "string" && fechaVencimiento.slice(0, 10) < hoyIso(hoy);
}

function vistaItem(item, hoy) {
  const unidad = UNIDADES[item.unidad];
  return {
    nombre: item.nombre ?? "Bien sin nombre",
    descripcion: item.descripcion,
    cantidadTexto:
      typeof item.cantidadBien === "number" ? `${formatoNumero(item.cantidadBien)}${unidad ? ` ${unidad}` : ""}` : null,
    vencimientoTexto: item.fechaVencimiento ? fechaCorta(item.fechaVencimiento) : SIN_DATO,
    vencido: vencido(item.fechaVencimiento, hoy),
  };
}

/**
 * Aviso del diálogo "Marcar vencida": la fecha cargada no justifica marcarla.
 * null si al menos un ítem ya venció.
 */
export function avisoVencimiento(items = [], hoy = new Date()) {
  const fechas = items.map((item) => item.fechaVencimiento).filter((fecha) => typeof fecha === "string");
  if (fechas.some((fecha) => vencido(fecha, hoy))) {
    return null;
  }
  return fechas.length === 0
    ? "Ningún ítem tiene fecha de vencimiento cargada."
    : "Según la fecha cargada, todavía no venció.";
}

export function vistaDonacion(donacion, hoy = new Date()) {
  const items = donacion.items ?? [];
  return {
    id: donacion.id,
    descripcion: donacion.descripcion || `Donación #${donacion.id}`,
    subcategoriaNombre: donacion.subcategoriaNombre ?? SIN_DATO,
    cantidadTexto: formatoNumero(donacion.cantidadTotal),
    donanteNombre: donacion.donanteNombre ?? SIN_DATO,
    entidadNombre: donacion.entidadNombre ?? null,
    fechaIngresoTexto: fechaCorta(donacion.fechaIngreso),
    estado: vistaEstado(donacion.estado),
    enDeposito: donacion.estado === "EN_DEPOSITO",
    enTraslado: donacion.estado === "EN_TRASLADO",
    fotos: String(donacion.fotoEntrega ?? "").split("|").map((url) => url.trim()).filter(Boolean),
    items: items.map((item) => vistaItem(item, hoy)),
    fotoEntrega: donacion.fotoEntrega || null,
    avisoVencimiento: avisoVencimiento(items, hoy),
  };
}

/* ---------- Cola de pendientes y ranking ---------- */

export const AYUDA_PENDIENTE =
  "Entró después del último cálculo. Va a tener ranking después del cálculo de esta noche.";

function chipRanking(ranking) {
  if (ranking?.estado !== "CALCULADO") {
    return { texto: "Pendiente", clase: "tag-neutral" };
  }
  return ranking.tieneCoincidencias
    ? { texto: "Coincide", clase: "tag-green" }
    : { texto: "Sin coincidencia", clase: "tag-violet" };
}

/**
 * Fila de la cola. urlLista es la URL de la página actual de la lista (con filtros, sin panel):
 * de ahí salen "Ver ranking" y "Marcar vencida" (F3).
 */
export function vistaPendiente(pendiente, urlLista, donacionElegida = null) {
  const calculado = pendiente.ranking?.estado === "CALCULADO";
  const id = pendiente.donacionId;
  return {
    id,
    descripcion: pendiente.descripcion || `Donación #${id}`,
    subcategoriaNombre: pendiente.subcategoriaNombre ?? SIN_DATO,
    cantidadTexto: formatoNumero(pendiente.cantidadTotal),
    fechaIngresoTexto: fechaCorta(pendiente.fechaIngreso),
    donanteNombre: pendiente.donanteNombre ?? SIN_DATO,
    rankingCalculado: calculado,
    ayudaPendiente: calculado ? null : AYUDA_PENDIENTE,
    chip: chipRanking(pendiente.ranking),
    sugerencia: pendiente.ranking?.sugerenciaPrincipal?.entidadNombre ?? null,
    elegida: id === donacionElegida,
    hrefRanking: conParametros(urlLista, { donacion: id }),
    hrefVencer: conParametros(urlLista, { donacion: id, confirmar: "vencer" }),
  };
}

const ETIQUETAS_LISTA = Object.freeze({
  COINCIDENCIAS: "Sugeridas por ambos algoritmos",
  COMPATIBILIDAD_SEMANTICA: "Compatibilidad con necesidades",
  PRIORIDAD_SUBATENDIDOS: "Prioridad a entidades menos atendidas",
});

/** Título en lenguaje humano de cada lista del ranking (F10): un algoritmo nuevo no rompe la vista. */
export function etiquetaLista(tipo) {
  return ETIQUETAS_LISTA[tipo] ?? humanizar(tipo);
}

/**
 * Listas del panel a partir del RankingDonacionDTO. Cada candidato trae el id y el texto de su
 * diálogo de confirmación, para que la vista no tenga que combinar datos de distintos niveles.
 */
export function vistaRanking(rankingDTO) {
  const ranking = rankingDTO?.ranking;
  const id = rankingDTO?.donacionId;
  const descripcion = rankingDTO?.descripcion || `Donación #${id}`;
  if (ranking?.estado !== "CALCULADO") {
    return { pendiente: true, listas: [], ayuda: AYUDA_PENDIENTE };
  }

  const listas = (ranking.listas ?? []).map((lista, indice) => ({
    titulo: etiquetaLista(lista.tipo),
    idTitulo: `lista-${indice}`,
    candidatos: (lista.entidades ?? []).map((candidato) => ({
      posicion: candidato.posicion,
      entidadId: candidato.entidadId,
      entidadNombre: candidato.entidadNombre ?? `Entidad #${candidato.entidadId}`,
      direccion: candidato.direccion || "Dirección no informada",
      dialogId: `asignar-${indice}-${candidato.entidadId}`,
      confirmacion: `¿Asignar la donación #${id} (${descripcion}) a ${candidato.entidadNombre ?? `la entidad #${candidato.entidadId}`}?`,
    })),
  }));

  return {
    pendiente: false,
    tieneCoincidencias: Boolean(ranking.tieneCoincidencias),
    fechaCalculoTexto: fechaHora(ranking.fechaCalculo),
    listas,
    sinCandidatos: listas.every((lista) => lista.candidatos.length === 0),
  };
}

/* ---------- Línea de tiempo ---------- */

const RECORRIDO = ["ASIGNACION_REALIZADA", "LISTA_PARA_ENTREGAR", "EN_TRASLADO", "ENTREGADA"];
const DESCRIPCION_PASO = Object.freeze({ hecho: "completado", actual: "estado actual", pendiente: "pendiente" });

function paso(estado, situacion, fallido = false) {
  return { texto: vistaEstado(estado).texto, situacion, fallido, descripcion: DESCRIPCION_PASO[situacion] };
}

/**
 * Pasos de la línea de tiempo según el estado actual. DonacionDTO no trae historial,
 * así que los pasos anteriores al actual se marcan como hechos, sin fechas.
 * desdeDeposito: el admin ve también "En depósito" (y la rama "Vencida"); la entidad no.
 */
export function pasosLinea(estado, { desdeDeposito = false } = {}) {
  const recorrido = desdeDeposito ? ["EN_DEPOSITO", ...RECORRIDO] : RECORRIDO;

  if (estado === "VENCIDA") {
    return [
      ...(desdeDeposito ? [paso("EN_DEPOSITO", "hecho")] : []),
      paso("VENCIDA", "actual", true),
    ];
  }

  if (estado === "ENTREGA_FALLIDA") {
    const hastaTraslado = recorrido.slice(0, recorrido.indexOf("EN_TRASLADO") + 1);
    return [...hastaTraslado.map((item) => paso(item, "hecho")), paso("ENTREGA_FALLIDA", "actual", true)];
  }

  const actual = recorrido.indexOf(estado);
  return recorrido.map((item, indice) => {
    if (actual === -1 || indice > actual) {
      return paso(item, "pendiente");
    }
    return paso(item, indice === actual ? "actual" : "hecho");
  });
}

/* ---------- Errores de asignar y vencer ---------- */

export const TEXTO_RANKING_CAMBIO = "El ranking cambió desde que abriste la página. Revisalo de nuevo.";
export const TEXTO_YA_NO_EN_DEPOSITO = "La donación ya no está en depósito.";

/**
 * Qué toast mostrar y adónde redirigir según el codigo del ErrorDTO (sección 3 del plan).
 * lista: la página de la cola sin panel; panel: la misma página con el panel de la donación.
 * Sin conexión, el panel se vuelve a pedir y muestra el aviso de servicio no disponible.
 */
export function resultadoDeError(error, { lista, panel }) {
  switch (error?.codigo) {
    case "TRANSICION_INVALIDA":
    case "CONFLICTO_CONCURRENCIA":
      return { toast: error.mensajeUsuario, destino: lista };
    case "RANKING_NO_CALCULADO":
    case "SOLICITUD_INVALIDA":
      return { toast: error.mensajeUsuario, destino: panel };
    case "ENTIDAD_FUERA_DEL_RANKING":
      return { toast: TEXTO_RANKING_CAMBIO, destino: panel };
    case "DONACION_NO_ENCONTRADA":
      return { toast: TEXTO_YA_NO_EN_DEPOSITO, destino: lista };
    default:
      break;
  }
  if (error?.status === 404) {
    return { toast: TEXTO_YA_NO_EN_DEPOSITO, destino: lista };
  }
  return { toast: error?.mensajeUsuario ?? "No se pudo completar la acción.", destino: panel };
}

/* ---------- Textos ---------- */

export function textoCantidadDonaciones(cantidad) {
  return cantidad === 1 ? "1 donación" : `${formatoNumero(cantidad)} donaciones`;
}
