import fs from 'fs';
import { parseFile } from './app/utils/fileParser.js';

const content = `{
  "semanticSegments": [
    {
      "startTime": "2024-01-01T10:00:00Z",
      "endTime": "2024-01-01T11:00:00Z",
      "timelinePath": [
        { "point": "12.9716°, 77.5946°" },
        { "point": "12.9720°, 77.5950°" },
        { "point": "13.0000°, 77.6000°" }
      ]
    }
  ]
}`;

try {
  const result = parseFile('dummy.json', content);
  console.log("Features:", JSON.stringify(result.geojson.features, null, 2));
} catch (e) {
  console.error(e);
}
