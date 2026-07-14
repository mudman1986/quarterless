import {
  createEscortMissionScript,
  vehicleRouteActor,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const LOW_WATER_MARK: StoryChapter = {
  id: 'low-water-mark',
  actId: 'expose-the-machine',
  order: 3,
  title: 'Low Water Mark',
  storyRole:
    'Rook exposes the utility board\'s role in steering panic, proving that flood gates, outages, and blocked rescue lanes are being sold as another Switchboard product.',
  combinedGoal:
    'Beat the flood-control sabotage, hold the pump grid online, and pull the foreman who knows where Nia was sent before the district is washed into another managed emergency.',
  presentation: {
    opener: {
      speaker: 'Rook Vance',
      role: 'Chasing panic through floodgates',
      kicker: 'Panic By Floodgate',
    },
  },
  missions: [
    {
      id: 'valve-street',
      title: 'Valve Street',
      hook: 'Enemy crews are racing toward the flood-control valves that can turn whole blocks into traps.',
      primaryGoal:
        'Reach the four valve points before they are fully opened and stop the flood pulse from owning the district.',
      secondaryPressure:
        'The challenge should be route optimization under a soft disaster clock instead of a static firefight at one site.',
      failureState: 'Fail if the flood crews fully open the valves before the route is shut down.',
      payoff:
        'Rook keeps the streets passable and learns the utility sabotage is being guided from the power grid itself.',
      requiredSystems: ['timedMultiStop', 'districtState'],
      prototypeRuntime: {
        id: 'valve-street',
        title: 'Valve Street',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the 4 flood-control valves before the district goes under',
            targets: [
              { x: 1216, y: 2304 },
              { x: 1600, y: 2304 },
              { x: 2112, y: 2240 },
              { x: 3456, y: 2624 },
            ],
            radius: 84,
            timeLimitSeconds: 84,
          },
        ],
        reward: 5400,
      },
      prototypeScript: {
        primaryActorId: 'valve-street-window',
        actors: [],
        stages: [
          {
            id: 'valve-street-route',
            title: 'Beat the flood pulse to the valves',
            districtState: {
              label: 'The flood-control network is still wobbling between manageable and catastrophic',
              summary:
                'Every valve you reach keeps another block drivable; miss the rhythm and the district becomes another paid panic zone.',
              trafficSpeedMultiplier: 0.72,
              suppressNpcDriving: true,
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'cable-snare',
      title: 'Cable Snare',
      hook: 'Surveillance cables are keeping the flood crews coordinated from rooftop to rooftop.',
      primaryGoal:
        'Cut the sequence lines on the marked cable nodes before the utility spotters lock the truck route down.',
      secondaryPressure:
        'The mission should reward keeping the heavy truck moving through the right order, not stopping to trade shots.',
      failureState: 'Fail if the sequence stays intact long enough for the spotters to reseal the district.',
      payoff:
        'The crippled cable net forces the sabotage crews back onto radio, exposing the pump station they are protecting.',
      requiredSystems: ['sabotage', 'districtState'],
      prototypeRuntime: {
        id: 'cable-snare',
        title: 'Cable Snare',
        objectives: [
          {
            kind: 'sabotage',
            description: 'Cut the 3 cable nodes before the roof spotters reseal the grid',
            targets: [
              { x: 2624, y: 1664 },
              { x: 3072, y: 1600 },
              { x: 3456, y: 1856 },
            ],
            radius: 84,
            timeLimitSeconds: 72,
          },
        ],
        reward: 5800,
      },
      prototypeScript: {
        primaryActorId: 'cable-snare-grid',
        actors: [],
        stages: [
          {
            id: 'cable-snare-route',
            title: 'Cut the line in order',
            districtState: {
              label: 'The roof spotters still have the cable sequence aligned',
              summary:
                'Break the grid in the right order before the utility board reroutes the truck lane into another dead approach.',
              trafficSpeedMultiplier: 0.74,
              wantedPressureBonus: 1,
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'dry-route',
      title: 'Dry Route',
      hook: 'The only way out for the evacuees is a stitched-together lane between stalled traffic and rising water.',
      primaryGoal:
        'Lead the evacuee column through the dry route and keep it together until the higher road opens.',
      secondaryPressure:
        'Navigation itself should feel like the enemy, with the safe route becoming narrower and slower as the water rises.',
      failureState: 'Fail if the evacuee column is separated from Rook before the dry route clears.',
      payoff:
        'The evacuees make it out and point Rook at the pump house the utility board is trying to surrender.',
      requiredSystems: ['escort', 'districtState'],
      prototypeRuntime: {
        id: 'dry-route',
        title: 'Dry Route',
        objectives: [
          {
            kind: 'route',
            description: 'Keep the evacuee column on the 3 dry-route turns',
            targets: [
              { x: 3136, y: 2560 },
              { x: 2880, y: 2816 },
              { x: 2624, y: 3008 },
            ],
            radius: 88,
            timeLimitSeconds: 80,
          },
          {
            kind: 'survive',
            description: 'Keep the route open for 12 seconds while the rear group clears the waterline',
            seconds: 12,
          },
        ],
        reward: 6200,
      },
      prototypeScript: createEscortMissionScript({
        actorId: 'dry-route-evacuees',
        route: [
          { x: 3136, y: 2560 },
          { x: 2880, y: 2816 },
          { x: 2624, y: 3008 },
          { x: 2368, y: 3136 },
        ],
        speed: 36,
        failureText: 'The evacuee column was split by the flood route.',
      }),
    },
    {
      id: 'pump-house-red',
      title: 'Pump House Red',
      hook: 'The utility board is trying to let one pump station fail so the district can be sold as a rescue contract.',
      primaryGoal:
        'Reach the pump house, hold it through the staged failures, and keep the station live until the restart finishes.',
      secondaryPressure:
        'The defense should evolve by lanes opening and collapsing, not by enemies simply getting larger numbers.',
      failureState: 'Fail if the pump station falls before the restart cycle completes.',
      payoff:
        'The station comes back online and forces the utility foreman into the open with nowhere left to hide.',
      requiredSystems: ['defend', 'districtState'],
      prototypeRuntime: {
        id: 'pump-house-red',
        title: 'Pump House Red',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the pump house before the shutdown sticks',
            target: { x: 3456, y: 2624 },
            radius: 88,
          },
          {
            kind: 'defend',
            description: 'Hold the pump house for 18 seconds while the restart cycles through',
            target: { x: 3456, y: 2624 },
            radius: 124,
            seconds: 18,
          },
        ],
        reward: 6700,
      },
      prototypeScript: {
        primaryActorId: 'pump-house-red-core',
        actors: [],
        stages: [
          {
            id: 'pump-house-red-entry',
            title: 'Get the station back on its feet',
            districtState: {
              label: 'The pump station is still one restart away from total surrender',
              summary:
                'Reach the station before the utility board turns a staged shutdown into a permanent district failure.',
              trafficSpeedMultiplier: 0.74,
              serviceLaneBlocks: ['ambulance'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'pump-house-red-hold',
            title: 'Hold the restart lanes',
            districtState: {
              label: 'Each restart stage opens another lane of attack into the station',
              summary:
                'Keep the station live through the whole restart cycle while the utility board keeps trying to re-break the pump grid.',
              suppressNpcDriving: true,
              wantedPressureBonus: 2,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'breakwater-file',
      title: 'Breakwater File',
      hook: 'The foreman who signed the flood diversions is trying to flee with the location of Nia\'s next holding site.',
      primaryGoal:
        'Trap the utility foreman\'s sedan, seize the breakwater file, and stay alive long enough to pull the location data out.',
      secondaryPressure:
        'The payoff should come from pressure and control, not from simply blowing the foreman away on the road.',
      failureState: 'Fail if the foreman escapes with the file before the location data is extracted.',
      payoff:
        'The breakwater file names the rich district whose panic cover is being bought with everyone else\'s suffering.',
      requiredSystems: ['capture', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'breakwater-file',
        title: 'Breakwater File',
        objectives: [
          {
            kind: 'capture',
            description: 'Hold the foreman sedan still for 3 seconds and seize the breakwater file',
            seconds: 3,
          },
          {
            kind: 'survive',
            description: 'Stay alive for 10 seconds while the file is decrypted',
            seconds: 10,
          },
        ],
        reward: 7500,
      },
      prototypeScript: {
        primaryActorId: 'breakwater-foreman',
        actors: [],
        stages: [
          {
            id: 'breakwater-file-chase',
            title: 'Pin the foreman sedan',
            primaryActorId: 'breakwater-foreman',
            districtState: {
              label: 'The utility foreman is still trying to outrun the flood he sold',
              summary:
                'Catch the sedan cleanly enough to pull the file without letting the route dissolve into a useless wreck.',
              trafficSpeedMultiplier: 0.8,
            },
            actors: [
              vehicleRouteActor(
                'breakwater-foreman',
                'sedan',
                [
                  { x: 3200, y: 2240 },
                  { x: 3456, y: 1856 },
                  { x: 3584, y: 1216 },
                ],
                108,
                {
                  followRadius: 320,
                  captureRadius: 135,
                  captureMaxSpeed: 65,
                  tailDrainPerSecond: 2,
                  loseGraceSeconds: 2.5,
                },
              ),
            ],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'breakwater-file-decrypt',
            title: 'Hold until the file opens',
            districtState: {
              label: 'The foreman is pinned, but the response crews are closing on the extraction lane',
              summary:
                'The file is opening now; stay alive long enough to get the location before the cleanup wave crushes the stop.',
              suppressNpcDriving: true,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
          },
        ],
      },
    },
  ],
};