import {
  createWantedPressureMissionScript,
  vehicleRouteActor,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const STATIC_ON_THE_HOSPITAL_BAND: StoryChapter = {
  id: 'static-on-the-hospital-band',
  actId: 'find-the-missing-dispatcher',
  order: 3,
  title: 'Static On The Hospital Band',
  storyRole:
    "Nia's final calls mention missing ambulance routes and patients who never reached intake.",
  combinedGoal:
    'Trace the falsified ambulance routes, recover the surviving witness trail, and extract the hospital insider who can map the next dispatcher handoff.',
  missionGroups: [
    ['cold-intake'],
    ['flatline-gap', 'clean-sheets'],
    ['crash-cart'],
    ['ward-6-exit'],
  ],
  missions: [
    {
      id: 'cold-intake',
      title: 'Cold Intake',
      hook: 'A witness is bleeding out at the edge of a blackout zone before the rival squad can pick them up.',
      primaryGoal:
        'Reach the ambulance route, secure the witness first, and hold the handoff lane until the safe clinic is ready.',
      secondaryPressure:
        'The player should feel the difference between getting there first and simply surviving the aftermath.',
      failureState:
        'Fail if the witness convoy lane is lost or if Rook is dropped before the safe handoff is secured.',
      payoff:
        'The witness confirms that hospital-route records are being falsified in relay dead zones across the district.',
      prototypeRuntime: {
        id: 'cold-intake',
        title: 'Cold Intake',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the witness pickup lane before the rival squad closes it',
            target: { x: 896, y: 2816 },
            radius: 88,
          },
          {
            kind: 'defend',
            description: 'Hold the lane for 12 seconds until the clinic runner arrives',
            target: { x: 896, y: 2816 },
            radius: 120,
            seconds: 12,
          },
        ],
        reward: 2800,
      },
      variants: [
        {
          branchId: 'double-booking',
          outcomeId: 'save-passenger-a',
          title: 'Cold Intake: Club Witness',
          hook: 'The uptown tape trail points to a club-runner bleeding out beside the blackout fringe.',
          primaryGoal:
            'Reach the uptown witness lane first and hold the handoff long enough for the clinic runner to get them clear.',
          secondaryPressure:
            'The player should feel like the uptown lead bought a cleaner pickup window, not just a reordered mission list.',
          failureState:
            'Fail if the uptown witness lane is lost or if Rook is dropped before the safe handoff is secured.',
          prototypeRuntime: {
            id: 'cold-intake',
            title: 'Cold Intake: Club Witness',
            objectives: [
              {
                kind: 'reach',
                description: 'Reach the uptown witness lane before the rival squad closes it',
                target: { x: 960, y: 2624 },
                radius: 88,
              },
              {
                kind: 'defend',
                description: 'Hold the uptown lane for 12 seconds until the clinic runner arrives',
                target: { x: 960, y: 2624 },
                radius: 120,
                seconds: 12,
              },
            ],
            reward: 2800,
          },
        },
        {
          branchId: 'double-booking',
          outcomeId: 'save-passenger-b',
          title: 'Cold Intake: River Witness',
          hook: 'The riverfront lead points to a witness collapsing beside the service roads below the blackout ridge.',
          primaryGoal:
            'Reach the river witness lane first and hold the handoff long enough for the clinic runner to get them clear.',
          secondaryPressure:
            'The player should feel the river lead pushing the pickup into a rougher service corridor with less cover.',
          failureState:
            'Fail if the river witness lane is lost or if Rook is dropped before the safe handoff is secured.',
          prototypeRuntime: {
            id: 'cold-intake',
            title: 'Cold Intake: River Witness',
            objectives: [
              {
                kind: 'reach',
                description: 'Reach the river witness lane before the rival squad closes it',
                target: { x: 1344, y: 3008 },
                radius: 88,
              },
              {
                kind: 'defend',
                description: 'Hold the river lane for 12 seconds until the clinic runner arrives',
                target: { x: 1344, y: 3008 },
                radius: 120,
                seconds: 12,
              },
            ],
            reward: 2800,
          },
        },
      ],
    },
    {
      id: 'flatline-gap',
      title: 'Flatline Gap',
      hook: "The relay dead zones are shorting out the only records that still point to Nia's last route.",
      primaryGoal:
        'Reach the dead radio sites in sequence and re-open the route map before the cleanup crews jam the district again.',
      secondaryPressure:
        'The path should force the player to keep moving instead of digging in at one location.',
      failureState: 'Fail if the route goes cold before all relay sites are reached.',
      payoff:
        'Rook restores enough of the route map to identify the forged intake tunnel at the hospital loading wing.',
      prototypeRuntime: {
        id: 'flatline-gap',
        title: 'Flatline Gap',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the 4 dead radio sites before the district jams again',
            targets: [
              { x: 1216, y: 3136 },
              { x: 1728, y: 3136 },
              { x: 2240, y: 2944 },
              { x: 2752, y: 2816 },
            ],
            radius: 84,
            timeLimitSeconds: 95,
          },
        ],
        reward: 3200,
      },
      prototypeScript: {
        primaryActorId: 'flatline-gap-window',
        actors: [],
        stages: [
          {
            id: 'relay-dead-zones',
            title: 'Re-open the first dead zones',
            districtState: {
              label: 'The blackout pockets are still narrow enough for a runner',
              summary:
                'The early relay sites are still open if you keep moving before the jammer vans stitch the dead zones back together.',
              trafficSpeedMultiplier: 0.7,
              suppressNpcDriving: true,
              serviceLaneBlocks: ['taxi'],
            },
            actors: [],
            nextWhen: { kind: 'routeProgress', count: 2 },
          },
          {
            id: 'jammer-van-window',
            title: 'Beat the jammer van to the last relay sites',
            primaryActorId: 'jammer-van',
            districtState: {
              label: 'A jammer van is trying to reseal the route behind you',
              summary:
                'The last relay sites will stay open only while the jammer van is still moving to close them.',
              trafficSpeedMultiplier: 0.55,
              suppressNpcDriving: true,
              serviceLaneBlocks: ['ambulance', 'taxi'],
            },
            actors: [
              vehicleRouteActor(
                'jammer-van',
                'van',
                [
                  { x: 2048, y: 3072 },
                  { x: 2240, y: 2944 },
                  { x: 2752, y: 2816 },
                ],
                102,
                { followRadius: 280 },
              ),
            ],
          },
        ],
      },
    },
    {
      id: 'clean-sheets',
      title: 'Clean Sheets',
      hook: 'Inside the loading tunnel, the paper trail is cleaner than it should be.',
      primaryGoal:
        'Break into the loading tunnel and recover the falsified transfer records before they are scrubbed.',
      secondaryPressure:
        'The player should feel like they are slipping into a secure service corridor, not storming a fortress.',
      failureState: 'Fail if the records are burned before Rook reaches the archive room.',
      payoff:
        'The records reveal that the surviving nurse hacker is being moved during an active lockdown window.',
      prototypeRuntime: {
        id: 'clean-sheets',
        title: 'Clean Sheets',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the hospital loading tunnel archive room',
            target: { x: 3200, y: 2752 },
            radius: 88,
          },
          {
            kind: 'collect',
            description: 'Collect the 1 forged transfer record cache',
            count: 1,
          },
        ],
        reward: 3600,
      },
      prototypeScript: createWantedPressureMissionScript({
        id: 'clean-sheets-tunnel',
        title: 'Keep the tunnel quiet',
        label: 'The loading tunnel is still running below full alarm',
        summary:
          'If the security sweep gets a hard read on you, the archive room burns before you can pull the records.',
        minStars: 2,
        failureText: 'The archive room was torched once the tunnel alarm went loud.',
        maxSeconds: 1.5,
      }),
    },
    {
      id: 'crash-cart',
      title: 'Crash Cart',
      hook: 'The witness route is blown, and the only way out is a damaged ambulance sprint through blocked intersections.',
      primaryGoal:
        'Follow the emergency route and keep the ambulance corridor open long enough to clear the district.',
      secondaryPressure:
        'The challenge should come from route control and sustained pressure, not one static shootout.',
      failureState: 'Fail if the corridor collapses before the ambulance clears the district.',
      payoff:
        'The escape proves the hospital routes are being actively manipulated from inside the lockdown perimeter.',
      prototypeRuntime: {
        id: 'crash-cart',
        title: 'Crash Cart',
        objectives: [
          {
            kind: 'route',
            description: 'Follow the emergency corridor out of the hospital district',
            targets: [
              { x: 3264, y: 2368 },
              { x: 3456, y: 1920 },
              { x: 3648, y: 1472 },
            ],
            radius: 88,
            timeLimitSeconds: 70,
          },
          {
            kind: 'survive',
            description: 'Keep the exit lane clear for 10 seconds',
            seconds: 10,
          },
        ],
        reward: 3900,
      },
      prototypeScript: {
        primaryActorId: 'meter-burn-checkpoint-strip',
        actors: [],
        stages: [
          {
            id: 'meter-burn-checkpoint-strip',
            title: 'Checkpoint strip',
            districtState: {
              label: 'Checkpoint traffic is bunching the fare lane',
              summary:
                'The checkpoint strip is slowing the whole avenue and pushing extra police pressure into the corridor.',
              trafficSpeedMultiplier: 0.6,
              wantedPressureBonus: 1,
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'ward-6-exit',
      title: 'Ward 6 Exit',
      hook: 'The nurse hacker can still open the dispatch logs, but only if Rook gets them out through the lockdown routes.',
      primaryGoal:
        'Reach the extraction point, protect the hacker long enough to break the lockdown, and clear the district alive.',
      secondaryPressure:
        'The player should feel the lockdown squeezing tighter instead of simply fighting another wave.',
      failureState:
        'Fail if the extraction window collapses or Rook cannot hold the line long enough for the hacker to clear the route.',
      payoff:
        'The hospital insider points Rook toward the taxi dispatch records in the next chapter.',
      prototypeRuntime: {
        id: 'ward-6-exit',
        title: 'Ward 6 Exit',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the Ward 6 extraction point before the lockdown seals',
            target: { x: 3776, y: 1280 },
            radius: 88,
          },
          {
            kind: 'eliminate',
            description: 'Take down 5 marked lockdown enforcers',
            count: 5,
            targetsOnly: true,
          },
          {
            kind: 'defend',
            description: 'Hold the extraction lane for 15 seconds',
            target: { x: 3776, y: 1280 },
            radius: 120,
            seconds: 15,
          },
        ],
        reward: 4600,
      },
      prototypeScript: {
        primaryActorId: 'ward6-nurse',
        actors: [
          {
            kind: 'pedestrianRoute',
            actorId: 'ward6-nurse',
            route: [
              { x: 3520, y: 1600 },
              { x: 3648, y: 1472 },
              { x: 3776, y: 1280 },
            ],
            speed: 46,
            uniform: 'medic',
            escortRadius: 180,
          },
        ],
        failRules: [
          {
            kind: 'escortRadius',
            actorId: 'ward6-nurse',
            radius: 220,
            maxSeconds: 3,
            failureText: 'The nurse hacker was left behind in the lockdown corridor.',
          },
        ],
      },
    },
  ],
};
