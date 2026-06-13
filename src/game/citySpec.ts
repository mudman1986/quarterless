import type { CitySpec } from '../core/city';

/** Live city layout used by the playable Phaser scene. The river sits on a
 * clean four-tile band so it does not clip the neighboring building row. */
export const CITY_SPEC: CitySpec = {
  cols: 70,
  rows: 70,
  tile: 64,
  block: 6,
  roadWidth: 4,
  margin: 9,
  sidewalkWidth: 30,
  rivers: [{ orientation: 'horizontal', start: 30, span: 4, bridgeEvery: 2 }],
};