#!/bin/bash
set -e

DATA_DIR="test-data"
mkdir -p "$DATA_DIR"

# Overpass query: Beijing Olympic Green area
QUERY='[out:xml];
(
  node(39.990,116.380,40.005,116.410);
  way(39.990,116.380,40.005,116.410);
  rel(39.990,116.380,40.005,116.410);
);
out body;
>;
out skel qt;'

echo "=== 下载 OSM 测试数据 ==="
echo "区域: 北京奥林匹克公园周边"
echo ""

# Download via URL-encoded GET
ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$QUERY'''))")
curl -s "https://overpass-api.de/api/interpreter?data=$ENCODED" -o "$DATA_DIR/sample.osm"
echo "✓ sample.osm ($(du -h "$DATA_DIR/sample.osm" | cut -f1))"

# Convert to GeoJSON
node scripts/convert-osm.js "$DATA_DIR/sample.osm"

# Create small subset for quick testing
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$DATA_DIR/sample.geojson','utf-8'));
const small = { type: 'FeatureCollection', features: data.features.slice(0, 50) };
fs.writeFileSync('$DATA_DIR/sample-small.geojson', JSON.stringify(small, null, 2));
"
echo "✓ sample-small.geojson"

echo ""
echo "=== 下载完成 ==="
ls -lh "$DATA_DIR"/*.{osm,geojson} 2>/dev/null
