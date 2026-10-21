import { z } from "zod";

/** Versión del contrato brand.json. Súbela si cambias la forma de BrandConfig. */
export const BRAND_SCHEMA_VERSION = 1 as const;

/** Carpeta (relativa a la raíz de cada plantilla) donde el pipeline deja las imágenes de marca. */
export const BRAND_ASSET_DIR = "./assets/brand";
export const BRAND_ICON_PATH = `${BRAND_ASSET_DIR}/icon.png`;
export const BRAND_SPLASH_PATH = `${BRAND_ASSET_DIR}/splash.png`;

export const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Usa un color hexadecimal como #1E88E5");

export const templateId = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Identificador de plantilla inválido");

/** Mismo patrón que el CHECK de public.app_requests.phone. */
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{6,20}$/, "Teléfono inválido");

/** Identificador de paquete Android (applicationId). */
export const androidPackage = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/,
    "Identificador Android inválido (ej. com.empresa.app)",
  );

/**
 * Lo que captura el formulario web (Fase 3). Los límites coinciden con los CHECK de
 * public.app_requests para que el error se muestre en el formulario y no en la base de datos.
 */
export const appRequestInputSchema = z.object({
  templateId,
  businessName: z.string().trim().min(1).max(50),
  address: z.string().trim().max(200).optional(),
  phone: phone.optional(),
  headline: z.string().trim().min(1).max(80),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
});
export type AppRequestInput = z.infer<typeof appRequestInputSchema>;

/**
 * Contrato brand.json: el ÚNICO archivo que el pipeline escribe dentro de una plantilla.
 * Las 5 plantillas lo leen desde app.config.ts y lo exponen a la app en
 * Constants.expoConfig.extra.brand.
 */
export const brandConfigSchema = z.object({
  schemaVersion: z.literal(BRAND_SCHEMA_VERSION),
  buildId: z.string().uuid().nullable(),
  templateId,
  app: z.object({
    /** Nombre visible bajo el icono del teléfono. */
    name: z.string().min(1).max(30),
    androidPackage,
    versionCode: z.number().int().positive(),
    versionName: z.string().regex(/^\d+\.\d+\.\d+$/),
  }),
  content: z.object({
    businessName: z.string().min(1),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    headline: z.string().min(1),
  }),
  theme: z.object({
    primaryColor: hexColor,
    secondaryColor: hexColor,
    backgroundColor: hexColor,
  }),
  assets: z.object({
    icon: z.string().nullable(),
    splash: z.string().nullable(),
  }),
});
export type BrandConfig = z.infer<typeof brandConfigSchema>;

export const BUILD_STATUSES = [
  "queued",
  "dispatched",
  "building",
  "completed",
  "failed",
  "canceled",
] as const;
export type BuildStatus = (typeof BUILD_STATUSES)[number];

/** Estados que todavía pueden avanzar (coincide con el índice parcial builds_one_active_per_request). */
export const ACTIVE_BUILD_STATUSES: readonly BuildStatus[] = ["queued", "dispatched", "building"];

/** Etiqueta para la barra de progreso de la web. */
export const BUILD_STATUS_LABEL: Record<BuildStatus, string> = {
  queued: "En cola",
  dispatched: "En cola",
  building: "Compilando",
  completed: "Listo para descargar",
  failed: "Error",
  canceled: "Cancelado",
};
