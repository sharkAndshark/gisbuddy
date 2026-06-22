import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { launchApp, cleanupApp } from './fixtures/app';
import { fauxAssistantMessage, fauxText, fauxToolCall, setFauxResponses } from './fixtures/faux';

const SAMPLE_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [116.4074, 39.9042] },
      properties: { name: 'Beijing', population: 21540000 },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [121.4737, 31.2304] },
      properties: { name: 'Shanghai', population: 24870895 },
    },
  ],
};

test.describe('GIS scenarios', () => {
  test('Agent 调用 ogrinfo 读取 GeoJSON 文件 → tool 输出含 feature 信息', async () => {
    const { app, page, tmpDir, projectDir } = await launchApp({ withProject: 'e2e-gis-ogr', testMode: true });

    try {
      fs.writeFileSync(path.join(projectDir!, 'cities.geojson'), JSON.stringify(SAMPLE_GEOJSON));

      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });

      // Faux: agent calls bash to run ogrinfo against the GeoJSON, then summarizes.
      await setFauxResponses(page, [
        fauxAssistantMessage(
          [fauxToolCall('bash', { command: 'ogrinfo -al cities.geojson' })],
          { stopReason: 'toolUse' },
        ),
        fauxAssistantMessage([fauxText('已读取 cities.geojson')]),
      ]);

      const textarea = page.locator('textarea').first();
      await textarea.fill('查看城市数据');
      await textarea.press('Enter');

      // bash tool runs real ogrinfo (system GDAL); output should contain feature data.
      await page.waitForSelector('tool-message', { timeout: 15000 });
      // ogrinfo prints the geojson layer name + property names
      await expect(page.locator('tool-message').last()).toContainText('cities', { timeout: 10000 });
    } finally {
      await cleanupApp(app, tmpDir);
    }
  });

  test('点击 GeoJSON 文件 → 地图渲染（Leaflet 容器出现）', async () => {
    const { app, page, tmpDir, projectDir } = await launchApp({ withProject: 'e2e-gis-map', testMode: true });

    try {
      fs.writeFileSync(path.join(projectDir!, 'places.geojson'), JSON.stringify(SAMPLE_GEOJSON));

      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });
      await page.waitForSelector('text=places.geojson', { timeout: 10000 });

      // Click the geojson file → file-view renders Leaflet map container
      await page.locator('text=places.geojson').first().click();

      // Leaflet mounts #gisbuddy-map; tiles may take time but container appears fast.
      await page.waitForSelector('#gisbuddy-map', { timeout: 10000 });
      await page.waitForSelector('.leaflet-container', { timeout: 10000 });

      // Sanity: map container has the expected id (renderer.ts initMap)
      const mapCount = await page.locator('#gisbuddy-map').count();
      expect(mapCount).toBe(1);
    } finally {
      await cleanupApp(app, tmpDir);
    }
  });
});
