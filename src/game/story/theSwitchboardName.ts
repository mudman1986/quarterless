import type { StoryChapter } from './storyMode';

export const THE_SWITCHBOARD_NAME: StoryChapter = {
  id: 'the-switchboard-name',
  actId: 'find-the-missing-dispatcher',
  order: 6,
  title: 'The Switchboard Name',
  storyRole:
    "The paper ledger finally reveals the hidden network's name and shows that multiple power blocs are feeding it.",
  combinedGoal:
    'Follow the first hard evidence trail into Switchboard infrastructure, survive the blackout response, and decrypt the first complete proof that the conspiracy is city-wide.',
  missionGroups: [
    ['dead-letter-branch'],
    ['relay-theft', 'blue-map-room'],
    ['four-minute-silence'],
    ['name-in-the-static'],
  ],
  missions: [
    {
      id: 'dead-letter-branch',
      title: 'Dead Letter Branch',
      hook: 'A shuttered post office still hides the lockers that once carried rerouted dispatch slips.',
      primaryGoal:
        'Reach the old branch and unlock the hidden locker sequence before the building is burned shut.',
      secondaryPressure:
        'The route should feel like a navigation puzzle under a live clock, not just another pickup chain.',
      failureState: 'Fail if the locker route times out before the final branch is opened.',
      payoff:
        'Rook finds the hardware route that links the post routes to the Switchboard courier lane.',
      prototypeRuntime: {
        id: 'dead-letter-branch',
        title: 'Dead Letter Branch',
        objectives: [
          {
            kind: 'route',
            description: 'Open the hidden locker route before the branch is torched',
            targets: [
              { x: 1024, y: 3328 },
              { x: 1536, y: 3264 },
              { x: 2048, y: 3200 },
            ],
            radius: 84,
            timeLimitSeconds: 80,
          },
        ],
        reward: 3600,
      },
    },
    {
      id: 'relay-theft',
      title: 'Relay Theft',
      hook: 'A courier van is moving switch hardware toward a handoff that no one outside the network is meant to see.',
      primaryGoal:
        'Stay on the courier route through the handoff and track the hardware long enough to identify the safehouse line.',
      secondaryPressure:
        'The route should escalate from one vehicle tail to a second-stage handoff instead of a single continuous chase.',
      failureState: 'Fail if the hardware route is lost before the second carrier is identified.',
      payoff:
        'Rook learns which blackout safehouse is decrypting the first complete Switchboard file.',
      prototypeRuntime: {
        id: 'relay-theft',
        title: 'Relay Theft',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay on the switch hardware handoff route',
            seconds: 14,
          },
        ],
        reward: 4100,
      },
      prototypeScript: {
        primaryActorId: 'switch-van',
        stages: [
          {
            id: 'switch-van-tail',
            title: 'Tail The Courier Van',
            primaryActorId: 'switch-van',
            districtState: {
              label: 'Courier Window',
              summary: 'The courier van is still inside the quiet route network.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'switch-van',
                vehicleKind: 'van',
                route: [
                  { x: 2240, y: 3264 },
                  { x: 2752, y: 3200 },
                  { x: 3264, y: 3136 },
                ],
                speed: 105,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'switch-van' },
          },
          {
            id: 'safehouse-handoff',
            title: 'Track The Handoff Car',
            primaryActorId: 'handoff-sedan',
            districtState: {
              label: 'Safehouse Handoff',
              summary: 'The hardware has changed cars and the route is burning down.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'handoff-sedan',
                vehicleKind: 'sedan',
                route: [
                  { x: 3264, y: 3136 },
                  { x: 3584, y: 2816 },
                  { x: 3712, y: 2432 },
                ],
                speed: 125,
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
      id: 'blue-map-room',
      title: 'Blue Map Room',
      hook: 'A city planner is moving street-closure blueprints that can expose how the blackouts are staged.',
      primaryGoal:
        'Reach the blue-map archive route and force the planner to abandon the escape corridor.',
      secondaryPressure:
        'Rook should feel like the route is closing piece by piece instead of just fighting a static room.',
      failureState:
        "Fail if the planner's archive route is lost before the corridor is forced shut.",
      payoff:
        'The blueprints show how one district can be cut off from emergency routes on command.',
      prototypeRuntime: {
        id: 'blue-map-room',
        title: 'Blue Map Room',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the blue-map archive room before the planner escapes',
            target: { x: 3584, y: 2240 },
            radius: 88,
          },
          {
            kind: 'capture',
            description: 'Hold the planner route at the archive long enough to force a stop',
            seconds: 3,
          },
        ],
        reward: 4300,
      },
    },
    {
      id: 'four-minute-silence',
      title: 'Four Minute Silence',
      hook: 'The district goes black at once, and the city keeps moving only where the Switchboard allows it.',
      primaryGoal:
        'Survive the blackout window and keep the route alive long enough to reach the rooftop decrypt lane.',
      secondaryPressure: 'The city itself should feel unstable instead of simply more crowded.',
      failureState: 'Fail if the blackout response overwhelms the route before the window closes.',
      payoff: 'Rook sees what a district looks like when every response lane is sold off at once.',
      requiredSystems: ['districtState'],
      prototypeRuntime: {
        id: 'four-minute-silence',
        title: 'Four Minute Silence',
        objectives: [
          {
            kind: 'survive',
            description: 'Survive the blackout district for 18 seconds',
            seconds: 18,
          },
        ],
        reward: 4600,
      },
      prototypeScript: {
        primaryActorId: 'blackout-window',
        actors: [],
        stages: [
          {
            id: 'blackout-window',
            title: 'Hold through the blackout',
            primaryActorId: 'blackout-window',
            districtState: {
              label: 'The Switchboard has killed every signal in the district at once',
              summary:
                'Every intersection is running dark, the service lanes are dead, and the rooftop lane is the only route still worth holding.',
              blackoutIntersections: true,
              serviceLaneBlocks: ['police', 'ambulance', 'tow', 'taxi'],
              trafficSpeedMultiplier: 0.6,
              wantedPressureBonus: 1,
              reservedRoutes: [
                {
                  points: [
                    { x: 3648, y: 2304 },
                    { x: 3776, y: 2304 },
                    { x: 3904, y: 2304 },
                  ],
                  radius: 160,
                },
              ],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'name-in-the-static',
      title: 'Name In The Static',
      hook: 'The first full Switchboard file is almost readable if Rook can hold the rooftop link against the counterpush.',
      primaryGoal:
        'Reach the decrypt rooftop, hold it long enough to finish the upload, and survive the response teams.',
      secondaryPressure:
        'The ending should feel like a named reveal, not just another defense wave.',
      failureState: 'Fail if the rooftop link is broken before the file resolves.',
      payoff:
        "Act I ends with proof that the Switchboard is the machine behind the city's engineered emergencies.",
      prototypeRuntime: {
        id: 'name-in-the-static',
        title: 'Name In The Static',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the rooftop transmitter before the decrypt window closes',
            target: { x: 3904, y: 2304 },
            radius: 88,
          },
          {
            kind: 'defend',
            description: 'Hold the rooftop for 20 seconds while the file decrypts',
            target: { x: 3904, y: 2304 },
            radius: 120,
            seconds: 20,
          },
        ],
        reward: 5200,
      },
    },
  ],
};
