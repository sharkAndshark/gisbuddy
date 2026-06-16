declare module 'shapefile' {
  export function read(
    shpPath: string,
    dbfPath: string | null,
    options?: { encoding?: string }
  ): Promise<{ type: string; features: any[] }>;
}
