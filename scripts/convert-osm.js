const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const input = process.argv[2] || 'test-data/sample.osm';
const outputDir = path.dirname(input);

const xml = fs.readFileSync(input, 'utf-8');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
const data = parser.parse(xml);
const osm = data.osm;

const nodeCoords = {};
const features = [];

// Collect all nodes first
if (osm.node) {
  const arr = Array.isArray(osm.node) ? osm.node : [osm.node];
  for (const n of arr) {
    nodeCoords[n.id] = [parseFloat(n.lon), parseFloat(n.lat)];
  }
}

// Node features (points with tags)
if (osm.node) {
  const arr = Array.isArray(osm.node) ? osm.node : [osm.node];
  for (const n of arr) {
    if (!n.tag) continue;
    const props = {};
    const tags = Array.isArray(n.tag) ? n.tag : [n.tag];
    for (const t of tags) props[t.k] = t.v;
    if (Object.keys(props).length > 0) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: nodeCoords[n.id] },
        properties: { osm_id: n.id, ...props },
      });
    }
  }
}

// Way features (lines and polygons)
if (osm.way) {
  const arr = Array.isArray(osm.way) ? osm.way : [osm.way];
  for (const w of arr) {
    if (!w.nd) continue;
    const refs = Array.isArray(w.nd) ? w.nd : [w.nd];
    const coords = refs
      .map(r => nodeCoords[r.ref])
      .filter(Boolean);

    if (coords.length < 2) continue;

    const props = {};
    if (w.tag) {
      const tags = Array.isArray(w.tag) ? w.tag : [w.tag];
      for (const t of tags) props[t.k] = t.v;
    }
    props.osm_id = w.id;

    // If first == last coordinate and >= 4 points -> polygon
    const isPolygon = coords.length >= 4 &&
      coords[0][0] === coords[coords.length - 1][0] &&
      coords[0][1] === coords[coords.length - 1][1];

    features.push({
      type: 'Feature',
      geometry: {
        type: isPolygon ? 'Polygon' : 'LineString',
        coordinates: isPolygon ? [coords] : coords,
      },
      properties: props,
    });
  }
}

const geojson = {
  type: 'FeatureCollection',
  features,
};

const outPath = path.join(outputDir, 'sample.geojson');
fs.writeFileSync(outPath, JSON.stringify(geojson, null, 2));
const sizeKb = (Buffer.byteLength(JSON.stringify(geojson)) / 1024).toFixed(0);
console.log(`✓ ${outPath}`);
console.log(`  ${features.length} features (${features.filter(f => f.geometry.type === 'Point').length} points, ${features.filter(f => f.geometry.type !== 'Point').length} lines/polygons)`);
console.log(`  ${sizeKb} KB`);
