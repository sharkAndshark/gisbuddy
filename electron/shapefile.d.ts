declare module 'shapefile' {
  export function read(
    shpPath: string,
    dbfPath: string | null,
    options?: { encoding?: string }
  ): Promise<{ type: string; features: any[] }>;
  export function open(
    shpPath: string,
    dbfPath?: string | null,
    options?: { encoding?: string }
  ): Promise<any>;
  export function openShp(
    shpPath: string,
    options?: { encoding?: string }
  ): Promise<any>;
  export function openDbf(
    dbfPath: string,
    options?: { encoding?: string }
  ): Promise<any>;
}
