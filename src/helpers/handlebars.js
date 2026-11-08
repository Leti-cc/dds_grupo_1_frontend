const STATUS_LABELS = {
  EN_DEPOSITO: "En depósito",
  ASIGNACION_REALIZADA: "Asignada",
  LISTA_PARA_ENTREGAR: "Lista para entregar",
  PENDIENTE: "Pendiente",
  EN_TRASLADO: "En camino",
  ENTREGADA: "Entregada",
  NO_RECIBIDA: "No recibida",
  ENTREGA_FALLIDA: "Entrega fallida",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? String(status ?? "Sin estado").replaceAll("_", " ");
}

export const helpers = {
  statusLabel,
  eq: (left, right) => left === right,
  // Marca un <option> como seleccionado comparando como texto (ids numéricos vs. valores del body).
  selectedIf: (left, right) =>
    left !== undefined && left !== null && String(left) === String(right ?? "")
      ? "selected"
      : "",
};
