export function isCompatibleCRS(geojson: unknown): boolean {
  if (!geojson || typeof geojson !== 'object') return false;
  const obj = geojson as Record<string, unknown>;
  const crs = obj.crs;
  if (!crs) return true; // RFC 7946: no crs → WGS84
  if (typeof crs !== 'object') return false; // malformed (string, number, etc.) → reject
  const crsObj = crs as Record<string, unknown>;
  const props = crsObj.properties;
  if (!props || typeof props !== 'object') return false; // malformed properties → reject
  const name = (props as Record<string, unknown>).name;
  if (!name || typeof name !== 'string') return false; // unparseable name → reject
  const m = name.match(/(\d+)/);
  if (!m) return false;
  const code = parseInt(m[1], 10);
  return code === 4326 || code === 3857;
}

// Returns the LAST AUTHORITY["EPSG","..."] match in the WKT.
// This is correct for the common projected-CRS shape where the base
// geographic CRS authority appears first and the projected authority
// (the one we want) appears last. Compound CRS or unusual orderings
// may resolve incorrectly, but only 4326/3857 are accepted downstream.
export function extractEPSG(prjContent: string): number | null {
  const matches = prjContent.matchAll(/AUTHORITY\["EPSG","(\d+)"\]/g);
  let last: number | null = null;
  for (const m of matches) {
    last = parseInt(m[1], 10);
  }
  return last;
}
