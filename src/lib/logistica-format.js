const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/;
const SIN_DATO = "—";
const pad = (valor) => String(valor).padStart(2, "0");

const NUMERO_AR = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

// El backend manda fechas ISO-8601 sin zona horaria: se leen tal cual, como hora local.
function leerFecha(iso) {
  if (typeof iso !== "string") {
    return null;
  }
  const partes = ISO_LOCAL.exec(iso);
  if (!partes) {
    return null;
  }
  const [anio, mes, dia, hora, minuto, segundo] = partes.slice(1).map((parte) => Number(parte ?? 0));
  const fecha = new Date(anio, mes - 1, dia, hora, minuto, segundo);
  if (fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) {
    return null;
  }
  return fecha;
}

export function formatoNumero(valor) {
  return typeof valor === "number" && Number.isFinite(valor) ? NUMERO_AR.format(valor) : SIN_DATO;
}

export function fechaCorta(iso) {
  const fecha = leerFecha(iso);
  if (!fecha) {
    return SIN_DATO;
  }
  return `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
}

export function horaMinuto(iso) {
  const fecha = leerFecha(iso);
  return fecha ? `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}` : SIN_DATO;
}

export function fechaHora(iso) {
  return leerFecha(iso) ? `${fechaCorta(iso)} ${horaMinuto(iso)}` : SIN_DATO;
}

export function fechaRelativa(iso, ahora = Date.now()) {
  const fecha = leerFecha(iso);
  if (!fecha) {
    return "Sin datos";
  }
  const minutos = Math.floor((ahora - fecha.getTime()) / 60000);
  if (minutos < 1) {
    return "hace un momento";
  }
  if (minutos < 60) {
    return `hace ${minutos} min`;
  }
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    return `hace ${horas} h`;
  }
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}
