import Constants from "expo-constants";

/** Lo que la plantilla puede leer de brand.json (inyectado vía app.config.ts → extra.brand). */
export interface Brand {
  content: {
    businessName: string;
    address: string | null;
    phone: string | null;
    headline: string;
  };
  theme: {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
  };
}

export const brand = Constants.expoConfig?.extra?.brand as Brand;
