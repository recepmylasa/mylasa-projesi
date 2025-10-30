// functions/src/geo.ts
// Node 20 / TS. Sağlayıcı: Google | OpenCage | BigDataCloud
// API anahtarı ve provider secrets üzerinden gelir.

type GeoResult = {
  city?: string;
  admin1?: string;       // il / eyalet
  country?: string;
  countryCode?: string;  // ISO-2 (TR, US, ... )
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pickFirst<T>(...vals: Array<T | undefined | null>): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v as T;
  return undefined;
}

function normalizeCity(s?: string | null): string | undefined {
  if (!s) return undefined;
  return String(s).trim().replace(/\s+/g, " ");
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult> {
  const provider = (process.env.GEOCODING_PROVIDER || "google").toLowerCase();
  const key = process.env.GEOCODING_API_KEY || "";

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};

  try {
    if (provider === "opencage") {
      if (!key) throw new Error("OpenCage API key missing");
      const url = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lng}&key=${encodeURIComponent(
        key
      )}&no_annotations=1&language=tr`;
      const r = await fetch(url);
      const j: any = await r.json();
      const comp = j?.results?.[0]?.components || {};
      return {
        city: normalizeCity(comp.city || comp.town || comp.village || comp.county),
        admin1: normalizeCity(comp.state),
        country: normalizeCity(comp.country),
        countryCode: (comp.country_code || "").toUpperCase() || undefined,
      };
    }

    if (provider === "bigdatacloud") {
      // Anahtar gerektirmez; sade bir cevap döner
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=tr`;
      const r = await fetch(url, { headers: { "User-Agent": "mylasa-functions/1.0" } });
      const j: any = await r.json();
      return {
        city: normalizeCity(pickFirst(j.city, j.locality, j.localityInfo?.locality?.name)),
        admin1: normalizeCity(j.principalSubdivision),
        country: normalizeCity(j.countryName),
        countryCode: (j.countryCode || "").toUpperCase() || undefined,
      };
    }

    // default: google
    if (!key) throw new Error("Google Geocoding API key missing");
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(
      key
    )}&language=tr&result_type=locality|administrative_area_level_1|country`;
    const r = await fetch(url);
    const j: any = await r.json();

    const first = j?.results?.[0];
    const comps: Array<any> = first?.address_components || [];

    const find = (type: string, short = false) => {
      const c = comps.find((x) => Array.isArray(x.types) && x.types.includes(type));
      if (!c) return undefined;
      return normalizeCity(short ? c.short_name : c.long_name);
    };

    const city = pickFirst(find("locality"), find("administrative_area_level_2"));
    const admin1 = find("administrative_area_level_1");
    const country = find("country");
    const countryCode = find("country", true)?.toUpperCase();

    return { city, admin1, country, countryCode };
  } catch (e) {
    // Ağ/JSON hatalarında beklemeyi hafiflet
    await sleep(120);
    return {};
  }
}
