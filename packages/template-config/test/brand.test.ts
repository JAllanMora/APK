import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appRequestInputSchema,
  brandConfigSchema,
  buildBrandConfig,
  type AppRequestRow,
} from "../src";

const request: AppRequestRow = {
  id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  owner_id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  template_id: "plantilla-1",
  business_name: "Taquería El Güero de la Esquina Norte del Mercado",
  address: "Av. Juárez 123, Centro",
  phone: "+52 55 1234 5678",
  headline: "Los mejores tacos al pastor",
  primary_color: "#D32F2F",
  secondary_color: "#FFC107",
  icon_path: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/3f2504e0/icon.png",
  splash_path: null,
  android_package: "com.apkgen.a3f2504e04f8911d3",
};

describe("buildBrandConfig", () => {
  it("genera un brand.json válido", () => {
    const brand = buildBrandConfig(
      request,
      { id: "6ba7b810-9dad-41d1-80b4-00c04fd430c8", app_request_id: request.id, version_code: 3 },
      { hasIcon: true, hasSplash: false },
    );
    expect(brandConfigSchema.parse(brand)).toEqual(brand);
    expect(brand.app.versionName).toBe("1.0.3");
    expect(brand.app.name.length).toBeLessThanOrEqual(30);
    expect(brand.content.businessName).toBe(request.business_name);
    expect(brand.assets).toEqual({ icon: "./assets/brand/icon.png", splash: null });
  });

  it("rechaza un build de otra solicitud", () => {
    expect(() =>
      buildBrandConfig(
        request,
        { id: "6ba7b810-9dad-41d1-80b4-00c04fd430c8", app_request_id: "otro", version_code: 1 },
        { hasIcon: false, hasSplash: false },
      ),
    ).toThrow();
  });
});

describe("appRequestInputSchema", () => {
  it("acepta un formulario mínimo", () => {
    expect(
      appRequestInputSchema.safeParse({
        templateId: "plantilla-2",
        businessName: "Mi negocio",
        headline: "Bienvenidos",
      }).success,
    ).toBe(true);
  });

  it("rechaza colores y teléfonos inválidos", () => {
    const r = appRequestInputSchema.safeParse({
      templateId: "plantilla-2",
      businessName: "Mi negocio",
      headline: "Hola",
      primaryColor: "rojo",
      phone: "llámame",
    });
    expect(r.success).toBe(false);
  });
});

describe("plantillas del repo", () => {
  it("cada templates/*/brand.json cumple el contrato", () => {
    const root = join(import.meta.dirname, "../../../templates");
    const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      const file = join(root, dir.name, "brand.json");
      expect(existsSync(file), `${dir.name} no tiene brand.json`).toBe(true);
      const parsed = brandConfigSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
      expect(parsed.success, `${dir.name}/brand.json: ${parsed.error?.message}`).toBe(true);
    }
  });
});
