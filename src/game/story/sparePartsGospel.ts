import {
  actorVehicleConditionFailRule,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const SPARE_PARTS_GOSPEL: StoryChapter = {
  id: 'spare-parts-gospel',
  actId: 'find-the-missing-dispatcher',
  order: 2,
  title: 'Spare Parts Gospel',
  storyRole:
    'The trail points toward independent tow operators who know where the city hides inconvenient wrecks and bodies.',
  combinedGoal:
    'Infiltrate the tow-yard network, trace where sensitive wrecks are being hidden, and earn a route to the dispatcher behind the cleanup crews.',
  missionGroups: [
    ['yard-talk'],
    ['hook-chain', 'the-empty-shell'],
    ['crusher-feed'],
    ['towline-oath'],
  ],
  missions: [
    {
      id: 'yard-talk',
      title: 'Yard Talk',
      hook: 'Rook needs a way into the tow-yard chatter without looking like an outsider.',
      primaryGoal:
        'Steal a tow truck, run one convincing pickup, and bring it back before the yard locks the gate.',
      secondaryPressure:
        'The job should feel legitimate enough that the player learns the yard loop instead of simply stealing and fleeing.',
      failureState:
        'Fail if the truck is destroyed or if Rook abandons the yard run before returning to the lot.',
      payoff:
        'Rook earns an introduction to the tow-yard crew and overhears the first hints about hidden wreck storage.',
      prototypeRuntime: {
        id: 'yard-talk',
        title: 'Yard Talk',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the tow yard and steal a truck cleanly',
            target: { x: 1216, y: 2304 },
            radius: 80,
          },
          {
            kind: 'service',
            description: "Complete 1 tow recovery to earn the crew's trust",
            service: 'tow',
            count: 1,
          },
        ],
        reward: 2400,
      },
    },
    {
      id: 'hook-chain',
      title: 'Hook Chain',
      hook: 'Two sensitive wrecks are about to vanish into a rival yard.',
      primaryGoal:
        'Reach the wreck sites before the rivals do and secure both recovery points for the yard crew.',
      secondaryPressure:
        'Each pickup should force a different route across the district instead of replaying the same drive twice.',
      failureState:
        'Fail if Rook loses the second recovery point for too long or is taken out while the wreck chain is live.',
      payoff: 'The recovered shells point toward a stripped sedan carrying hidden route documents.',
      prototypeRuntime: {
        id: 'hook-chain',
        title: 'Hook Chain',
        objectives: [
          {
            kind: 'route',
            description: 'Reach both wreck sites before the rival yard clears them',
            targets: [
              { x: 1792, y: 2176 },
              { x: 2496, y: 1984 },
            ],
            radius: 84,
            timeLimitSeconds: 70,
          },
        ],
        reward: 2600,
      },
    },
    {
      id: 'the-empty-shell',
      title: 'The Empty Shell',
      hook: 'The stripped sedan is moving under light guard, which usually means the cargo matters more than the car.',
      primaryGoal:
        'Stay on the stripped sedan convoy and keep the cargo car intact long enough to learn which yard is receiving the documents.',
      secondaryPressure:
        'Rook needs to stay close without starting the fight too early or letting the cargo sedan get hammered apart in traffic.',
      failureState:
        'Fail if the convoy route is lost or if the stripped sedan takes too much damage before the receiving yard is identified.',
      payoff:
        'The sedan leads Rook straight to the scrap plant that is laundering the evidence trail.',
      requiredSystems: ['tail', 'vehicleCondition', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'the-empty-shell',
        title: 'The Empty Shell',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay on the stripped sedan convoy long enough to find the receiving yard',
            seconds: 10,
          },
        ],
        reward: 3000,
      },
      prototypeScript: {
        primaryActorId: 'empty-shell-sedan',
        actors: [],
        stages: [
          {
            id: 'shell-breakaway',
            title: 'Stay on the shell convoy',
            districtState: {
              label: 'Decoy wrecks are dragging the chase east',
              summary:
                'A decoy sedan peels away while the real shell heads toward the salvage lane.',
            },
            failRules: [
              actorVehicleConditionFailRule(
                'empty-shell-sedan',
                55,
                'The stripped sedan was smashed before the cargo route could be read.',
                0.5,
              ),
            ],
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'empty-shell-sedan',
                vehicleKind: 'sedan',
                route: [
                  { x: 1984, y: 2176 },
                  { x: 2304, y: 2176 },
                  { x: 2496, y: 2112 },
                ],
                speed: 108,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
              {
                kind: 'vehicleRoute',
                actorId: 'empty-shell-decoy',
                vehicleKind: 'coupe',
                route: [
                  { x: 1984, y: 2176 },
                  { x: 2048, y: 2496 },
                  { x: 2240, y: 2752 },
                ],
                speed: 104,
                followRadius: 240,
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'empty-shell-sedan' },
          },
          {
            id: 'shell-yard-handoff',
            title: 'Confirm the receiving yard',
            districtState: {
              label: 'The real shell is slipping through the salvage gate',
              summary: 'Hold the tail until the receiving yard is unmistakable.',
            },
            failRules: [
              actorVehicleConditionFailRule(
                'empty-shell-sedan',
                55,
                'The stripped sedan was smashed before the receiving yard was confirmed.',
                0.5,
              ),
            ],
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'empty-shell-sedan',
                vehicleKind: 'sedan',
                route: [
                  { x: 2496, y: 2112 },
                  { x: 2816, y: 2112 },
                  { x: 3008, y: 2112 },
                ],
                speed: 112,
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
      id: 'crusher-feed',
      title: 'Crusher Feed',
      hook: 'Inside the scrap plant, the evidence is about to be flattened into anonymous metal.',
      primaryGoal:
        'Crash the plant, trip the crusher safeties in order, and get out before the yard seals.',
      secondaryPressure:
        'The player should feel pressure from both the plant interior and the exit lane instead of a static arena.',
      failureState:
        'Fail if the crusher order breaks long enough for the papers to vanish or if Rook is dropped inside the yard.',
      payoff:
        'The plant records expose the dispatcher contact organizing the raids on the independent tow crews.',
      prototypeRuntime: {
        id: 'crusher-feed',
        title: 'Crusher Feed',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the scrap plant crusher lane',
            target: { x: 3136, y: 2304 },
            radius: 88,
          },
          {
            kind: 'sabotage',
            description: 'Trip the crusher safeties in the plant order',
            targets: [
              { x: 3072, y: 2240 },
              { x: 3200, y: 2304 },
              { x: 3328, y: 2368 },
            ],
            radius: 84,
          },
          {
            kind: 'defend',
            description: 'Hold the lane for 12 seconds and get clear',
            target: { x: 3136, y: 2304 },
            radius: 120,
            seconds: 12,
          },
        ],
        reward: 3600,
      },
      prototypeScript: {
        primaryActorId: 'crusher-squad',
        actors: [
          {
            kind: 'pedestrianSquad',
            actorId: 'crusher-squad',
            center: { x: 3136, y: 2304 },
            count: 5,
            spread: 26,
          },
        ],
      },
    },
    {
      id: 'towline-oath',
      title: 'Towline Oath',
      hook: 'The yard backs Rook for one night, but only if Rook helps them survive the retaliation.',
      primaryGoal:
        'Defend the tow yard through the raid and keep the dispatcher trail alive long enough to pull a name out of the attackers.',
      secondaryPressure:
        'The defense should turn into a counterpush so the chapter ends by forcing the enemy to retreat, not by waiting them out.',
      failureState:
        'Fail if the raid overruns the yard or if Rook cannot hold the line long enough for the crew to trace the dispatcher.',
      payoff: 'The tow crew gives Rook the hospital-route lead that opens the next chapter.',
      prototypeRuntime: {
        id: 'towline-oath',
        title: 'Towline Oath',
        objectives: [
          {
            kind: 'reach',
            description: 'Return to the tow yard before the raid breaks through',
            target: { x: 1216, y: 2304 },
            radius: 88,
          },
          {
            kind: 'eliminate',
            description: 'Take down 6 marked raiders',
            count: 6,
            targetsOnly: true,
          },
          {
            kind: 'defend',
            description: 'Hold the yard for 18 seconds while the crew traces the dispatcher',
            target: { x: 1216, y: 2304 },
            radius: 120,
            seconds: 18,
          },
        ],
        reward: 4200,
      },
      prototypeScript: {
        primaryActorId: 'tow-yard-raiders',
        actors: [
          {
            kind: 'pedestrianSquad',
            actorId: 'tow-yard-raiders',
            center: { x: 1216, y: 2304 },
            count: 6,
            spread: 28,
            missionTargets: true,
          },
        ],
      },
    },
  ],
};
