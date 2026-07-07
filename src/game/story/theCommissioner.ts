import {
  createEscortMissionScript,
  createWantedPressureMissionScript,
  vehicleRouteActor,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const THE_COMMISSIONER: StoryChapter = {
  id: 'the-commissioner',
  actId: 'break-the-four-pillars',
  order: 2,
  title: 'The Commissioner',
  storyRole:
    'Rook turns on the police commissioner who sold selective law, aiming not just to kill a corrupt office but to force loyal cops and defectors to see the same proof at once.',
  combinedGoal:
    'Get inside the commissioner\'s protected routes, fracture the command chain from within, and force a confession over open radio while the last loyal response collapses.',
  missions: [
    {
      id: 'honor-guard',
      title: 'Honor Guard',
      hook: 'The ceremonial motorcade is the cleanest way onto the commissioner\'s protected route if Rook can hold formation without blinking.',
      primaryGoal:
        'Stay inside the motorcade formation long enough to reach the protected route and read how the commissioner moves under ceremony.',
      secondaryPressure:
        'This should feel like disguise under scrutiny, with discipline doing more work than speed.',
      failureState: 'Fail if the stolen car drifts out of formation before the route is learned.',
      payoff:
        'Rook gets onto the commissioner\'s protected route and identifies the command cars that keep the whole fiction afloat.',
      requiredSystems: ['tail', 'stealth', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'honor-guard',
        title: 'Honor Guard',
        objectives: [
          {
            kind: 'tail',
            description: 'Hold the ceremonial formation for 14 seconds',
            seconds: 14,
          },
        ],
        reward: 7200,
      },
      prototypeScript: {
        primaryActorId: 'honor-guard-lead',
        actors: [],
        stages: [
          {
            id: 'honor-guard-route',
            title: 'Stay inside the ceremonial route',
            primaryActorId: 'honor-guard-lead',
            districtState: {
              label: 'The ceremonial route still reads the stolen car as part of the honor guard',
              summary:
                'Match the cadence cleanly enough to reach the commissioner\'s route before the scrutiny hardens into a read.',
              trafficSpeedMultiplier: 0.82,
              wantedPressureBonus: 1,
            },
            actors: [
              vehicleRouteActor(
                'honor-guard-lead',
                'police',
                [
                  { x: 480, y: 480 },
                  { x: 928, y: 480 },
                  { x: 1376, y: 480 },
                  { x: 1824, y: 480 },
                ],
                102,
                {
                  followRadius: 300,
                  tailDrainPerSecond: 2,
                  loseGraceSeconds: 2.5,
                },
              ),
            ],
          },
        ],
      },
    },
    {
      id: 'patrol-leak',
      title: 'Patrol Leak',
      hook: 'The command cars only look clean because nobody below them has seen the evidence planted with their own eyes.',
      primaryGoal:
        'Reach the three command-car stops, plant the evidence, and clear the line before the loyalists understand the leak.',
      secondaryPressure:
        'The point is to collapse trust from inside the chain, not to wipe the whole patrol off the street.',
      failureState: 'Fail if the evidence leak fails to reach rank-and-file officers before the route is resealed.',
      payoff:
        'The command chain starts to crack, and the commissioner is forced deeper into a shrinking set of loyal routes.',
      requiredSystems: ['timedMultiStop', 'districtState'],
      prototypeRuntime: {
        id: 'patrol-leak',
        title: 'Patrol Leak',
        objectives: [
          {
            kind: 'route',
            description: 'Plant the evidence at the 3 command-car stops before the route clamps shut',
            targets: [
              { x: 2176, y: 960 },
              { x: 2720, y: 1056 },
              { x: 3168, y: 1120 },
            ],
            radius: 84,
            timeLimitSeconds: 76,
          },
          {
            kind: 'collect',
            description: 'Confirm the 3 patrol leaks took',
            count: 3,
          },
        ],
        reward: 7600,
      },
      prototypeScript: {
        primaryActorId: 'patrol-leak-route',
        actors: [],
        stages: [
          {
            id: 'patrol-leak-stops',
            title: 'Seed the command cars',
            districtState: {
              label: 'The command route is still pretending its own cars are untouchable',
              summary:
                'Plant the evidence fast enough that loyal command cannot scrub the route before its own officers see the truth.',
              trafficSpeedMultiplier: 0.78,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'holding-pattern',
      title: 'Holding Pattern',
      hook: 'The commissioner can still get away unless the street itself becomes a box that keeps the route from breathing.',
      primaryGoal:
        'Reach the traffic box, seal the route around the commissioner, and hold that box long enough for the loyalists to lose the lane.',
      secondaryPressure:
        'The offense should be spatial control through buses and wrecks, not a straight pursuit kill.',
      failureState: 'Fail if the commissioner slips the traffic box before it holds.',
      payoff:
        'The commissioner is trapped in his own traffic doctrine and the defectors finally have room to move.',
      requiredSystems: ['defend', 'districtState'],
      prototypeRuntime: {
        id: 'holding-pattern',
        title: 'Holding Pattern',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the traffic box before the commissioner clears it',
            target: { x: 3456, y: 2624 },
            radius: 88,
          },
          {
            kind: 'defend',
            description: 'Hold the traffic box for 14 seconds while the commissioner is trapped inside',
            target: { x: 3456, y: 2624 },
            radius: 124,
            seconds: 14,
          },
        ],
        reward: 8000,
      },
      prototypeScript: {
        primaryActorId: 'holding-pattern-box',
        actors: [],
        stages: [
          {
            id: 'holding-pattern-entry',
            title: 'Seal the commissioner inside the box',
            districtState: {
              label: 'The commissioner still has one clean lane through the district',
              summary:
                'Take the box first and the city becomes the trap instead of the shield around selective law.',
              trafficSpeedMultiplier: 0.72,
              serviceLaneBlocks: ['tow'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'holding-pattern-hold',
            title: 'Hold the closed route',
            districtState: {
              label: 'The commissioner is boxed in but loyalists are trying to crack the lane',
              summary:
                'Keep the route sealed long enough that the command chain can no longer pretend it still controls the street.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'blue-divide',
      title: 'Blue Divide',
      hook: 'The defecting officers will walk if they have to, but only if someone keeps each junction from sealing in front of them.',
      primaryGoal:
        'Escort the defectors through the junction line and keep them moving until the precinct loses reach over the route.',
      secondaryPressure:
        'The mission should feel like faction fracture in motion, not an even-sided police battle.',
      failureState: 'Fail if the defecting officers are cut off before they clear the final junction.',
      payoff:
        'The defectors make it out with testimony the commissioner can no longer bury inside the badge.',
      requiredSystems: ['escort', 'districtState'],
      prototypeRuntime: {
        id: 'blue-divide',
        title: 'Blue Divide',
        objectives: [
          {
            kind: 'route',
            description: 'Clear the 3 junctions with the defectors intact',
            targets: [
              { x: 3136, y: 2560 },
              { x: 2880, y: 2816 },
              { x: 2368, y: 3136 },
            ],
            radius: 88,
            timeLimitSeconds: 82,
          },
          {
            kind: 'survive',
            description: 'Keep the defectors moving for 12 seconds beyond the last precinct reach',
            seconds: 12,
          },
        ],
        reward: 8400,
      },
      prototypeScript: createEscortMissionScript({
        actorId: 'blue-divide-defectors',
        route: [
          { x: 3136, y: 2560 },
          { x: 2880, y: 2816 },
          { x: 2624, y: 3008 },
          { x: 2368, y: 3136 },
        ],
        speed: 38,
        failureText: 'The defecting officers were cut off before they cleared the precinct grid.',
      }),
    },
    {
      id: 'open-channel',
      title: 'Open Channel',
      hook: 'The commissioner only loses for real if the confession goes out over the same radio net he sold by the district.',
      primaryGoal:
        'Reach the open channel, drive the district to a 4-star police response, and survive long enough for the confession to stay live.',
      secondaryPressure:
        'The pillar should fall through humiliation and proof, not through a hidden execution.',
      failureState: 'Fail if the confession dies before the open channel makes it impossible to deny.',
      payoff:
        'Selective law collapses in public and the second pillar falls with the badge still listening.',
      requiredSystems: ['districtState', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'open-channel',
        title: 'Open Channel',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the open radio node before the loyalists jam it',
            target: { x: 3520, y: 640 },
            radius: 88,
          },
          {
            kind: 'wanted',
            description: 'Push the district into a 4-star police response while the confession goes out',
            stars: 4,
          },
          {
            kind: 'survive',
            description: 'Survive the last loyal response for 14 seconds while the confession stays live',
            seconds: 14,
          },
        ],
        reward: 9400,
      },
      prototypeScript: createWantedPressureMissionScript({
        id: 'open-channel-net',
        title: 'Hold the confession on the air',
        label: 'The badge is hearing itself exposed in real time',
        summary:
          'The channel only matters if it survives the panic response long enough that every loyal cruiser hears the same words.',
        minStars: 5,
        failureText: 'The open channel died before the confession became undeniable.',
        trafficSpeedMultiplier: 0.64,
        wantedPressureBonus: 2,
        suppressNpcDriving: true,
        blackoutIntersections: true,
        serviceLaneBlocks: ['police', 'ambulance', 'tow'],
      }),
      variants: [
        {
          cityState: [{ axis: 'faction', id: 'radio', atLeast: 1 }],
          hook: 'The nightlife host who still trusts Rook throws the open channel wide the moment the confession starts.',
          primaryGoal:
            'Reach the open channel the pirate-radio net already primed, hold a 4-star police response, and keep the confession live.',
          payoff:
            'The pirate-radio net carries the confession city-wide before the badge can jam it, and selective law collapses in public.',
        },
        {
          cityState: [{ axis: 'faction', id: 'informants', atLeast: 1 }],
          hook: 'Rook\'s informant network feeds the confession straight onto the command band the loyal cops still monitor.',
          primaryGoal:
            'Reach the open channel the informant network exposed, hold a 4-star police response, and keep the confession live.',
          payoff:
            'The informant-fed leak lands on the same radio the loyalists trusted, and selective law falls with the badge still listening.',
        },
      ],
    },
  ],
};