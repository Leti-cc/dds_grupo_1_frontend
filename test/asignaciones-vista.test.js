import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avisoVencimiento,
  conParametros,
  etiquetaLista,
  opcionesEstado,
  pasosLinea,
  resultadoDeError,
  TEXTO_RANKING_CAMBIO,
  TEXTO_YA_NO_EN_DEPOSITO,
  vistaDonacion,
  vistaEstado,
  vistaPaginacion,
  vistaPendiente,
  vistaRanking,
} from "../src/lib/asignaciones-vista.js";

const HOY = new Date(2026, 10, 8, 12, 0); // 08/11/2026

test("vistaEstado traduce los estados, incluido VENCIDA, y tolera uno desconocido", () => {
  assert.deepEqual(vistaEstado("VENCIDA"), { codigo: "VENCIDA", texto: "Vencida", clase: "tag-red" });
  assert.equal(vistaEstado("EN_TRASLADO").texto, "En camino");
  assert.equal(vistaEstado("EN_REVISION").texto, "En revision");
  assert.equal(vistaEstado("EN_REVISION").clase, "tag-neutral");
});

test("opcionesEstado marca la opción elegida y pone Todos primero", () => {
  const opciones = opcionesEstado(["ENTREGADA", "VENCIDA"], "VENCIDA");
  assert.deepEqual(opciones.map((opcion) => [opcion.valor, opcion.seleccionado]), [
    ["", false],
    ["ENTREGADA", false],
    ["VENCIDA", true],
  ]);
  assert.equal(opcionesEstado(["ENTREGADA"], "")[0].seleccionado, true);
});

test("etiquetaLista usa nombres humanos y no se rompe con un algoritmo nuevo (F10)", () => {
  assert.equal(etiquetaLista("COINCIDENCIAS"), "Sugeridas por ambos algoritmos");
  assert.equal(etiquetaLista("COMPATIBILIDAD_SEMANTICA"), "Compatibilidad con necesidades");
  assert.equal(etiquetaLista("PRIORIDAD_SUBATENDIDOS"), "Prioridad a entidades menos atendidas");
  assert.equal(etiquetaLista("CERCANIA_GEOGRAFICA"), "Cercania geografica");
});

test("conParametros agrega, reemplaza y saca parámetros", () => {
  assert.equal(conParametros("/admin/donaciones/pendientes?page=2", { donacion: 128 }), "/admin/donaciones/pendientes?page=2&donacion=128");
  assert.equal(conParametros("/x?page=2&donacion=5", { donacion: null, page: 3 }), "/x?page=3");
});

test("vistaPaginacion arma los links conservando los filtros y se oculta con una página", () => {
  const base = "/admin/donaciones/pendientes?subcategoriaId=3";
  assert.equal(vistaPaginacion({ pagina: 0, totalPaginas: 1 }, base), null);
  assert.deepEqual(vistaPaginacion({ pagina: 1, totalPaginas: 3 }, base), {
    texto: "Página 2 de 3",
    anterior: "/admin/donaciones/pendientes?subcategoriaId=3",
    siguiente: "/admin/donaciones/pendientes?subcategoriaId=3&page=3",
  });
  const ultima = vistaPaginacion({ pagina: 2, totalPaginas: 3 }, base);
  assert.equal(ultima.siguiente, null);
});

test("vistaPendiente arma el chip, la sugerencia y los links de la fila (F3)", () => {
  const fila = vistaPendiente(
    {
      donacionId: 128,
      descripcion: "Ropa de abrigo",
      cantidadTotal: 10,
      fechaIngreso: "2026-11-05T09:00:00",
      ranking: { estado: "CALCULADO", tieneCoincidencias: true, sugerenciaPrincipal: { entidadId: 4, entidadNombre: "Hogar Los Peques" } },
    },
    "/admin/donaciones/pendientes?page=2",
    128,
  );
  assert.deepEqual(fila.chip, { texto: "Coincide", clase: "tag-green" });
  assert.equal(fila.sugerencia, "Hogar Los Peques");
  assert.equal(fila.elegida, true);
  assert.equal(fila.fechaIngresoTexto, "05/11/2026");
  assert.equal(fila.hrefRanking, "/admin/donaciones/pendientes?page=2&donacion=128");
  assert.equal(fila.hrefVencer, "/admin/donaciones/pendientes?page=2&donacion=128&confirmar=vencer");
});

test("vistaPendiente distingue ranking pendiente y sin coincidencias", () => {
  const pendiente = vistaPendiente({ donacionId: 1, ranking: { estado: "PENDIENTE" } }, "/l");
  assert.equal(pendiente.rankingCalculado, false);
  assert.equal(pendiente.chip.texto, "Pendiente");
  const sin = vistaPendiente({ donacionId: 2, ranking: { estado: "CALCULADO", tieneCoincidencias: false } }, "/l");
  assert.equal(sin.chip.texto, "Sin coincidencia");
  assert.equal(sin.sugerencia, null);
});

test("vistaRanking con coincidencias arma una sola lista con sus diálogos", () => {
  const ranking = vistaRanking({
    donacionId: 128,
    descripcion: "Ropa de abrigo",
    ranking: {
      estado: "CALCULADO",
      tieneCoincidencias: true,
      fechaCalculo: "2026-11-08T03:02:00",
      listas: [{ tipo: "COINCIDENCIAS", entidades: [{ posicion: 1, entidadId: 4, entidadNombre: "Hogar Los Peques", direccion: "Av. Siempreviva 742" }] }],
    },
  });
  assert.equal(ranking.pendiente, false);
  assert.equal(ranking.fechaCalculoTexto, "08/11/2026 03:02");
  assert.equal(ranking.listas.length, 1);
  assert.equal(ranking.listas[0].titulo, "Sugeridas por ambos algoritmos");
  const [candidato] = ranking.listas[0].candidatos;
  assert.equal(candidato.dialogId, "asignar-0-4");
  assert.equal(candidato.confirmacion, "¿Asignar la donación #128 (Ropa de abrigo) a Hogar Los Peques?");
  assert.equal(ranking.sinCandidatos, false);
});

test("vistaRanking sin coincidencias da una lista por algoritmo y detecta listas vacías", () => {
  const ranking = vistaRanking({
    donacionId: 9,
    ranking: {
      estado: "CALCULADO",
      tieneCoincidencias: false,
      listas: [
        { tipo: "COMPATIBILIDAD_SEMANTICA", entidades: [] },
        { tipo: "PRIORIDAD_SUBATENDIDOS", entidades: [] },
      ],
    },
  });
  assert.deepEqual(ranking.listas.map((lista) => lista.titulo), [
    "Compatibilidad con necesidades",
    "Prioridad a entidades menos atendidas",
  ]);
  assert.equal(ranking.sinCandidatos, true);
});

test("vistaRanking pendiente no tiene listas", () => {
  const ranking = vistaRanking({ donacionId: 9, ranking: { estado: "PENDIENTE", listas: [] } });
  assert.equal(ranking.pendiente, true);
  assert.deepEqual(ranking.listas, []);
});

test("avisoVencimiento avisa si no hay fechas o ninguna venció", () => {
  assert.equal(avisoVencimiento([{ nombre: "Campera" }], HOY), "Ningún ítem tiene fecha de vencimiento cargada.");
  assert.equal(avisoVencimiento([{ fechaVencimiento: "2026-12-01" }], HOY), "Según la fecha cargada, todavía no venció.");
  assert.equal(avisoVencimiento([{ fechaVencimiento: "2026-11-08" }], HOY), "Según la fecha cargada, todavía no venció.");
  assert.equal(avisoVencimiento([{ fechaVencimiento: "2026-12-01" }, { fechaVencimiento: "2026-11-07" }], HOY), null);
  assert.equal(avisoVencimiento([], HOY), "Ningún ítem tiene fecha de vencimiento cargada.");
});

test("vistaDonacion formatea ítems, estado y vencimiento", () => {
  const donacion = vistaDonacion(
    {
      id: 117,
      descripcion: "Arroz",
      cantidadTotal: 25,
      estado: "EN_DEPOSITO",
      fechaIngreso: "2026-11-03T10:00:00",
      items: [{ nombre: "Arroz largo fino", cantidadBien: 25, unidad: "KILOGRAMO", fechaVencimiento: "2026-11-01" }],
    },
    HOY,
  );
  assert.equal(donacion.enDeposito, true);
  assert.equal(donacion.estado.texto, "En depósito");
  assert.deepEqual(donacion.items[0], {
    nombre: "Arroz largo fino",
    descripcion: undefined,
    cantidadTexto: "25 kg",
    vencimientoTexto: "01/11/2026",
    vencido: true,
  });
  assert.equal(donacion.avisoVencimiento, null);
  assert.equal(donacion.entidadNombre, null);
});

test("pasosLinea marca hechos los pasos anteriores al estado actual", () => {
  const pasos = pasosLinea("EN_TRASLADO");
  assert.deepEqual(pasos.map((paso) => [paso.texto, paso.situacion]), [
    ["Asignada", "hecho"],
    ["Lista para entregar", "hecho"],
    ["En camino", "actual"],
    ["Entregada", "pendiente"],
  ]);
});

test("pasosLinea muestra la rama de entrega fallida en rojo", () => {
  const pasos = pasosLinea("ENTREGA_FALLIDA");
  assert.deepEqual(pasos.map((paso) => paso.texto), ["Asignada", "Lista para entregar", "En camino", "Entrega fallida"]);
  assert.equal(pasos.at(-1).fallido, true);
  assert.equal(pasos.at(-1).situacion, "actual");
});

test("pasosLinea del admin arranca en depósito y tiene la rama de vencida", () => {
  assert.deepEqual(pasosLinea("EN_DEPOSITO", { desdeDeposito: true }).map((paso) => paso.situacion), [
    "actual",
    "pendiente",
    "pendiente",
    "pendiente",
    "pendiente",
  ]);
  const vencida = pasosLinea("VENCIDA", { desdeDeposito: true });
  assert.deepEqual(vencida.map((paso) => paso.texto), ["En depósito", "Vencida"]);
  assert.equal(vencida[1].fallido, true);
});

test("resultadoDeError decide el toast y el destino según el codigo del backend", () => {
  const destinos = { lista: "/lista", panel: "/lista?donacion=1" };
  const conCodigo = (codigo, status = 409) => ({ codigo, status, mensajeUsuario: `mensaje de ${codigo}` });

  assert.deepEqual(resultadoDeError(conCodigo("CONFLICTO_CONCURRENCIA"), destinos), { toast: "mensaje de CONFLICTO_CONCURRENCIA", destino: "/lista" });
  assert.deepEqual(resultadoDeError(conCodigo("TRANSICION_INVALIDA"), destinos), { toast: "mensaje de TRANSICION_INVALIDA", destino: "/lista" });
  assert.deepEqual(resultadoDeError(conCodigo("RANKING_NO_CALCULADO"), destinos), { toast: "mensaje de RANKING_NO_CALCULADO", destino: "/lista?donacion=1" });
  assert.deepEqual(resultadoDeError(conCodigo("SOLICITUD_INVALIDA", 400), destinos), { toast: "mensaje de SOLICITUD_INVALIDA", destino: "/lista?donacion=1" });
  assert.deepEqual(resultadoDeError(conCodigo("ENTIDAD_FUERA_DEL_RANKING", 422), destinos), { toast: TEXTO_RANKING_CAMBIO, destino: "/lista?donacion=1" });
  assert.deepEqual(resultadoDeError(conCodigo("DONACION_NO_ENCONTRADA", 404), destinos), { toast: TEXTO_YA_NO_EN_DEPOSITO, destino: "/lista" });
  assert.deepEqual(resultadoDeError({ status: 404, mensajeUsuario: "x" }, destinos), { toast: TEXTO_YA_NO_EN_DEPOSITO, destino: "/lista" });
  assert.deepEqual(resultadoDeError({ status: 0, mensajeUsuario: "No disponible" }, destinos), { toast: "No disponible", destino: "/lista?donacion=1" });
  assert.equal(resultadoDeError(new TypeError("x"), destinos).toast, "No se pudo completar la acción.");
});
