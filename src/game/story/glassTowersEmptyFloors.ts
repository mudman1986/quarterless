import {
  createEscortMissionScript,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const GLASS_TOWERS_EMPTY_FLOORS: StoryChapter = {
  id: 'glass-towers-empty-floors',
  actId: 'court-the-citys-middle-powers',
  order: 3,
  title: 'Glass Towers, Empty Floors',
  storyRole:
    'Corporate property managers are using staged accidents to depress district prices before buying them up.',
  combinedGoal:
    'Turn the courier evidence into a property-fraud case, expose the staged-collapse routes, and hit the transaction archive before the brokers can bury it.',
  missionGroups: [
    ['tenant-warning'],
    ['window-tax', 'lobby-flood'],
    ['fire-sale-run'],
    ['vacancy-notice'],
  ],
  missions: [
    {
      id: 'tenant-warning',
      title: 'Tenant Warning',
      hook: 'Three tenant leaders still need the evidence before the private security sweep reaches them.',
      primaryGoal:
        'Reach the tenant warning route in order and deliver the evidence before the sweep closes the blocks.',
      secondaryPressure:
        'The route should feel like you are outrunning a pressure wave, not just collecting objectives.',
      failureState: 'Fail if the warning route times out before the last leader is reached.',
      payoff: 'The tenants reveal which generator nodes are being used to fake the next outage.',
      prototypeRuntime: {
        id: 'tenant-warning',
        title: 'Tenant Warning',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the tenant leaders before the sweep closes the blocks',
            targets: [
              { x: 1024, y: 960 },
              { x: 1536, y: 1024 },
              { x: 2048, y: 1088 },
            ],
            radius: 84,
            timeLimitSeconds: 75,
          },
        ],
        reward: 4200,
      },
    },
    {
      id: 'window-tax',
      title: 'Window Tax',
      hook: 'The outage pattern is being managed from maintenance vans that never stop in the same place twice.',
      primaryGoal:
        'Track the maintenance route and hold the vans long enough to expose the generator order.',
      secondaryPressure:
        'The route should feel like corporate choreography rather than gang panic.',
      failureState:
        'Fail if the maintenance route disappears before the generator order is captured.',
      payoff:
        'Rook learns exactly which tower will be used to flush the broker into the underground garage meet.',
      prototypeRuntime: {
        id: 'window-tax',
        title: 'Window Tax',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay on the maintenance route until the generator order is exposed',
            seconds: 11,
          },
        ],
        reward: 4500,
      },
      prototypeScript: {
        primaryActorId: 'maintenance-van',
        actors: [],
        stages: [
          {
            id: 'maintenance-loop',
            title: 'Stay on the maintenance van',
            primaryActorId: 'maintenance-van',
            districtState: {
              label: 'The maintenance crew is still writing the outage order in motion',
              summary:
                'A second van is shadowing the route to scramble the order if you drift too far back.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'maintenance-van',
                vehicleKind: 'van',
                route: [
                  { x: 2240, y: 1216 },
                  { x: 2624, y: 1280 },
                  { x: 2944, y: 1280 },
                ],
                speed: 105,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
              {
                kind: 'vehicleRoute',
                actorId: 'decoy-maintenance-van',
                vehicleKind: 'pickup',
                route: [
                  { x: 2176, y: 1152 },
                  { x: 2496, y: 1216 },
                  { x: 2880, y: 1216 },
                ],
                speed: 101,
                followRadius: 220,
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'maintenance-van' },
          },
          {
            id: 'generator-order-exit',
            title: 'Confirm the generator order',
            primaryActorId: 'order-runner',
            districtState: {
              label: 'The order runner is carrying the final generator sequence',
              summary:
                'Stay close until the runner reaches the tower lane with the true outage order.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'order-runner',
                vehicleKind: 'sedan',
                route: [
                  { x: 2944, y: 1280 },
                  { x: 3264, y: 1344 },
                  { x: 3520, y: 1472 },
                ],
                speed: 118,
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
      id: 'lobby-flood',
      title: 'Lobby Flood',
      hook: 'The broker only leaves the tower if the sprinkler panic hits the right floor at the right time.',
      primaryGoal: 'Clear the panic route and force the broker into the garage exit lane.',
      secondaryPressure:
        'The player should feel like the trap is being built step by step instead of sprung all at once.',
      failureState: 'Fail if the broker route slips free before the garage lane is forced shut.',
      payoff:
        'The broker is pushed into the forged-deeds convoy that carries the transaction archive.',
      prototypeRuntime: {
        id: 'lobby-flood',
        title: 'Lobby Flood',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the garage exit lane before the broker escapes',
            target: { x: 3456, y: 1536 },
            radius: 88,
          },
          {
            kind: 'capture',
            description: 'Hold the broker lane long enough to force the garage lock',
            seconds: 3,
          },
        ],
        reward: 4800,
      },
    },
    {
      id: 'fire-sale-run',
      title: 'Fire Sale Run',
      hook: 'The forged deeds are moving in a box truck that must not be destroyed before the archive reaches the press.',
      primaryGoal:
        'Escort the archive truck through the district until it reaches the press lane alive.',
      secondaryPressure: 'The route should force active protection instead of just staying nearby.',
      failureState: 'Fail if the archive truck falls outside the safe lane too long.',
      payoff: 'Rook turns the forged deeds into proof of the district-level property play.',
      prototypeRuntime: {
        id: 'fire-sale-run',
        title: 'Fire Sale Run',
        objectives: [
          {
            kind: 'survive',
            description: 'Keep the archive truck moving for 18 seconds',
            seconds: 18,
          },
        ],
        reward: 5200,
      },
      prototypeScript: createEscortMissionScript({
        actorId: 'archive-truck',
        route: [
          { x: 3648, y: 1728 },
          { x: 3328, y: 1984 },
          { x: 3008, y: 2176 },
        ],
        speed: 42,
        failureText: 'The archive truck slipped out of the safe press lane.',
      }),
    },
    {
      id: 'vacancy-notice',
      title: 'Vacancy Notice',
      hook: 'The transaction archive is moving to the half-built tower where the whole district play was planned.',
      primaryGoal:
        'Reach the half-built tower and hold the archive lane long enough to drag the full transaction file into the open.',
      secondaryPressure:
        'The ending should feel like a public reveal climbing into the skyline, not another street skirmish.',
      failureState: 'Fail if the tower archive lane breaks before the transaction file is exposed.',
      payoff:
        'Rook and the tenant bloc force the first public corporate fracture in the Switchboard coalition.',
      prototypeRuntime: {
        id: 'vacancy-notice',
        title: 'Vacancy Notice',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the half-built tower archive lane before the convoy seals it',
            target: { x: 3904, y: 2368 },
            radius: 88,
          },
          {
            kind: 'survive',
            description: 'Hold the archive lane for 20 seconds',
            seconds: 20,
          },
        ],
        reward: 5800,
      },
    },
  ],
};
