import { STORY_MODE_SCHEMA_VERSION } from './storyMode';
import type { StoryAct, StoryMode } from './storyMode';
import { DEAD_DROP_DISTRICT } from './deadDropDistrict';
import { SPARE_PARTS_GOSPEL } from './sparePartsGospel';
import { STATIC_ON_THE_HOSPITAL_BAND } from './staticOnTheHospitalBand';
import { METER_RUNNING } from './meterRunning';
import { PRECINCT_ASHES } from './precinctAshes';
import { THE_SWITCHBOARD_NAME } from './theSwitchboardName';
import { FREIGHT_UNION_MORNING } from './freightUnionMorning';
import { NEON_COURIERS } from './neonCouriers';
import { GLASS_TOWERS_EMPTY_FLOORS } from './glassTowersEmptyFloors';
import { SAINTS_OF_THE_SIDE_STREET } from './saintsOfTheSideStreet';
import { BROADCAST_TEETH } from './broadcastTeeth';
import { DEBT_COLLECTION_WEATHER } from './debtCollectionWeather';

export const FIND_THE_MISSING_DISPATCHER: StoryAct = {
  id: 'find-the-missing-dispatcher',
  order: 1,
  title: 'Find The Missing Dispatcher',
  summary:
    "Rook follows Nia's physical evidence trail through the waterfront and learns the city is being manipulated by a hidden logistics network.",
  chapters: [
    DEAD_DROP_DISTRICT,
    SPARE_PARTS_GOSPEL,
    STATIC_ON_THE_HOSPITAL_BAND,
    METER_RUNNING,
    PRECINCT_ASHES,
    THE_SWITCHBOARD_NAME,
  ],
};
export const COURT_THE_CITYS_MIDDLE_POWERS: StoryAct = {
  id: 'court-the-citys-middle-powers',
  order: 2,
  title: "Court The City's Middle Powers",
  summary:
    "Rook turns proof into alliances by winning over the city's dock crews, couriers, and neighborhood networks before the Switchboard can isolate them.",
  chapters: [
    FREIGHT_UNION_MORNING,
    NEON_COURIERS,
    GLASS_TOWERS_EMPTY_FLOORS,
    SAINTS_OF_THE_SIDE_STREET,
    BROADCAST_TEETH,
    DEBT_COLLECTION_WEATHER,
  ],
};
export const STORY_MODE_PROTOTYPE: StoryMode = {
  schemaVersion: STORY_MODE_SCHEMA_VERSION,
  id: 'sindicate-story-mode',
  title: 'Sindicate Story Mode',
  premise:
    'Rook Vance returns to the city to find their missing sister Nia and uncovers the Switchboard, a shadow system that sells control of emergency movement.',
  acts: [FIND_THE_MISSING_DISPATCHER, COURT_THE_CITYS_MIDDLE_POWERS],
};
