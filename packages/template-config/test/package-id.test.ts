import { describe, expect, it } from "vitest";
import { androidPackageFor } from "../src";

describe("androidPackageFor", () => {
  it("usa los primeros 16 hex del UUID con prefijo 'a'", () => {
    expect(androidPackageFor("3F2504E0-4F89-11D3-9A0C-0305E82C3301", "com.apkgen")).toBe(
      "com.apkgen.a3f2504e04f8911d3",
    );
  });

  it("produce identificadores distintos para solicitudes distintas", () => {
    const a = androidPackageFor("00000000-0000-4000-8000-000000000001", "com.apkgen");
    const b = androidPackageFor("10000000-0000-4000-8000-000000000001", "com.apkgen");
    expect(a).not.toBe(b);
  });

  it("rechaza ids que no son UUID", () => {
    expect(() => androidPackageFor("no-es-uuid", "com.apkgen")).toThrow();
  });

  it("rechaza namespaces inválidos", () => {
    expect(() => androidPackageFor("3f2504e0-4f89-11d3-9a0c-0305e82c3301", "Com.Mal")).toThrow();
  });
});
