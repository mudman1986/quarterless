import {
  createEscortMissionScript,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const FREIGHT_UNION_MORNING: StoryChapter = {
  id: 'freight-union-morning',
  actId: 'court-the-citys-middle-powers',
  order: 1,
  title: 'Freight Union Morning',
  storyRole:
    'Rook approaches the dock freight union, which hates the Switchboard because rerouted inspections are crushing independent shipping.',
  combinedGoal:
    "Win the freight union's trust, protect their routes long enough to expose the manipulated shipping manifests, and convert them into the first major ally bloc of Act II.",
  missionGroups: [
    ['union-test-run'],
    ['picket-line-breaker', 'harbor-echo'],
    ['crane-jam'],
    ['the-long-manifest'],
  ],
  missions: [
    {
      id: 'union-test-run',
      title: 'Union Test Run',
      hook: 'The dock crews do not trust anyone who cannot move a load without wrecking the line.',
      primaryGoal:
        'Reach the cargo route in order and prove Rook can keep a union haul moving across the harbor lanes.',
      secondaryPressure: 'The route should feel heavy and deliberate, not just fast.',
      failureState: 'Fail if the load route collapses before the convoy clears the harbor strip.',
      payoff: 'The union agrees to share the first falsified manifest route.',
      prototypeRuntime: {
        id: 'union-test-run',
        title: 'Union Test Run',
        objectives: [
          {
            kind: 'route',
            description: 'Follow the harbor haul route through all 3 cargo lanes',
            targets: [
              { x: 896, y: 3520 },
              { x: 1600, y: 3520 },
              { x: 2304, y: 3456 },
            ],
            radius: 88,
            timeLimitSeconds: 90,
          },
        ],
        reward: 3800,
      },
    },
    {
      id: 'picket-line-breaker',
      title: 'Picket Line Breaker',
      hook: 'The strike route is being peeled apart by hired blockers before the morning convoy can leave the harbor.',
      primaryGoal:
        "Reach the strike corridor and clear the blocker line without losing the workers' route.",
      secondaryPressure: 'The route should feel like selective pressure, not just a body count.',
      failureState: 'Fail if the strike corridor is broken before the workers clear it.',
      payoff:
        'The dock crews open the gate to the moving ferry convoy carrying the forged customs tags.',
      prototypeRuntime: {
        id: 'picket-line-breaker',
        title: 'Picket Line Breaker',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the strike corridor before the blockers scatter the line',
            target: { x: 2432, y: 3392 },
            radius: 88,
          },
          {
            kind: 'eliminate',
            description: 'Take down 4 marked blockers',
            count: 4,
            targetsOnly: true,
          },
        ],
        reward: 4100,
      },
      prototypeScript: {
        primaryActorId: 'picket-blockers',
        actors: [
          {
            kind: 'pedestrianSquad',
            actorId: 'picket-blockers',
            center: { x: 2432, y: 3392 },
            count: 4,
            spread: 22,
            missionTargets: true,
          },
        ],
      },
    },
    {
      id: 'harbor-echo',
      title: 'Harbor Echo',
      hook: 'The forged customs tags are moving across a ferry convoy where every deck hand answers to someone else.',
      primaryGoal:
        'Stay on the ferry convoy through the harbor handoff long enough to identify the crate carrying the false manifest.',
      secondaryPressure:
        'The convoy should feel like a layered moving route instead of one more city tail.',
      failureState:
        'Fail if the convoy handoff is lost before the forged-crate route is identified.',
      payoff:
        'Rook learns which crane lane will be used to trap the enemy convoy in the next strike.',
      prototypeRuntime: {
        id: 'harbor-echo',
        title: 'Harbor Echo',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay on the ferry convoy through the harbor handoff',
            seconds: 12,
          },
        ],
        reward: 4500,
      },
      prototypeScript: {
        primaryActorId: 'ferry-lead-truck',
        stages: [
          {
            id: 'dock-approach',
            title: 'Track The Lead Truck',
            primaryActorId: 'ferry-lead-truck',
            districtState: {
              label: 'Harbor Approach',
              summary: 'The convoy is still rolling under the dock cranes.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'ferry-lead-truck',
                vehicleKind: 'pickup',
                route: [
                  { x: 2752, y: 3520 },
                  { x: 3200, y: 3520 },
                  { x: 3584, y: 3392 },
                ],
                speed: 110,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'ferry-lead-truck' },
          },
          {
            id: 'ferry-handoff',
            title: 'Stay On The Crate Car',
            primaryActorId: 'crate-sedan',
            districtState: {
              label: 'Ferry Handoff',
              summary: 'The forged tags have moved to a smaller car inside the yard lanes.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'crate-sedan',
                vehicleKind: 'sedan',
                route: [
                  { x: 3584, y: 3392 },
                  { x: 3840, y: 3136 },
                  { x: 3968, y: 2880 },
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
      id: 'crane-jam',
      title: 'Crane Jam',
      hook: 'The union finally has one shot to pin the enemy convoy in the loading lane.',
      primaryGoal:
        'Reach the crane lane and hold the trap long enough for the convoy to lock in place.',
      secondaryPressure:
        'The player should feel like the trap is closing around a moving target instead of just defending a point.',
      failureState: 'Fail if the trap lane is lost before the convoy locks in.',
      payoff:
        'The trapped convoy confirms the forged manifest route and gives the union something worth broadcasting.',
      prototypeRuntime: {
        id: 'crane-jam',
        title: 'Crane Jam',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the crane lane before the convoy slips the trap',
            target: { x: 3840, y: 2624 },
            radius: 88,
          },
          {
            kind: 'defend',
            description: 'Hold the trap lane for 14 seconds',
            target: { x: 3840, y: 2624 },
            radius: 120,
            seconds: 14,
          },
        ],
        reward: 4700,
      },
    },
    {
      id: 'the-long-manifest',
      title: 'The Long Manifest',
      hook: 'The union leader will finally go public if Rook can keep the rolling ambush from killing the broadcast.',
      primaryGoal:
        'Escort the union leader across the harbor route and keep them inside the lane until the manifesto hits the air.',
      secondaryPressure:
        'This should feel like protecting a live route under pressure, not just surviving near an NPC.',
      failureState:
        'Fail if the union leader is left behind or the broadcast lane breaks before the readout finishes.',
      payoff:
        'Act II opens with the freight union committed as the first major ally bloc against the Switchboard.',
      prototypeRuntime: {
        id: 'the-long-manifest',
        title: 'The Long Manifest',
        objectives: [
          {
            kind: 'survive',
            description: 'Keep the broadcast lane alive for 18 seconds',
            seconds: 18,
          },
        ],
        reward: 5400,
      },
      prototypeScript: createEscortMissionScript({
        actorId: 'union-leader',
        route: [
          { x: 3968, y: 2496 },
          { x: 3776, y: 2240 },
          { x: 3456, y: 2112 },
        ],
        speed: 42,
        failureText: 'The union leader was cut off before the broadcast lane held.',
      }),
    },
  ],
};
