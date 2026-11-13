const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function leerFecha(valor) {

  const texto = String(Array.isArray(valor) ? valor[0] : (valor ?? "")).trim();
  return FECHA.test(texto) && !Number.isNaN(Date.parse(texto)) ? texto : null;

}

export function filtrarDonaciones(donaciones, { donanteId, categoriaId, subcategoriaId, desde, hasta }, subcategorias = []) {

  const deLaCategoria = categoriaId
    ? new Set(subcategorias.filter((s) => s.categoriaId === categoriaId).map((s) => s.id))
    : null;
  return donaciones.filter((d) => {
    
    if (d.donanteId !== donanteId) return false;
    if (subcategoriaId && d.subcategoriaId !== subcategoriaId) return false;
    if (deLaCategoria && !deLaCategoria.has(d.subcategoriaId)) return false;
    const dia = String(d.fechaIngreso ?? "").slice(0, 10);
    if (desde && dia < desde) return false;
    if (hasta && dia > hasta) return false;
    return true;
  });
  
}