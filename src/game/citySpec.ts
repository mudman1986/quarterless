import type { CitySpec } from '../core/city';

/**
 * Live city layout used by the playable Phaser scene.
 *
 * Each 7-tile block is a 4-tile road band (two lanes each way) plus a 3-tile
 * building strip. `margin === sidewalkWidth`, so the pavement exactly fills the
 * gap between a building and the road — wide enough to walk two abreast, with no
 * spill onto the carriageway. The river sits on a building-row band (rows 32–34)
 * so the wide streets run alongside it rather than into it, crossed by bridges
 * on every other vertical road.
 */
export const CITY_SPEC: CitySpec = {
  cols: 70,
  rows: 70,
  tile: 64,
  block: 7,
  roadWidth: 4,
  margin: 28,
  sidewalkWidth: 28,
  rivers: [{ orientation: 'horizontal', start: 32, span: 3, bridgeEvery: 2 }],
};
