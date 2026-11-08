/**
 * Ciclo de polling: nunca superpone dos consultas, se pausa mientras la pestaña está oculta
 * y sigue adelante aunque una consulta falle. Timers inyectables para poder testearlo.
 */
export function crearPoller({
  tarea,
  intervaloMs,
  estaVisible,
  programar = (funcion, ms) => setTimeout(funcion, ms),
  cancelar = (timer) => clearTimeout(timer),
}) {
  let timer = null;
  let enCurso = false;
  let repetir = false;

  function limpiarTimer() {
    if (timer !== null) {
      cancelar(timer);
      timer = null;
    }
  }

  async function consultar() {
    limpiarTimer();
    if (enCurso) {
      repetir = true;
      return;
    }

    enCurso = true;
    try {
      await tarea();
    } catch (error) {
      console.error("[mapa] Falló la actualización:", error);
    } finally {
      enCurso = false;
    }

    if (repetir) {
      repetir = false;
      await consultar();
      return;
    }
    if (estaVisible()) {
      timer = programar(consultar, intervaloMs);
    }
  }

  return {
    consultarAhora: consultar,
    iniciar() {
      if (estaVisible()) {
        return consultar();
      }
      return undefined;
    },
    visibilidadCambio() {
      if (estaVisible()) {
        return consultar();
      }
      limpiarTimer();
      return undefined;
    },
  };
}
