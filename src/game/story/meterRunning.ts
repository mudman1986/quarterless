import {
  createWantedPressureMissionScript,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const METER_RUNNING: StoryChapter = {
  id: 'meter-running',
  actId: 'find-the-missing-dispatcher',
  order: 4,
  title: 'Meter Running',
  storyRole:
    'Taxi dispatch logs show Nia was using civilian rides to move informants under the radar.',
  combinedGoal:
    "Use the taxi network to trace Nia's informant routes, survive the retaliatory tail jobs, and secure the dying dispatcher who knows the next lead.",
  missionGroups: [
    ['ghost-fare'],
    ['double-booking', 'red-light-choir'],
    ['meter-burn'],
    ['farewell-signal'],
  ],
  missions: [
    {
      id: 'ghost-fare',
      title: 'Ghost Fare',
      hook: 'A mystery passenger is using the taxi lanes to test whether Rook can move quietly through the city.',
      primaryGoal:
        'Reach the pickup circuit and follow the ghost fare route cleanly enough to earn the next drop.',
      secondaryPressure:
        'The player should feel like clean route handling matters as much as speed.',
      failureState: 'Fail if the fare route is lost before the final drop point is reached.',
      payoff:
        'Rook learns which dispatch cabs were carrying real informants and which ones were bait.',
      prototypeRuntime: {
        id: 'ghost-fare',
        title: 'Ghost Fare',
        objectives: [
          {
            kind: 'route',
            description: 'Follow the ghost fare route through the taxi circuit',
            targets: [
              { x: 960, y: 960 },
              { x: 1472, y: 896 },
              { x: 1984, y: 960 },
            ],
            radius: 84,
            timeLimitSeconds: 75,
          },
        ],
        reward: 3000,
      },
      prototypeScript: createWantedPressureMissionScript({
        id: 'ghost-fare-route',
        title: 'Keep the route quiet',
        label: 'The ghost fare is still checking how cleanly you move',
        summary:
          'Push the route into a full police read and the next drop disappears before you reach it.',
        minStars: 2,
        failureText: 'The ghost fare vanished once the route got too loud.',
      }),
    },
    {
      id: 'double-booking',
      title: 'Double Booking',
      hook: 'Two fares overlap at once, and only one route holds the real clue.',
      primaryGoal:
        'Reach the two overlapping fare lanes and keep enough tempo to identify the live route.',
      secondaryPressure:
        'The route should force prioritization rather than a single straight sprint.',
      failureState: 'Fail if both fare routes go cold before Rook closes the overlap.',
      payoff: 'Rook narrows the search to one radio host who rode with the dispatch insiders.',
      prototypeRuntime: {
        id: 'double-booking',
        title: 'Double Booking',
        objectives: [
          {
            kind: 'route',
            description: 'Reach both overlapping fare lanes before they scatter',
            targets: [
              { x: 2240, y: 1088 },
              { x: 2816, y: 960 },
            ],
            radius: 84,
            timeLimitSeconds: 65,
          },
        ],
        reward: 3300,
      },
      branchOutcome: {
        branchId: 'double-booking',
        outcomeId: 'save-passenger-a',
      },
    },
    {
      id: 'red-light-choir',
      title: 'Red Light Choir',
      hook: 'A radio host is still driving the nightlife grid with a bodyguard tail on every corner.',
      primaryGoal:
        "Stay on the host's cab route long enough to find the producer carrying the tape.",
      secondaryPressure:
        'Rook has to stay close enough to track the route without losing the host in traffic.',
      failureState: "Fail if the host's route is lost before the producer's car is identified.",
      payoff: 'The tape reveals where the dying dispatcher is trying to make their last call.',
      branchOutcome: {
        branchId: 'double-booking',
        outcomeId: 'save-passenger-b',
      },
      requiredSystems: ['tail', 'scriptedEncounter', 'districtState'],
      prototypeRuntime: {
        id: 'red-light-choir',
        title: 'Red Light Choir',
        objectives: [
          {
            kind: 'tail',
            description: 'Tail the radio host through the nightlife grid',
            seconds: 10,
          },
        ],
        reward: 3600,
      },
      variants: [
        {
          branchId: 'double-booking',
          outcomeId: 'save-passenger-a',
          title: 'Red Light Choir: Uptown Lead',
          hook: 'The fare you protected pointed straight into the uptown club strip the host still trusts.',
          primaryGoal:
            "Stay on the host's uptown cab route long enough to find the producer carrying the tape.",
          secondaryPressure:
            'The uptown loop is tighter, so Rook has less room to drift without losing the disguise of traffic.',
          failureState:
            "Fail if the host's uptown route is lost before the producer's car is identified.",
          prototypeRuntime: {
            id: 'red-light-choir',
            title: 'Red Light Choir: Uptown Lead',
            objectives: [
              {
                kind: 'tail',
                description: 'Tail the radio host through the uptown club strip',
                seconds: 10,
              },
            ],
            reward: 3600,
          },
          prototypeScript: {
            primaryActorId: 'radio-host-cab',
            actors: [],
            stages: [
              {
                id: 'host-cab-route',
                title: 'Stay on the host cab',
                primaryActorId: 'radio-host-cab',
                districtState: {
                  label: 'The host is still circling the uptown clubs',
                  summary:
                    'The bodyguard coupe is screening the cab through the tighter uptown loop.',
                },
                actors: [
                  {
                    kind: 'vehicleRoute',
                    actorId: 'radio-host-cab',
                    vehicleKind: 'taxi',
                    route: [
                      { x: 3008, y: 1216 },
                      { x: 3328, y: 960 },
                      { x: 3520, y: 960 },
                    ],
                    speed: 115,
                    followRadius: 320,
                    tailDrainPerSecond: 2,
                    loseGraceSeconds: 2.5,
                  },
                  {
                    kind: 'vehicleRoute',
                    actorId: 'bodyguard-coupe',
                    vehicleKind: 'coupe',
                    route: [
                      { x: 2944, y: 1280 },
                      { x: 3264, y: 1024 },
                      { x: 3456, y: 1024 },
                    ],
                    speed: 112,
                    followRadius: 240,
                  },
                ],
                nextWhen: { kind: 'routeComplete', actorId: 'radio-host-cab' },
              },
              {
                id: 'producer-handoff',
                title: 'Track the producer car',
                primaryActorId: 'producer-sedan',
                districtState: {
                  label: 'The tape has moved into an uptown alley handoff',
                  summary:
                    'A producer sedan is trying to peel away from the club strip with the recording.',
                },
                actors: [
                  {
                    kind: 'vehicleRoute',
                    actorId: 'producer-sedan',
                    vehicleKind: 'sedan',
                    route: [
                      { x: 3520, y: 960 },
                      { x: 3776, y: 1088 },
                      { x: 3968, y: 1344 },
                    ],
                    speed: 122,
                    followRadius: 320,
                    tailDrainPerSecond: 2,
                    loseGraceSeconds: 2.5,
                  },
                ],
              },
            ],
          },
        },
        {
          branchId: 'double-booking',
          outcomeId: 'save-passenger-b',
          title: 'Red Light Choir: River Lead',
          hook: 'The delayed fare cut across the riverfront lanes, and the host shifted to a darker traffic cover route.',
          primaryGoal:
            "Stay on the host's riverfront cab route long enough to find the producer carrying the tape.",
          secondaryPressure:
            'The riverfront lanes are faster and more open, so Rook has to hold the tail without obvious cover.',
          failureState:
            "Fail if the host's riverfront route is lost before the producer's car is identified.",
          prototypeRuntime: {
            id: 'red-light-choir',
            title: 'Red Light Choir: River Lead',
            objectives: [
              {
                kind: 'tail',
                description: 'Tail the radio host through the riverfront lanes',
                seconds: 10,
              },
            ],
            reward: 3600,
          },
          prototypeScript: {
            primaryActorId: 'radio-host-cab',
            actors: [],
            stages: [
              {
                id: 'host-cab-route',
                title: 'Stay on the host cab',
                primaryActorId: 'radio-host-cab',
                districtState: {
                  label: 'The host is sweeping the riverfront lanes',
                  summary:
                    'The bodyguard coupe has more room to screen the cab once the river road opens up.',
                },
                actors: [
                  {
                    kind: 'vehicleRoute',
                    actorId: 'radio-host-cab',
                    vehicleKind: 'taxi',
                    route: [
                      { x: 3008, y: 1216 },
                      { x: 3328, y: 960 },
                      { x: 3520, y: 960 },
                    ],
                    speed: 115,
                    followRadius: 320,
                    tailDrainPerSecond: 2,
                    loseGraceSeconds: 2.5,
                  },
                  {
                    kind: 'vehicleRoute',
                    actorId: 'bodyguard-coupe',
                    vehicleKind: 'coupe',
                    route: [
                      { x: 2944, y: 1280 },
                      { x: 3264, y: 1024 },
                      { x: 3456, y: 1024 },
                    ],
                    speed: 112,
                    followRadius: 240,
                  },
                ],
                nextWhen: { kind: 'routeComplete', actorId: 'radio-host-cab' },
              },
              {
                id: 'producer-handoff',
                title: 'Track the producer car',
                primaryActorId: 'producer-sedan',
                districtState: {
                  label: 'The tape is breaking south along the river wall',
                  summary:
                    'A producer sedan is trying to use the river road to outrun the club district tail.',
                },
                actors: [
                  {
                    kind: 'vehicleRoute',
                    actorId: 'producer-sedan',
                    vehicleKind: 'sedan',
                    route: [
                      { x: 3520, y: 960 },
                      { x: 3776, y: 1088 },
                      { x: 3968, y: 1344 },
                    ],
                    speed: 122,
                    followRadius: 320,
                    tailDrainPerSecond: 2,
                    loseGraceSeconds: 2.5,
                  },
                ],
              },
            ],
          },
        },
      ],
      prototypeScript: {
        primaryActorId: 'radio-host-cab',
        actors: [],
        stages: [
          {
            id: 'host-cab-route',
            title: 'Stay on the host cab',
            primaryActorId: 'radio-host-cab',
            districtState: {
              label: 'The host is still blending into the nightlife loop',
              summary:
                'The bodyguard car is close enough to mask the host cab if you drift too far back.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'radio-host-cab',
                vehicleKind: 'taxi',
                route: [
                  { x: 3008, y: 1216 },
                  { x: 3328, y: 960 },
                  { x: 3520, y: 960 },
                ],
                speed: 115,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
              {
                kind: 'vehicleRoute',
                actorId: 'bodyguard-coupe',
                vehicleKind: 'coupe',
                route: [
                  { x: 2944, y: 1280 },
                  { x: 3264, y: 1024 },
                  { x: 3456, y: 1024 },
                ],
                speed: 112,
                followRadius: 240,
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'radio-host-cab' },
          },
          {
            id: 'producer-handoff',
            title: 'Track the producer car',
            primaryActorId: 'producer-sedan',
            districtState: {
              label: 'The tape has changed cars in the alley merge',
              summary:
                'A producer sedan is trying to peel off with the recording before the club crowd thins out.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'producer-sedan',
                vehicleKind: 'sedan',
                route: [
                  { x: 3520, y: 960 },
                  { x: 3776, y: 1088 },
                  { x: 3968, y: 1344 },
                ],
                speed: 122,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
          },
        ],
      },
    },
    {
      id: 'meter-burn',
      title: 'Meter Burn',
      hook: 'The only safe contraband route left is disguised as another ordinary fare.',
      primaryGoal:
        'Keep the fare lane moving through the checkpoint strip long enough to clear the sweep.',
      secondaryPressure:
        'The route should feel like a controlled smuggling run rather than a sprint to one marker.',
      failureState: 'Fail if the checkpoint strip locks down before Rook clears the final lane.',
      payoff:
        'Rook reaches the dispatch contact block with the route still quiet enough to make the pickup.',
      prototypeRuntime: {
        id: 'meter-burn',
        title: 'Meter Burn',
        objectives: [
          {
            kind: 'route',
            description: 'Clear the disguised fare route through the checkpoint strip',
            targets: [
              { x: 1984, y: 1536 },
              { x: 2496, y: 1600 },
              { x: 3008, y: 1536 },
            ],
            radius: 84,
            timeLimitSeconds: 70,
          },
        ],
        reward: 3900,
      },
      variants: [
        {
          branchId: 'double-booking',
          outcomeId: 'save-passenger-a',
          title: 'Meter Burn: Uptown Slip',
          hook: 'The uptown lead leaves one clean fare lane still threading the club strip.',
          primaryGoal:
            'Keep the uptown fare lane moving through the club checkpoint strip long enough to clear the sweep.',
          secondaryPressure:
            'The route should feel like the earlier club lead bought tighter but cleaner cover through the district.',
          prototypeRuntime: {
            id: 'meter-burn',
            title: 'Meter Burn: Uptown Slip',
            objectives: [
              {
                kind: 'route',
                description: 'Clear the uptown fare route through the checkpoint strip',
                targets: [
                  { x: 1920, y: 1216 },
                  { x: 2496, y: 1152 },
                  { x: 3072, y: 1216 },
                ],
                radius: 84,
                timeLimitSeconds: 70,
              },
            ],
            reward: 3900,
          },
          prototypeScript: createWantedPressureMissionScript({
            id: 'meter-burn-route',
            title: 'Keep the meter cold',
            label: 'Club-strip readers are squeezing the uptown fare lane',
            summary:
              'The club lead still gives you cover, but the checkpoint sweep is crawling uphill behind the taxi route.',
            minStars: 2,
            failureText: 'The uptown fare was burned once the checkpoint strip got a full read.',
            trafficSpeedMultiplier: 0.65,
            wantedPressureBonus: 1,
          }),
        },
        {
          branchId: 'double-booking',
          outcomeId: 'save-passenger-b',
          title: 'Meter Burn: River Slip',
          hook: 'The river lead leaves one darker fare lane still open along the wall roads.',
          primaryGoal:
            'Keep the river fare lane moving through the checkpoint strip long enough to clear the sweep.',
          secondaryPressure:
            'The route should feel like the river lead bought more speed but less cover through the sweep.',
          prototypeRuntime: {
            id: 'meter-burn',
            title: 'Meter Burn: River Slip',
            objectives: [
              {
                kind: 'route',
                description: 'Clear the river fare route through the checkpoint strip',
                targets: [
                  { x: 1856, y: 1792 },
                  { x: 2560, y: 1856 },
                  { x: 3264, y: 1792 },
                ],
                radius: 84,
                timeLimitSeconds: 70,
              },
            ],
            reward: 3900,
          },
          prototypeScript: createWantedPressureMissionScript({
            id: 'meter-burn-route',
            title: 'Keep the meter cold',
            label: 'River-wall readers are sweeping the darker fare lane',
            summary:
              'The river lead leaves fewer witnesses, but the open wall road gives the checkpoint sweep a cleaner line of sight.',
            minStars: 2,
            failureText: 'The river fare was burned once the checkpoint strip got a full read.',
            trafficSpeedMultiplier: 0.7,
            wantedPressureBonus: 1,
          }),
        },
      ],
      prototypeScript: createWantedPressureMissionScript({
        id: 'meter-burn-route',
        title: 'Keep the meter cold',
        label: 'Checkpoint readers are squeezing the taxi lane',
        summary:
          'The fare still passes for ordinary traffic, but only while the sweep never locks a full read on you.',
        minStars: 2,
        failureText: 'The contraband fare was burned once the checkpoint strip got a full read.',
        trafficSpeedMultiplier: 0.65,
        wantedPressureBonus: 1,
      }),
    },
    {
      id: 'farewell-signal',
      title: 'Farewell Signal',
      hook: 'The dying dispatcher is one block ahead of the killers, and the city is closing around the last pickup lane.',
      primaryGoal:
        'Reach the dispatcher, protect them long enough to secure the final clue, and clear the block alive.',
      secondaryPressure:
        'The encounter should feel like a protective escape, not a static arena brawl.',
      failureState:
        'Fail if the pickup lane is overrun before the dispatcher can hand over the clue.',
      payoff:
        'Rook secures the next lead and learns the police records are being sold from inside the precinct chain.',
      prototypeRuntime: {
        id: 'farewell-signal',
        title: 'Farewell Signal',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the dispatcher pickup lane before the assassins close it',
            target: { x: 3648, y: 1792 },
            radius: 88,
          },
          {
            kind: 'defend',
            description: 'Hold the lane for 15 seconds while the dispatcher talks',
            target: { x: 3648, y: 1792 },
            radius: 120,
            seconds: 15,
          },
        ],
        reward: 4300,
      },
      variants: [
        {
          branchId: 'double-booking',
          outcomeId: 'save-passenger-a',
          title: 'Farewell Signal: Club Exit',
          hook: 'The radio-host tape sends the dying dispatcher toward a club-service back lane instead of the river blocks.',
          primaryGoal:
            'Reach the club back-lane pickup, protect the dispatcher long enough to secure the final clue, and clear the block alive.',
          failureState:
            'Fail if the club pickup lane is overrun before the dispatcher can hand over the clue.',
          prototypeRuntime: {
            id: 'farewell-signal',
            title: 'Farewell Signal: Club Exit',
            objectives: [
              {
                kind: 'reach',
                description: 'Reach the club pickup lane before the assassins close it',
                target: { x: 3392, y: 1472 },
                radius: 88,
              },
              {
                kind: 'defend',
                description: 'Hold the club lane for 15 seconds while the dispatcher talks',
                target: { x: 3392, y: 1472 },
                radius: 120,
                seconds: 15,
              },
            ],
            reward: 4300,
          },
        },
        {
          branchId: 'double-booking',
          outcomeId: 'save-passenger-b',
          title: 'Farewell Signal: River Exit',
          hook: 'The river tape forces the dying dispatcher into a pickup lane under the wall roads before the killers close it.',
          primaryGoal:
            'Reach the river pickup lane, protect the dispatcher long enough to secure the final clue, and clear the block alive.',
          failureState:
            'Fail if the river pickup lane is overrun before the dispatcher can hand over the clue.',
          prototypeRuntime: {
            id: 'farewell-signal',
            title: 'Farewell Signal: River Exit',
            objectives: [
              {
                kind: 'reach',
                description: 'Reach the river pickup lane before the assassins close it',
                target: { x: 3840, y: 1984 },
                radius: 88,
              },
              {
                kind: 'defend',
                description: 'Hold the river lane for 15 seconds while the dispatcher talks',
                target: { x: 3840, y: 1984 },
                radius: 120,
                seconds: 15,
              },
            ],
            reward: 4300,
          },
        },
      ],
    },
  ],
};
