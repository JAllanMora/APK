import {
  BRAND_ICON_PATH,
  BRAND_SCHEMA_VERSION,
  BRAND_SPLASH_PATH,
  brandConfigSchema,
  type BrandConfig,
} from "./schema";

/** Fila de public.app_requests tal como la devuelve Supabase. */
export interface AppRequestRow {
  id: string;
  owner_id: string;
  template_id: string;
  business_name: string;
  address: string | null;
  phone: string | null;
  headline: string;
  primary_color: string;
  secondary_color: string;
  icon_path: string | null;
  splash_path: string | null;
  android_package: string;
}

/** Fila de public.builds (solo los campos que necesita el pipeline). */
export interface BuildRow {
  id: string;
  app_request_id: string;
  version_code: number;
}

const DEFAULT_BACKGROUND = "#FFFFFF";
const MAX_APP_NAME = 30;

/**
 * Convierte una solicitud + build en el brand.json que se escribe en la plantilla.
 * `hasIcon`/`hasSplash` indican si el pipeline descargó esas imágenes a assets/brand/.
 */
export function buildBrandConfig(
  request: AppRequestRow,
  build: BuildRow,
  files: { hasIcon: boolean; hasSplash: boolean },
): BrandConfig {
  if (build.app_request_id !== request.id) {
    throw new Error("El build no pertenece a esta solicitud");
  }
  return brandConfigSchema.parse({
    schemaVersion: BRAND_SCHEMA_VERSION,
    buildId: build.id,
    templateId: request.template_id,
    app: {
      name: request.business_name.slice(0, MAX_APP_NAME).trim(),
      androidPackage: request.android_package,
      versionCode: build.version_code,
      versionName: `1.0.${build.version_code}`,
    },
    content: {
      businessName: request.business_name,
      address: request.address,
      phone: request.phone,
      headline: request.headline,
    },
    theme: {
      primaryColor: request.primary_color,
      secondaryColor: request.secondary_color,
      backgroundColor: DEFAULT_BACKGROUND,
    },
    assets: {
      icon: files.hasIcon ? BRAND_ICON_PATH : null,
      splash: files.hasSplash ? BRAND_SPLASH_PATH : null,
    },
  });
}
