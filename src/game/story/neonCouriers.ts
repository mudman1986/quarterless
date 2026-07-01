import {
  createEscortMissionScript,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const NEON_COURIERS: StoryChapter = {
  id: 'neon-couriers',
  actId: 'court-the-citys-middle-powers',
  order: 2,
  title: 'Neon Couriers',
  storyRole:
    'Street racers and courier crews know how to move through the city faster than official systems do.',
  combinedGoal:
    'Win over the courier crews, learn how the Switchboard routes around surveillance, and steal the tape that maps the fast lanes no official dispatcher admits exist.',
  missionGroups: [['signal-sprint'], ['drop-stack', 'blind-corner'], ['rival-tape'], ['lamps-out']],
  missions: [
    {
      id: 'signal-sprint',
      title: 'Signal Sprint',
      hook: 'The couriers trust route memory more than bravado.',
      primaryGoal:
        'Clear the courier sprint route ahead of the rival team to prove Rook knows the fast lanes.',
      secondaryPressure: 'The route should reward clean pathing rather than raw top speed.',
      failureState: 'Fail if the courier route times out before Rook clears every sprint gate.',
      payoff:
        'The crews admit Rook can read the city fast enough to learn their dead-drop network.',
      prototypeRuntime: {
        id: 'signal-sprint',
        title: 'Signal Sprint',
        objectives: [
          {
            kind: 'route',
            description: 'Clear the courier sprint route ahead of the rival team',
            targets: [
              { x: 960, y: 1984 },
              { x: 1472, y: 1856 },
              { x: 1984, y: 1792 },
              { x: 2496, y: 1728 },
            ],
            radius: 84,
            timeLimitSeconds: 70,
          },
        ],
        reward: 4000,
      },
    },
    {
      id: 'drop-stack',
      title: 'Drop Stack',
      hook: 'Every delivered package changes the patrol map for the next one.',
      primaryGoal:
        'Hit the dead-drop stack in the right order before the route closes behind the crew.',
      secondaryPressure:
        'The route should feel like a changing traffic puzzle, not a static collect chain.',
      failureState: 'Fail if the stack route times out before the last package lane is reached.',
      payoff: 'Rook learns which courier routes pass under the surveillance grid unnoticed.',
      prototypeRuntime: {
        id: 'drop-stack',
        title: 'Drop Stack',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the courier dead drops in sequence before the route closes',
            targets: [
              { x: 2752, y: 1664 },
              { x: 3264, y: 1600 },
              { x: 3776, y: 1536 },
            ],
            radius: 84,
            timeLimitSeconds: 80,
          },
        ],
        reward: 4300,
      },
    },
    {
      id: 'blind-corner',
      title: 'Blind Corner',
      hook: 'One passenger still knows which roads cameras cannot quite see.',
      primaryGoal:
        'Escort the blind-corner guide through the surveillance gaps long enough to map the safe route.',
      secondaryPressure:
        'The player should feel pressure to keep the guide close without drifting out of escort range.',
      failureState: 'Fail if the guide is left outside the moving safe lane for too long.',
      payoff: "The guide points Rook to the crew carrying the producer's tape.",
      prototypeRuntime: {
        id: 'blind-corner',
        title: 'Blind Corner',
        objectives: [
          {
            kind: 'survive',
            description: 'Keep the guide moving through the blind-corner route for 16 seconds',
            seconds: 16,
          },
        ],
        reward: 4600,
      },
      prototypeScript: createEscortMissionScript({
        actorId: 'blind-corner-guide',
        route: [
          { x: 3712, y: 1792 },
          { x: 3520, y: 2048 },
          { x: 3200, y: 2240 },
        ],
        speed: 44,
        failureText: 'The guide slipped out of the safe blind-corner lane.',
      }),
    },
    {
      id: 'rival-tape',
      title: 'Rival Tape',
      hook: 'The tape is changing vehicles in the middle of the boulevard rush.',
      primaryGoal:
        'Stay on the tape route through the courier handoff until the decoder safehouse is identified.',
      secondaryPressure:
        'The route should escalate through one handoff rather than one long straight tail.',
      failureState:
        'Fail if the tape handoff is lost before the decoder car reaches the safehouse line.',
      payoff:
        'Rook now knows where the producer is cutting the dispatch evidence loose from the network.',
      prototypeRuntime: {
        id: 'rival-tape',
        title: 'Rival Tape',
        objectives: [{ kind: 'tail', description: 'Stay on the tape handoff route', seconds: 12 }],
        reward: 5000,
      },
      prototypeScript: {
        primaryActorId: 'bike-runner',
        stages: [
          {
            id: 'bike-run',
            title: 'Track The Bike Runner',
            primaryActorId: 'bike-runner',
            districtState: {
              label: 'Courier Relay',
              summary: 'The tape is still with the bike runner threading the boulevard.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'bike-runner',
                vehicleKind: 'sports',
                route: [
                  { x: 2944, y: 2368 },
                  { x: 3328, y: 2368 },
                  { x: 3648, y: 2240 },
                ],
                speed: 125,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'bike-runner' },
          },
          {
            id: 'decoder-handoff',
            title: 'Stay On The Decoder Car',
            primaryActorId: 'decoder-coupe',
            districtState: {
              label: 'Decoder Handoff',
              summary: 'The tape has moved into the decoder car headed for the safehouse.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'decoder-coupe',
                vehicleKind: 'coupe',
                route: [
                  { x: 3648, y: 2240 },
                  { x: 3904, y: 1984 },
                  { x: 4032, y: 1728 },
                ],
                speed: 120,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
          },
        ],
        actors: [],
      },
    },
    {
      id: 'lamps-out',
      title: 'Lamps Out',
      hook: 'The couriers can move unseen only if the boulevard festival falls dark in the right order.',
      primaryGoal:
        'Reach the power vans in sequence and hold the blackout long enough for the courier sweep to pass.',
      secondaryPressure:
        'The route should feel like orchestrated disruption instead of another random destruction spree.',
      failureState:
        'Fail if the blackout order breaks before the courier sweep clears the boulevard.',
      payoff:
        'The crews become willing allies and point Rook toward the property managers working with the Switchboard.',
      prototypeRuntime: {
        id: 'lamps-out',
        title: 'Lamps Out',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the power vans in the blackout order',
            targets: [
              { x: 3904, y: 1536 },
              { x: 3456, y: 1472 },
              { x: 3008, y: 1408 },
            ],
            radius: 84,
            timeLimitSeconds: 75,
          },
          {
            kind: 'survive',
            description: 'Keep the boulevard dark for 12 seconds',
            seconds: 12,
          },
        ],
        reward: 5400,
      },
      prototypeScript: {
        primaryActorId: 'lamps-out-blackout-grid',
        actors: [],
        stages: [
          {
            id: 'lamps-out-blackout-grid',
            title: 'Hold the blackout',
            districtState: {
              label: 'The boulevard blackout is choking traffic flow',
              summary:
                'Dark intersections are slowing the avenue to a crawl while the courier sweep threads the stalled lanes.',
              trafficSpeedMultiplier: 0.45,
              suppressNpcDriving: true,
              serviceLaneBlocks: ['taxi'],
            },
            actors: [],
          },
        ],
      },
    },
  ],
};
