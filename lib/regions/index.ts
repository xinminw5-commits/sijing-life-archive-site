import data from "./china-pca.json" with { type: "json" };

export const provinces = data;
export type RegionSelection = { province: string; city: string; district: string };

/** Resolve the full hierarchy; stale or mismatched codes cannot generate a place. */
export function resolveBirthPlace(selection: RegionSelection): string {
  const province = provinces.find((item) => item.code === selection.province);
  const city = province?.children.find((item) => item.code === selection.city);
  const district = city?.children.find((item) => item.code === selection.district);
  if (!province || !city || !district) return "";
  return [province.name, city.name === "市辖区" ? "" : city.name, district.name].filter(Boolean).join(" ");
}
