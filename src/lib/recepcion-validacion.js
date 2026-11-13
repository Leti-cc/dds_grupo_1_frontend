export const MAX_FOTOS = 3;
export const MAX_BYTES_FOTO = 5 * 1024 * 1024;
export const MAX_MOTIVO = 250;
export const TIPOS_FOTO = Object.freeze({"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"});

export function validarFotos(archivos = []) {

    const fotos = archivos.filter((f) => typeof f != "string" && f.size > 0);

    if(fotos.length === 0) return {error: "Subir al menos una foto de la donación recibida."};
    if(fotos.length > MAX_FOTOS) return {error: `Podes subir hasta ${MAX_FOTOS} fotos.`};

    for(const foto of fotos) {

        if(!TIPOS_FOTO[foto.type]) return {error: "Las fotos tienen que ser JPG, PNG o WebP."};
        if(foto.size > MAX_BYTES_FOTO) return {error: "Cada foto puede pasar hasta 5 MB."};
    }

    return {fotos};
}

export function validarMotivo(valor) {

    const motivo = String(valor ?? "").trim();

    if(!motivo) return {error: "Contanos por qué no la recibiste."};
    if(motivo.length > MAX_MOTIVO) return {error: `El motivo puede tener hasta ${MAX_MOTIVO} caracteres.`};
    
    return {motivo};
}