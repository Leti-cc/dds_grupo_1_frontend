// Lectura y validación de lo que llega en la URL y en los formularios del flujo 3 (ingreso de donaciones).
// Son funciones puras: no tocan Express ni la red, así que se prueban solas (test/ingreso-validacion.test.js).
// Cada validador devuelve los valores ya normalizados, el cuerpo para el backend y un mapa de errores por campo.

import { leerId } from "./asignaciones-validacion.js";

export { leerId };

/* ---------- Catálogos (los mismos valores que los enums del backend) ---------- */

export const UNIDADES = Object.freeze([
  { valor: "UNIDAD", texto: "Unidad(es)" },
  { valor: "KILOGRAMO", texto: "Kilogramo(s)" },
  { valor: "GRAMO", texto: "Gramo(s)" },
  { valor: "LITRO", texto: "Litro(s)" },
]);

/** TipoPersonaJuridica del backend. */
export const TIPOS_JURIDICA = Object.freeze([
  { valor: "EMPRESA", texto: "Empresa" },
  { valor: "ONG", texto: "ONG" },
  { valor: "INSTITUCION", texto: "Institución" },
  { valor: "GUBERNAMENTAL", texto: "Gubernamental" },
]);

export const GENEROS = Object.freeze([
  { valor: "F", texto: "Femenino" },
  { valor: "M", texto: "Masculino" },
  { valor: "X", texto: "Otro / prefiere no decirlo" },
]);

/** estadoUso del backend: false = nuevo, true = usado. */
export const ESTADOS_USO = Object.freeze([
  { valor: "NUEVO", texto: "Nuevo" },
  { valor: "USADO", texto: "Usado" },
]);

export const LIMITES = Object.freeze({
  descripcionDonacion: 250,
  nombreBien: 100,
  descripcionBien: 250,
  fotoUrl: 500,
  nombrePersona: 60,
  direccion: 150,
  razonSocial: 100,
  rubro: 80,
  busqueda: 60,
  maxBienes: 50,
  maxCantidad: 1_000_000,
  maxIdsResultado: 30,
});

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const ENTERO_POSITIVO = /^[1-9]\d*$/;

const primero = (valor) => (Array.isArray(valor) ? valor[0] : valor);
const comoLista = (valor) => (valor === undefined ? [] : Array.isArray(valor) ? valor : [valor]);

/** Texto del body recortado y con espacios repetidos colapsados. */
export function texto(valor) {
  return String(primero(valor) ?? "").replace(/\s+/g, " ").trim();
}

/* ---------- Búsqueda de donantes ---------- */

/**
 * Texto de búsqueda de la URL. Sin texto no se busca (el backend devolvería TODOS los donantes,
 * que tras una importación CSV pueden ser 20.000). Con un solo carácter se pide escribir más.
 */
export function leerBusqueda(valor) {
  const buscado = texto(valor).slice(0, LIMITES.busqueda);
  if (!buscado) {
    return { texto: "", error: null };
  }
  if (buscado.length < 2) {
    return { texto: buscado, error: "Escribí al menos 2 caracteres para buscar." };
  }
  return { texto: buscado, error: null };
}

/* ---------- Alta de donante ---------- */

export const CAMPOS_DONANTE_HUMANA = Object.freeze(["nombre", "apellido", "dni", "edad", "genero", "direccion", "email"]);
export const CAMPOS_DONANTE_JURIDICA = Object.freeze(["razonSocial", "tipoPersonaJuridica", "cuit", "rubro", "email"]);

export function leerTipoDonante(valor) {
  return texto(valor) === "JURIDICA" ? "JURIDICA" : "HUMANA";
}

/** "30123456789" o "30-12345678-9" → "30-12345678-9". null si no tiene 11 dígitos. */
export function normalizarCuit(valor) {
  const digitos = String(valor ?? "").replace(/[\s.-]/g, "");
  return /^\d{11}$/.test(digitos) ? `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}` : null;
}

function normalizarDni(valor) {
  const digitos = String(valor ?? "").replace(/[\s.]/g, "");
  return /^\d{6,9}$/.test(digitos) ? digitos : null;
}

/**
 * Valida el alta de un donante. Devuelve:
 * - valores: lo escrito, para volver a mostrar el formulario si hay errores.
 * - errores: { campo: mensaje }, vacío si todo está bien.
 * - donante: el cuerpo para POST /api/donantes (solo si no hay errores).
 *
 * El backend solo guarda el correo como medio de contacto (CrearDonanteDTO.contactoPredeterminado).
 */
export function construirDonante(body = {}) {
  const tipo = leerTipoDonante(body.tipo);
  const valores = { tipo, email: texto(body.email) };
  const errores = {};

  if (!valores.email) errores.email = "Completá el correo electrónico.";
  else if (!EMAIL.test(valores.email)) errores.email = "El correo no es válido. Ejemplo: nombre@dominio.com.";

  const contactoPredeterminado = { medio: "MAIL", valor: valores.email };

  if (tipo === "HUMANA") {
    Object.assign(valores, {
      nombre: texto(body.nombre),
      apellido: texto(body.apellido),
      dni: texto(body.dni),
      edad: texto(body.edad),
      genero: texto(body.genero),
      direccion: texto(body.direccion),
    });
    if (!valores.nombre) errores.nombre = "Completá el nombre.";
    else if (valores.nombre.length > LIMITES.nombrePersona) errores.nombre = `Hasta ${LIMITES.nombrePersona} caracteres.`;
    if (!valores.apellido) errores.apellido = "Completá el apellido.";
    else if (valores.apellido.length > LIMITES.nombrePersona) errores.apellido = `Hasta ${LIMITES.nombrePersona} caracteres.`;

    const dni = normalizarDni(valores.dni);
    if (!valores.dni) errores.dni = "Completá el DNI.";
    else if (!dni) errores.dni = "El DNI debe tener entre 6 y 9 números, sin letras.";

    const edad = Number(valores.edad);
    if (!valores.edad) errores.edad = "Completá la edad.";
    else if (!Number.isInteger(edad) || edad < 1 || edad > 120) errores.edad = "La edad debe ser un número entre 1 y 120.";

    if (valores.genero && !GENEROS.some((genero) => genero.valor === valores.genero)) errores.genero = "Elegí una opción de la lista.";
    if (!valores.direccion) errores.direccion = "Completá la dirección.";
    else if (valores.direccion.length > LIMITES.direccion) errores.direccion = `Hasta ${LIMITES.direccion} caracteres.`;

    return {
      valores,
      errores,
      donante: Object.keys(errores).length
        ? null
        : {
            tipo: "HUMANA",
            tipoUsuario: "PERSONA",
            nombre: valores.nombre,
            apellido: valores.apellido,
            dni,
            edad,
            ...(valores.genero ? { genero: valores.genero } : {}),
            direccion: valores.direccion,
            contactoPredeterminado,
          },
    };
  }

  Object.assign(valores, {
    razonSocial: texto(body.razonSocial),
    tipoPersonaJuridica: texto(body.tipoPersonaJuridica) || "EMPRESA",
    cuit: texto(body.cuit),
    rubro: texto(body.rubro),
  });
  if (!valores.razonSocial) errores.razonSocial = "Completá la razón social.";
  else if (valores.razonSocial.length > LIMITES.razonSocial) errores.razonSocial = `Hasta ${LIMITES.razonSocial} caracteres.`;
  if (!TIPOS_JURIDICA.some((tipoJuridica) => tipoJuridica.valor === valores.tipoPersonaJuridica)) {
    errores.tipoPersonaJuridica = "Elegí un tipo de organización.";
  }
  const cuit = normalizarCuit(valores.cuit);
  if (!valores.cuit) errores.cuit = "Completá el CUIT.";
  else if (!cuit) errores.cuit = "El CUIT debe tener 11 números. Ejemplo: 30-12345678-9.";
  if (!valores.rubro) errores.rubro = "Completá el rubro.";
  else if (valores.rubro.length > LIMITES.rubro) errores.rubro = `Hasta ${LIMITES.rubro} caracteres.`;

  return {
    valores,
    errores,
    donante: Object.keys(errores).length
      ? null
      : {
          tipo: "JURIDICA",
          tipoUsuario: "ORGANIZACION",
          tipoPersonaJuridica: valores.tipoPersonaJuridica,
          razonSocial: valores.razonSocial,
          cuit,
          rubro: valores.rubro,
          contactoPredeterminado,
        },
  };
}

/* ---------- Donación con sus bienes ---------- */

/** Campos de cada fila de bien, tal como se llaman en el formulario (un nombre repetido por fila). */
const CAMPOS_FILA = Object.freeze({
  nombre: "itemNombre",
  descripcion: "itemDescripcion",
  foto: "itemFoto",
  subcategoriaId: "itemSubcategoriaId",
  cantidad: "itemCantidad",
  unidad: "itemUnidad",
  medida: "itemMedida",
  vencimiento: "itemVencimiento",
  estadoUso: "itemEstadoUso",
});

export const FILA_VACIA = Object.freeze({
  nombre: "",
  descripcion: "",
  foto: "",
  subcategoriaId: "",
  cantidad: "1",
  unidad: "UNIDAD",
  medida: "1",
  vencimiento: "",
  estadoUso: "",
});

/**
 * Filas del formulario. Cada campo llega como lista paralela (itemNombre, itemCantidad...):
 * todos los controles de una fila son siempre <input> o <select>, que se envían aunque estén
 * vacíos, así que el índice i de cada lista es la misma fila. Con una sola fila llega un texto, no una lista.
 */
export function leerFilas(body = {}) {
  const columnas = Object.fromEntries(
    Object.entries(CAMPOS_FILA).map(([campo, nombre]) => [campo, comoLista(body[nombre])]),
  );
  const cantidadDeFilas = Math.max(1, ...Object.values(columnas).map((lista) => lista.length));
  return Array.from({ length: cantidadDeFilas }, (_, indice) =>
    Object.fromEntries(
      Object.keys(CAMPOS_FILA).map((campo) => [campo, texto(columnas[campo][indice] ?? FILA_VACIA[campo])]),
    ),
  );
}

function hoyIso(hoy) {
  const pad = (valor) => String(valor).padStart(2, "0");
  return `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
}

/** true si es una fecha de calendario real con formato AAAA-MM-DD. */
export function esFechaValida(valor) {
  const partes = FECHA_ISO.exec(valor);
  if (!partes) {
    return false;
  }
  const [anio, mes, dia] = partes.slice(1).map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
}

function esUrlHttp(valor) {
  try {
    const url = new URL(valor);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function leerMedida(valor) {
  const numero = Number(String(valor).replace(",", "."));
  return Number.isFinite(numero) && numero > 0 && numero <= LIMITES.maxCantidad ? numero : null;
}

/**
 * Valida una fila contra la subcategoría elegida y arma el ItemBienDTO del backend.
 * Qué datos hacen falta lo decide la subcategoría (SubcategoriaDTO):
 * - requiereEstadoUso → hay que indicar si es nuevo o usado (el backend crea un BienEstado).
 * - perecedero → hay que indicar la fecha de vencimiento (BienMediblePerecedero).
 * - resto → unidad y medida (BienMedible).
 */
function validarFila(fila, subcategoriasPorId, hoy) {
  const errores = {};
  const subcategoria = subcategoriasPorId.get(Number(fila.subcategoriaId));

  if (!fila.nombre) errores.nombre = "Completá el nombre del bien.";
  else if (fila.nombre.length > LIMITES.nombreBien) errores.nombre = `Hasta ${LIMITES.nombreBien} caracteres.`;
  if (fila.descripcion.length > LIMITES.descripcionBien) errores.descripcion = `Hasta ${LIMITES.descripcionBien} caracteres.`;
  if (fila.foto && (fila.foto.length > LIMITES.fotoUrl || !esUrlHttp(fila.foto))) {
    errores.foto = "Pegá un enlace completo que empiece con http:// o https://.";
  }
  if (!fila.subcategoriaId) errores.subcategoriaId = "Elegí una subcategoría.";
  else if (!subcategoria) errores.subcategoriaId = "Esa subcategoría ya no existe. Elegí otra.";

  const cantidad = Number(fila.cantidad);
  if (!ENTERO_POSITIVO.test(fila.cantidad) || cantidad > LIMITES.maxCantidad) {
    errores.cantidad = "La cantidad debe ser un número entero mayor a 0.";
  }

  const item = {
    nombre: fila.nombre,
    descripcion: fila.descripcion || fila.nombre,
    ...(fila.foto ? { foto: fila.foto } : {}),
    subcategoriaId: Number(fila.subcategoriaId),
    cantidad,
  };

  if (subcategoria?.requiereEstadoUso) {
    if (!ESTADOS_USO.some((estado) => estado.valor === fila.estadoUso)) {
      errores.estadoUso = "Indicá si el bien es nuevo o usado.";
    } else {
      item.estadoUso = fila.estadoUso === "USADO";
    }
  } else if (subcategoria) {
    if (!UNIDADES.some((unidad) => unidad.valor === fila.unidad)) errores.unidad = "Elegí una unidad.";
    const medida = leerMedida(fila.medida);
    if (medida === null) errores.medida = "La medida debe ser un número mayor a 0.";
    item.unidad = fila.unidad;
    item.cantidadBien = medida;

    if (subcategoria.perecedero) {
      if (!fila.vencimiento) errores.vencimiento = "Indicá la fecha de vencimiento.";
      else if (!esFechaValida(fila.vencimiento)) errores.vencimiento = "La fecha no es válida.";
      else if (fila.vencimiento < hoyIso(hoy)) errores.vencimiento = "La fecha de vencimiento ya pasó.";
      else item.fechaVencimiento = fila.vencimiento;
    }
  }

  return { errores, item };
}

/**
 * Valida la donación completa. Devuelve:
 * - valores: { descripcion } y filas: una por bien con sus valores y sus errores (para volver a mostrar el formulario).
 * - errores: errores de la donación (descripción, cantidad de bienes).
 * - resumen: lista de todos los errores con el id del campo, para el resumen accesible del principio de la página.
 * - donacion: el cuerpo de POST /api/donaciones (solo si no hay errores).
 *
 * subcategoriasPorId: Map id → SubcategoriaDTO ({ id, nombre, perecedero, requiereEstadoUso }).
 */
export function construirDonacion(body = {}, donanteId, subcategoriasPorId = new Map(), hoy = new Date()) {
  const valores = { descripcion: texto(body.descripcion) };
  const errores = {};
  const resumen = [];

  if (!valores.descripcion) errores.descripcion = "Completá la descripción general.";
  else if (valores.descripcion.length > LIMITES.descripcionDonacion) {
    errores.descripcion = `La descripción admite hasta ${LIMITES.descripcionDonacion} caracteres.`;
  }
  if (errores.descripcion) {
    resumen.push({ campo: "descripcion", mensaje: errores.descripcion });
  }

  const filasLeidas = leerFilas(body);
  if (filasLeidas.length > LIMITES.maxBienes) {
    errores.items = `Una carga admite hasta ${LIMITES.maxBienes} bienes. Registrá el resto en otra carga.`;
    resumen.push({ campo: "agregar-bien", mensaje: errores.items });
  }

  const items = [];
  const filas = filasLeidas.slice(0, LIMITES.maxBienes).map((fila, indice) => {
    const { errores: erroresFila, item } = validarFila(fila, subcategoriasPorId, hoy);
    items.push(item);
    for (const [campo, mensaje] of Object.entries(erroresFila)) {
      resumen.push({ campo: `item-${indice + 1}-${campo}`, mensaje: `Bien ${indice + 1}: ${mensaje}` });
    }
    return { ...fila, errores: erroresFila };
  });

  const hayErrores = resumen.length > 0;
  return {
    valores,
    errores,
    filas,
    resumen,
    hayErrores,
    donacion: hayErrores ? null : { donanteId, descripcion: valores.descripcion, items },
  };
}

/* ---------- Resultado de la carga ---------- */

/** "12,13,14" → [12, 13, 14]: ids válidos, sin repetir y con un máximo. */
export function leerIds(valor) {
  const ids = String(primero(valor) ?? "")
    .split(",")
    .map((parte) => leerId(parte))
    .filter((id) => id !== null);
  return [...new Set(ids)].slice(0, LIMITES.maxIdsResultado);
}

/* ---------- Importación CSV ---------- */

/** Mensaje de error del archivo elegido, o null si se puede enviar. archivo: { name, size } (File). */
export function validarArchivoCsv(archivo, maxBytes = MAX_IMPORT_BYTES) {
  if (!archivo || typeof archivo === "string" || !archivo.size) {
    return "Elegí un archivo CSV para importar.";
  }
  if (!/\.csv$/i.test(archivo.name ?? "")) {
    return "El archivo tiene que ser un .csv.";
  }
  if (archivo.size > maxBytes) {
    return `El archivo supera el máximo de ${Math.round(maxBytes / (1024 * 1024))} MB.`;
  }
  return null;
}
