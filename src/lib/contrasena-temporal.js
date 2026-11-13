import { randomInt } from "node:crypto";

// Sin caracteres ambiguos (0/O, 1/l/I) para que se pueda leer y tipear desde el correo.
const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnopqrstuvwxyz";
const NUMEROS = "23456789";
const SIMBOLOS = "!@#$%*?-_";
const TODOS = MAYUSCULAS + MINUSCULAS + NUMEROS + SIMBOLOS;

export const LARGO_CONTRASENA_TEMPORAL = 12;

function elegir(caracteres) {
  return caracteres[randomInt(caracteres.length)];
}

/**
 * Contraseña temporal para la cuenta de un donante dado de alta por administración.
 * Garantiza al menos una mayúscula, una minúscula, un número y un símbolo (política habitual de Keycloak).
 * Se manda al backend, que crea la cuenta como "temporaria" y la envía por mail al donante.
 */
export function generarContrasenaTemporal(largo = LARGO_CONTRASENA_TEMPORAL) {
  const caracteres = [elegir(MAYUSCULAS), elegir(MINUSCULAS), elegir(NUMEROS), elegir(SIMBOLOS)];
  while (caracteres.length < largo) {
    caracteres.push(elegir(TODOS));
  }
  // Fisher-Yates para que las clases obligatorias no queden siempre al principio.
  for (let i = caracteres.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
}

/** Campos que se suman al alta del donante para que el backend cree la cuenta y mande las credenciales. */
export function credencialesIniciales() {
  return { contrasenaTemporal: generarContrasenaTemporal(), enviarCredencialesPorMail: true };
}
