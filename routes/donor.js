import { Router } from "express";
import { ROLE_ALIASES, userHasRole } from "../middleware/auth.js";
import { loadSection, readArray } from "../src/lib/page-data.js";
import { authService } from "../src/services/auth-service.js";
import { donatrackService } from "../src/services/donatrack-service.js";

const router = Router();

async function loadDonorPage(req) {
  const session = authService.getSession(req);
  const user = session?.user;
  // Incentivos identifica al donante por el nombre que arma Donaciones (se resuelve en el callback de login),
  // no por el usuario de Keycloak (que es el email).
  const username = user?.incentivosUsuario ?? user?.nombreUsuario;
  if (!user || !userHasRole(user, ROLE_ALIASES.DONANTE)) {
    return {
      userName: "",
      authMessage: user
        ? "Tu cuenta no tiene el perfil de donante."
        : "Iniciá sesión como donante para consultar el perfil.",
      profile: {
        donations: "—",
        donationHistory: [],
        points: "—",
        level: "Ingresá para consultar",
      },
    };
  }
  if (!username) {
    return {
      userName: "",
      authMessage: "Tu cuenta todavía no está asociada a un donante con donaciones registradas en DonaTrack.",
      profile: {
        donations: "—",
        donationHistory: [],
        points: "—",
        level: "Sin datos de perfil",
      },
    };
  }

  const [profile, missions, badges, ranking] = await Promise.all([
    loadSection(() => donatrackService.getDonorProfile(req, username)),
    loadSection(
      () => donatrackService.getDonorMissions(req, username),
      (value) => readArray(value, "misiones"),
    ),
    loadSection(
      () => donatrackService.getDonorBadges(req, username),
      (value) => readArray(value, "insignias"),
    ),
    loadSection(() => donatrackService.getDonorRanking(req), (value) => {
      if (!value || !Array.isArray(value.losDestacados)) {
        throw new Error("La respuesta del ranking no tiene el formato esperado.");
      }
      return value;
    }),
  ]);
  const rankedDonors = ranking.data?.losDestacados;

  const evo = profile.data?.evolucionDonacionesPorPeriodo ?? [];
  const maxEvo = Math.max(1, ...evo);
  const cambio = profile.data?.comparacionMensual;

  return {
    userName: username,
    profile: {
      donations: profile.data?.donaciones?.length ?? "—",
      donationHistory: profile.data?.donaciones ?? [],
      points: profile.data?.impactoAcumulado ?? "—",
      level: profile.data?.categoriaActual ?? "Sin categoría",
      organizations: profile.data?.totalOrganizacionesAyudadas ?? "—",
      position: profile.data?.posicionRanking || "—",
      monthChange: cambio == null ? "—" : `${cambio > 0 ? "+" : ""}${Math.round(cambio)}%`,
      evolution: evo.map((v) => ({ value: v, height: Math.round((v / maxEvo) * 100) })),
    },
    missions:
      missions.data?.map((mission) => ({
        ...mission,
        completada:
          mission.distanciaRestante === 0 ||
          mission.progresoActual >= mission.objetivo,
          porcentaje: Math.min(100, Math.round((mission.progresoActual / mission.objetivo) * 100)),
      })) ?? [],
    badges: badges.data ?? [],
    ranking: Array.isArray(rankedDonors) ? rankedDonors : [],
    errors: {
      profile: profile.error,
      missions: missions.error,
      badges: badges.error,
      ranking: ranking.error,
    },
  };
}

router.get("/donante", async (req, res) => {
  res.render("donor", { title: "Donante", ...(await loadDonorPage(req)) });
});

export default router;
