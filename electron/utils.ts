export function isCompatibleCRS(geojson: unknown): boolean {
  if (!geojson || typeof geojson !== 'object') return false;
  const obj = geojson as Record<string, unknown>;
  const crs = obj.crs;
  if (!crs) return true; // RFC 7946: no crs → WGS84
  if (typeof crs !== 'object') return true;
  const crsObj = crs as Record<string, unknown>;
  const props = crsObj.properties;
  if (!props || typeof props !== 'object') return true;
  const name = (props as Record<string, unknown>).name;
  if (!name || typeof name !== 'string') return true;
  const m = name.match(/(\d+)/);
  if (!m) return false;
  const code = parseInt(m[1], 10);
  return code === 4326 || code === 3857;
}

export function extractEPSG(prjContent: string): number | null {
  const matches = prjContent.matchAll(/AUTHORITY\["EPSG","(\d+)"\]/g);
  let last: number | null = null;
  for (const m of matches) {
    last = parseInt(m[1], 10);
  }
  return last;
}
