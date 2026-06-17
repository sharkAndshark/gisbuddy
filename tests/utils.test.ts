import { describe, it, expect } from 'vitest';
import { extractEPSG, isCompatibleCRS } from '../electron/utils';

describe('extractEPSG', () => {
  it('extracts EPSG code from WKT with AUTHORITY', () => {
    const wkt = 'GEOGCRS["WGS 84",DATUM["World Geodetic System 1984",ELLIPSOID["WGS 84",6378137,298.257223563]],CS[ellipsoidal,2],AXIS["latitude",north],AXIS["longitude",east],AUTHORITY["EPSG","4326"]]';
    expect(extractEPSG(wkt)).toBe(4326);
  });

  it('extracts EPSG 3857', () => {
    const wkt = 'PROJCRS["WGS 84 / Pseudo-Mercator",BASEGEOGCRS["WGS 84",DATUM["World Geodetic System 1984",ELLIPSOID["WGS 84",6378137,298.257223563]],AUTHORITY["EPSG","4326"]],AUTHORITY["EPSG","3857"]]';
    expect(extractEPSG(wkt)).toBe(3857);
  });

  it('returns null when no AUTHORITY EPSG found', () => {
    expect(extractEPSG('PROJCS["unknown"]')).toBeNull();
    expect(extractEPSG('')).toBeNull();
  });

  it('handles real .prj file content', () => {
    const realPrj = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]';
    expect(extractEPSG(realPrj)).toBe(4326);
  });
});

describe('isCompatibleCRS', () => {
  it('returns true for no CRS (RFC 7946 fallback to WGS84)', () => {
    expect(isCompatibleCRS({ type: 'FeatureCollection' })).toBe(true);
    expect(isCompatibleCRS({})).toBe(true);
  });

  it('returns true for EPSG 4326', () => {
    expect(isCompatibleCRS({
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
    })).toBe(true);

    expect(isCompatibleCRS({
      crs: { type: 'name', properties: { name: 'EPSG:4326' } },
    })).toBe(true);
  });

  it('returns true for EPSG 3857', () => {
    expect(isCompatibleCRS({
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3857' } },
    })).toBe(true);
  });

  it('returns false for unsupported EPSG codes', () => {
    expect(isCompatibleCRS({
      crs: { type: 'name', properties: { name: 'EPSG:4490' } },
    })).toBe(false);
  });

  it('returns false for non-object inputs', () => {
    expect(isCompatibleCRS(null)).toBe(false);
    expect(isCompatibleCRS(undefined)).toBe(false);
    expect(isCompatibleCRS('string')).toBe(false);
  });

  it('handles CRS without properties', () => {
    expect(isCompatibleCRS({ crs: { type: 'name' } })).toBe(true);
  });

  it('handles CRS with malformed name', () => {
    expect(isCompatibleCRS({
      crs: { type: 'name', properties: { name: 'NO_NUMBERS_HERE' } },
    })).toBe(false);
  });
});
