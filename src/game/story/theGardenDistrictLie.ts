import {
  createWantedPressureMissionScript,
  vehicleRouteActor,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const THE_GARDEN_DISTRICT_LIE: StoryChapter = {
  id: 'the-garden-district-lie',
  actId: 'expose-the-machine',
  order: 4,
  title: 'The Garden District Lie',
  storyRole:
    'Rook pushes into the manicured districts that bought their safety with diverted emergency cover, turning private comfort into public proof.',
  combinedGoal:
    'Mark the hidden panic bunkers, break the donor district\'s traffic choreography, and chase its patron into the open before the rich blocks can buy another clean version of the truth.',
  presentation: {
    opener: {
      speaker: 'Rook Vance',
      role: 'Dragging comfort into daylight',
      kicker: 'Luxury Bought With Delay',
    },
  },
  missions: [
    {
      id: 'white-curb-tour',
      title: 'White Curb Tour',
      hook: 'Valet cover is the only way into the blocks where the panic bunkers are disguised as polite convenience.',
      primaryGoal:
        'Drive the marked valet route through the hidden bunker blocks without drawing enough attention to lose the disguise.',
      secondaryPressure:
        'The mission should reward clean, disciplined movement through gated streets rather than brute force entry.',
      failureState: 'Fail if the valet disguise breaks before every bunker block is tagged.',
      payoff:
        'Rook maps the hidden shelters and learns which gala route is feeding them the city\'s stolen emergency cover.',
      requiredSystems: ['stealth', 'districtState'],
      prototypeRuntime: {
        id: 'white-curb-tour',
        title: 'White Curb Tour',
        objectives: [
          {
            kind: 'route',
            description: 'Drive the 3 gated bunker blocks before the valet disguise burns',
            targets: [
              { x: 928, y: 608 },
              { x: 1376, y: 608 },
              { x: 1824, y: 672 },
            ],
            radius: 84,
            timeLimitSeconds: 78,
          },
        ],
        reward: 5600,
      },
      prototypeScript: createWantedPressureMissionScript({
        id: 'white-curb-tour-cover',
        title: 'Keep the valet disguise intact',
        label: 'The gated blocks still read you as a service car',
        summary:
          'Keep the approach clean enough that the district never flips from polite surveillance into a full panic lockout.',
        minStars: 2,
        failureText: 'The valet disguise burned before every bunker block was tagged.',
        trafficSpeedMultiplier: 0.76,
        wantedPressureBonus: 1,
      }),
    },
    {
      id: 'garden-party-crash',
      title: 'Garden Party Crash',
      hook: 'The gala only works while the donor traffic pattern stays smooth enough to hide who is entering the panic bunkers.',
      primaryGoal:
        'Cut the marked arrival lanes in order and keep the donor blocks unstable long enough to force the guests into the street.',
      secondaryPressure:
        'The mission should feel like a traffic collapse you are composing, not a flat destruction list.',
      failureState: 'Fail if the gala routes stabilize before the donor crowd spills into the open.',
      payoff:
        'The guests scatter into public view, exposing which neighborhoods were buying protection off everyone else\'s disaster.',
      requiredSystems: ['sabotage', 'districtState'],
      prototypeRuntime: {
        id: 'garden-party-crash',
        title: 'Garden Party Crash',
        objectives: [
          {
            kind: 'sabotage',
            description: 'Cut the 3 donor arrival routes before the gala reseals the blocks',
            targets: [
              { x: 2272, y: 928 },
              { x: 2720, y: 1056 },
              { x: 3168, y: 1120 },
            ],
            radius: 84,
            timeLimitSeconds: 72,
          },
          {
            kind: 'survive',
            description: 'Hold the route collapse for 10 seconds while the guests spill into the street',
            seconds: 10,
          },
        ],
        reward: 5900,
      },
      prototypeScript: {
        primaryActorId: 'garden-party-crash-grid',
        actors: [],
        stages: [
          {
            id: 'garden-party-crash-cuts',
            title: 'Collapse the gala traffic pattern',
            districtState: {
              label: 'The donor blocks still depend on one smooth arrival choreography',
              summary:
                'Cut the route in the right order and the district has to reveal itself in plain sight.',
              trafficSpeedMultiplier: 0.7,
              serviceLaneBlocks: ['taxi'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'garden-party-crash-open',
            title: 'Keep the streets open',
            districtState: {
              label: 'The gala is on foot now and losing its private cover',
              summary:
                'Hold the collapse just long enough for the camera lines and witness traffic to catch the donor crowd outside the gates.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'silver-plate-run',
      title: 'Silver Plate Run',
      hook: 'A caterer van is carrying the guest records, but its value disappears if the disguise turns into a screaming chase.',
      primaryGoal:
        'Steal the caterer van and cross the district checkpoints before the guest list is flagged and voided.',
      secondaryPressure:
        'The run should reward staying plausible under scrutiny instead of smashing through every gate.',
      failureState: 'Fail if the guest list is voided before the van clears the district.',
      payoff:
        'The records identify the patron whose estates are absorbing the city\'s diverted rescue cover.',
      requiredSystems: ['stealth', 'deliver', 'districtState'],
      prototypeRuntime: {
        id: 'silver-plate-run',
        title: 'Silver Plate Run',
        objectives: [
          {
            kind: 'route',
            description: 'Drive the caterer van through the 3 district checkpoints before the list is voided',
            targets: [
              { x: 2816, y: 1152 },
              { x: 3072, y: 1216 },
              { x: 3328, y: 1280 },
            ],
            radius: 84,
            timeLimitSeconds: 76,
          },
          {
            kind: 'survive',
            description: 'Keep the disguise intact for 8 seconds past the final gate',
            seconds: 8,
          },
        ],
        reward: 6200,
      },
      prototypeScript: createWantedPressureMissionScript({
        id: 'silver-plate-run-cover',
        title: 'Keep the caterer cover intact',
        label: 'The van still reads as part of the gala service flow',
        summary:
          'A full security read voids the guest list instantly, so the route only works while the disguise still holds.',
        minStars: 2,
        failureText: 'The guest list was voided once the caterer cover burned.',
        trafficSpeedMultiplier: 0.78,
        wantedPressureBonus: 1,
      }),
    },
    {
      id: 'iron-gate',
      title: 'Iron Gate',
      hook: 'Three estate gates have to open together or the protest convoy gets bottled up and buried as another trespass story.',
      primaryGoal:
        'Open the estate gates in sequence and keep the corridor open long enough for the convoy cameras to enter.',
      secondaryPressure:
        'This should feel like synchronized map control, not just a checkpoint sprint.',
      failureState: 'Fail if the gates are re-locked before the protest convoy clears the corridor.',
      payoff:
        'The convoy gets its footage and drives the district patron out onto the ornamental roads in a panic.',
      requiredSystems: ['defend', 'districtState'],
      prototypeRuntime: {
        id: 'iron-gate',
        title: 'Iron Gate',
        objectives: [
          {
            kind: 'route',
            description: 'Open the 3 estate gates before the corridor reseals',
            targets: [
              { x: 3136, y: 1728 },
              { x: 3456, y: 1856 },
              { x: 3520, y: 640 },
            ],
            radius: 84,
            timeLimitSeconds: 74,
          },
          {
            kind: 'defend',
            description: 'Hold the convoy corridor for 14 seconds while the cameras roll in',
            target: { x: 3520, y: 640 },
            radius: 124,
            seconds: 14,
          },
        ],
        reward: 6600,
      },
      prototypeScript: {
        primaryActorId: 'iron-gate-corridor',
        actors: [],
        stages: [
          {
            id: 'iron-gate-open',
            title: 'Open the estate gates',
            districtState: {
              label: 'The estate corridor is still a chain of private choke points',
              summary:
                'Open the gates in order before the donor district can rebrand the protest convoy as another isolated riot.',
              trafficSpeedMultiplier: 0.72,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'iron-gate-hold',
            title: 'Keep the corridor open',
            districtState: {
              label: 'The corridor is open but the estates are trying to pinch it shut again',
              summary:
                'Hold the lane long enough for the footage to get in and turn the private district into a public crime scene.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police', 'tow'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'glass-lawns',
      title: 'Glass Lawns',
      hook: 'The patron is running for a hidden bunker entrance through ornamental roads that were never built for a real chase.',
      primaryGoal:
        'Stay on the patron limo through the garden roads, then pin it before the bunker entrance seals behind it.',
      secondaryPressure:
        'The chase should feel stylized and brittle, with dead ends and decorative lanes doing as much work as the target car.',
      failureState: 'Fail if the patron reaches the bunker entrance before the limo is pinned.',
      payoff:
        'The district patron goes down in public view, and the rich blocks lose the private fiction that kept them untouchable.',
      requiredSystems: ['tail', 'capture', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'glass-lawns',
        title: 'Glass Lawns',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay on the patron limo through the ornamental road maze for 12 seconds',
            seconds: 12,
          },
          {
            kind: 'capture',
            description: 'Pin the patron limo for 3 seconds before the bunker gate seals',
            seconds: 3,
          },
        ],
        reward: 7400,
      },
      prototypeScript: {
        primaryActorId: 'glass-lawns-limo',
        actors: [],
        stages: [
          {
            id: 'glass-lawns-tail',
            title: 'Track the patron through the estate roads',
            primaryActorId: 'glass-lawns-limo',
            districtState: {
              label: 'The ornamental roads still favor the fleeing patron',
              summary:
                'Stay close enough to read the route before the estate dead ends turn the chase into another vanished witness.',
              trafficSpeedMultiplier: 0.82,
            },
            actors: [
              vehicleRouteActor(
                'glass-lawns-limo',
                'sedan',
                [
                  { x: 2816, y: 1152 },
                  { x: 3072, y: 1216 },
                  { x: 3328, y: 1280 },
                  { x: 3520, y: 640 },
                ],
                104,
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
            id: 'glass-lawns-pin',
            title: 'Pin the patron before the bunker gate seals',
            primaryActorId: 'glass-lawns-limo',
            districtState: {
              label: 'The bunker entrance is in sight and the estate roads are running out',
              summary:
                'Hold the limo still now or the patron disappears into another bought shelter with the truth in hand.',
              trafficSpeedMultiplier: 0.78,
              serviceLaneBlocks: ['police'],
            },
            actors: [
              vehicleRouteActor(
                'glass-lawns-limo',
                'sedan',
                [
                  { x: 3328, y: 1280 },
                  { x: 3456, y: 1856 },
                  { x: 3520, y: 640 },
                ],
                96,
                {
                  followRadius: 320,
                  captureRadius: 135,
                  captureMaxSpeed: 65,
                  tailDrainPerSecond: 2,
                  loseGraceSeconds: 2.5,
                },
              ),
            ],
          },
        ],
      },
    },
  ],
};