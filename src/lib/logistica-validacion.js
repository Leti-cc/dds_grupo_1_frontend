// Formatos argentinos: viejo (ABC123) o Mercosur (AB123CD).
export const PATRON_PATENTE = /^[A-Z]{3}[0-9]{3}$|^[A-Z]{2}[0-9]{3}[A-Z]{2}$/;

const CAMPOS_NUMERICOS = [
  ["capacidadCarga", "la capacidad de carga"],
  ["capacidadVolumen", "el volumen"],
  ["altura", "la altura"],
];

const leer = (body, campo) => String(body?.[campo] ?? "").trim();

/**
 * Valida el formulario de camión del lado del servidor.
 * En la edición se pasa { patente }: sale de la URL y no se valida ni se toma del body.
 *
 * @returns {{ datos: object, errores: object, valores: object, valido: boolean }}
 *   datos es el body para la API; valores, lo cargado, para volver a mostrarlo.
 */
export function validarCamion(body, { patente } = {}) {
  const errores = {};
  const patenteFinal = patente ?? leer(body, "patente").toUpperCase();
  const valores = { patente: patenteFinal };
  const datos = { patente: patenteFinal };

  if (patente === undefined) {
    if (!patenteFinal) {
      errores.patente = "Ingresá la patente.";
    } else if (!PATRON_PATENTE.test(patenteFinal)) {
      errores.patente = "Usá el formato ABC123 o AB123CD, sin espacios ni guiones.";
    }
  }

  for (const [campo, etiqueta] of CAMPOS_NUMERICOS) {
    const texto = leer(body, campo);
    const numero = Number(texto);
    valores[campo] = texto;
    datos[campo] = numero;
    if (!texto) {
      errores[campo] = `Ingresá ${etiqueta}.`;
    } else if (!Number.isFinite(numero) || numero <= 0) {
      errores[campo] = `Ingresá ${etiqueta} con un número mayor que 0.`;
    }
  }

  return { datos, errores, valores, valido: Object.keys(errores).length === 0 };
}
