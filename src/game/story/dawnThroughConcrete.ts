import { createEscortMissionScript } from './storyMode';
import type { StoryChapter } from './storyMode';

export const DAWN_THROUGH_CONCRETE: StoryChapter = {
  id: 'dawn-through-concrete',
  actId: 'break-the-four-pillars',
  order: 6,
  title: 'Dawn Through Concrete',
  storyRole:
    'Rook reaches Nia at last, tears into the Switchboard core, and forces the city to decide what survives after the machine that monetized movement is broken open.',
  combinedGoal:
    'Breach the hidden facility, bring Nia out alive, stop the failsafe destruction routes, and survive the collapse long enough to leave the city with its truth intact.',
  presentation: {
    opener: {
      speaker: 'Rook Vance',
      role: 'Driving toward first light',
      kicker: 'Dawn After The Switchboard',
    },
  },
  missions: [
    {
      id: 'breach-window',
      title: 'Breach Window',
      hook: 'The facility can only be reached through access lanes being opened in sequence by every ally Rook managed to keep alive.',
      primaryGoal:
        'Hit the ally-opened access routes in order before the breach window collapses behind them.',
      secondaryPressure:
        'The opening should feel like a culmination of allies and route discipline, not a generic last-minute sprint.',
      failureState: 'Fail if the breach sequence closes before the facility is reached.',
      payoff:
        'Rook breaks into the hidden Switchboard facility and finally reaches the level where Nia is being held.',
      requiredSystems: ['districtState'],
      prototypeRuntime: {
        id: 'breach-window',
        title: 'Breach Window',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the 4 ally-opened access lanes before the breach window shuts',
            targets: [
              { x: 704, y: 768 },
              { x: 1984, y: 704 },
              { x: 3072, y: 1600 },
              { x: 3520, y: 640 },
            ],
            radius: 88,
            timeLimitSeconds: 88,
          },
        ],
        reward: 9000,
      },
      prototypeScript: {
        primaryActorId: 'breach-window-grid',
        actors: [],
        stages: [
          {
            id: 'breach-window-route',
            title: 'Ride the allied breach sequence',
            districtState: {
              label: 'The city is opening the facility lane in pieces and only for a moment',
              summary:
                'Every ally earns you one more gate; miss the sequence and the core goes back underground with Nia inside it.',
              blackoutIntersections: true,
              trafficSpeedMultiplier: 0.66,
              suppressNpcDriving: true,
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'live-wire',
      title: 'Live Wire',
      hook: 'Nia can still unlock the blast doors, but only if she is kept alive while the facility keeps adapting to every reroute she forces.',
      primaryGoal:
        'Escort Nia through the server plant and keep her moving until the blast-door chain finally opens a way out.',
      secondaryPressure:
        'The rescue should feel intimate and dangerous, not like a generic VIP walk after twenty-three chapters of buildup.',
      failureState: 'Fail if Nia is cut off before the blast-door chain is cleared.',
      payoff:
        'Rook gets Nia moving and learns how many backup sites the Board intends to burn on the way down.',
      requiredSystems: ['escort', 'districtState'],
      prototypeRuntime: {
        id: 'live-wire',
        title: 'Live Wire',
        objectives: [
          {
            kind: 'route',
            description: 'Clear the 3 blast-door junctions with Nia alive',
            targets: [
              { x: 3136, y: 2560 },
              { x: 2880, y: 2816 },
              { x: 2368, y: 3136 },
            ],
            radius: 88,
            timeLimitSeconds: 84,
          },
          {
            kind: 'survive',
            description: 'Keep Nia moving for 12 seconds while the last blast door opens',
            seconds: 12,
          },
        ],
        reward: 9600,
      },
      prototypeScript: createEscortMissionScript({
        actorId: 'live-wire-nia',
        route: [
          { x: 3136, y: 2560 },
          { x: 2880, y: 2816 },
          { x: 2624, y: 3008 },
          { x: 2368, y: 3136 },
        ],
        speed: 38,
        failureText: 'Nia was cut off before the blast-door chain cleared.',
      }),
    },
    {
      id: 'failsafe-fleet',
      title: 'Failsafe Fleet',
      hook: 'Three destruction convoys are running for backup sites that will let the Board survive the core\'s collapse if even one gets through.',
      primaryGoal:
        'Hit the three backup-site intercepts in order and stop the failsafe fleet before the surviving backups go dark.',
      secondaryPressure:
        'The pressure should come from priority and route order, not from flattening every vehicle on the map.',
      failureState: 'Fail if the backup sites survive long enough for the Board to keep a clean copy of itself.',
      payoff:
        'The Board loses its clean backups and the core room becomes the final place it can still fight from.',
      requiredSystems: ['timedMultiStop', 'districtState'],
      prototypeRuntime: {
        id: 'failsafe-fleet',
        title: 'Failsafe Fleet',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the 3 backup-site intercepts before the failsafe fleet goes dark',
            targets: [
              { x: 2272, y: 928 },
              { x: 3168, y: 1120 },
              { x: 3456, y: 2624 },
            ],
            radius: 88,
            timeLimitSeconds: 80,
          },
          {
            kind: 'sabotage',
            description: 'Destroy the 3 backup relays before any clean copy survives',
            targets: [
              { x: 3328, y: 2496 },
              { x: 3520, y: 2432 },
              { x: 3648, y: 2624 },
            ],
            radius: 84,
            timeLimitSeconds: 70,
          },
        ],
        reward: 10200,
      },
      prototypeScript: {
        primaryActorId: 'failsafe-fleet-grid',
        actors: [],
        stages: [
          {
            id: 'failsafe-fleet-route',
            title: 'Beat the destruction convoys to the backups',
            districtState: {
              label: 'The Board is trying to survive its own collapse by scattering clean copies across the city',
              summary:
                'Choose the order correctly and the fleet dies in pieces; choose wrong and the Board escapes through a backup it already paid for.',
              trafficSpeedMultiplier: 0.68,
              blackoutIntersections: true,
              suppressNpcDriving: true,
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'failsafe-fleet-burn',
            title: 'Kill the surviving backups',
            districtState: {
              label: 'Only the backup relays are keeping the Board from dying with the core',
              summary:
                'Destroy the relays and the machine is finally trapped inside one failing room instead of a distributed lie.',
              suppressNpcDriving: true,
              serviceLaneBlocks: ['police', 'ambulance', 'tow'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'heartbeat-zero',
      title: 'Heartbeat Zero',
      hook: 'The core room is trying to kill itself, flood itself, and bury everyone inside it before the full evidence upload can finish.',
      primaryGoal:
        'Reach the core room, hold it while the evidence uploads, and survive the layered failure cascade around it.',
      secondaryPressure:
        'This should feel like the final defense against a machine trying every last systemic trick at once.',
      failureState: 'Fail if the evidence upload dies before the core can be fully exposed.',
      payoff:
        'The Switchboard core is mortally exposed and the Board loses its last private refuge.',
      requiredSystems: ['defend', 'districtState'],
      prototypeRuntime: {
        id: 'heartbeat-zero',
        title: 'Heartbeat Zero',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the core room before the last seal closes',
            target: { x: 3520, y: 640 },
            radius: 88,
          },
          {
            kind: 'defend',
            description: 'Hold the core room for 20 seconds while the evidence uploads',
            target: { x: 3520, y: 640 },
            radius: 124,
            seconds: 20,
          },
          {
            kind: 'survive',
            description: 'Survive the layered failure cascade for 15 seconds',
            seconds: 15,
          },
        ],
        reward: 11200,
      },
      prototypeScript: {
        primaryActorId: 'heartbeat-zero-core',
        actors: [],
        stages: [
          {
            id: 'heartbeat-zero-entry',
            title: 'Break into the core room',
            districtState: {
              label: 'The core still believes one last seal can keep the city from seeing itself clearly',
              summary:
                'Reach the room before the final seal makes the truth die in the same dark it profited from.',
              trafficSpeedMultiplier: 0.66,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'heartbeat-zero-hold',
            title: 'Hold the core while the upload runs',
            districtState: {
              label: 'The core room is failing by design now that the evidence is moving',
              summary:
                'Keep the upload alive through blackout, flood pressure, and sealed exits all trying to do the same final job.',
              suppressNpcDriving: true,
              wantedPressureBonus: 2,
              blackoutIntersections: true,
              serviceLaneBlocks: ['police', 'ambulance', 'tow'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 2 },
          },
          {
            id: 'heartbeat-zero-cascade',
            title: 'Survive the collapse',
            districtState: {
              label: 'The machine is breaking and trying to take the room with it',
              summary:
                'The upload is alive; now live through the last systemic thrash of the core you came to destroy.',
              suppressNpcDriving: true,
              trafficSpeedMultiplier: 0.54,
              serviceLaneBlocks: ['police', 'ambulance', 'tow'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'first-light-exit',
      title: 'First Light Exit',
      hook: 'The facility is collapsing around Rook and Nia, but the city outside still needs the truth to make it into morning alive.',
      primaryGoal:
        'Run the final escape checkpoints and stay alive long enough to leave the collapsing facility with the evidence intact.',
      secondaryPressure:
        'The ending should feel like survival into aftermath, not a final boss room wearing a car chase skin.',
      failureState: 'Fail if the facility crushes the escape route before Rook and Nia clear it.',
      payoff:
        'Rook and Nia drive into a city that will survive without the Switchboard, even if it will never be the same again.',
      requiredSystems: ['districtState'],
      prototypeRuntime: {
        id: 'first-light-exit',
        title: 'First Light Exit',
        objectives: [
          {
            kind: 'route',
            description: 'Clear the 3 collapsing-facility checkpoints before the exit caves in',
            targets: [
              { x: 3168, y: 1120 },
              { x: 3616, y: 992 },
              { x: 4064, y: 928 },
            ],
            radius: 88,
            timeLimitSeconds: 78,
          },
          {
            kind: 'survive',
            description: 'Stay alive for 15 seconds while the city takes the evidence into morning',
            seconds: 15,
          },
        ],
        reward: 12000,
      },
      prototypeScript: {
        primaryActorId: 'first-light-exit-route',
        actors: [],
        stages: [
          {
            id: 'first-light-exit-run',
            title: 'Get out before the facility dies behind you',
            districtState: {
              label: 'The Switchboard is collapsing and taking its clean escape routes with it',
              summary:
                'Make the run now and the city gets the truth with you; wait and the machine buries itself with its last witnesses.',
              blackoutIntersections: true,
              trafficSpeedMultiplier: 0.6,
              suppressNpcDriving: true,
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'first-light-exit-afterglow',
            title: 'Drive into morning',
            districtState: {
              label: 'The facility is dead but the city is still deciding what to become next',
              summary:
                'Stay alive a little longer and the first morning without the Switchboard belongs to the people who endured it, not the machine that sold it.',
              blackoutIntersections: true,
              trafficSpeedMultiplier: 0.56,
              serviceLaneBlocks: ['police', 'ambulance', 'tow'],
            },
            actors: [],
          },
        ],
      },
    },
  ],
};