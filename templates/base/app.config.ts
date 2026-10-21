import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Contrato común de las 5 plantillas: TODO lo personalizable sale de brand.json.
 * El pipeline (GitHub Actions) sobrescribe brand.json y assets/brand/ antes de `eas build`;
 * este archivo no debe leer nada más. Ver packages/template-config (brandConfigSchema).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const brand = require("./brand.json");

// Fijos por plantilla: el slug y el projectId deben coincidir con el proyecto EAS de esta plantilla.
const TEMPLATE_SLUG = "apk-plantilla-base";
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: brand.app.name,
  slug: TEMPLATE_SLUG,
  version: brand.app.versionName,
  orientation: "portrait",
  icon: brand.assets.icon ?? "./assets/icon.png",
  userInterfaceStyle: "light",
  android: {
    package: brand.app.androidPackage,
    versionCode: brand.app.versionCode,
    adaptiveIcon: {
      foregroundImage: brand.assets.icon ?? "./assets/android-icon-foreground.png",
      backgroundColor: brand.theme.backgroundColor,
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    [
      "expo-splash-screen",
      {
        image: brand.assets.splash ?? brand.assets.icon ?? "./assets/splash-icon.png",
        imageWidth: 200,
        backgroundColor: brand.theme.backgroundColor,
      },
    ],
  ],
  extra: {
    brand: { content: brand.content, theme: brand.theme },
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
