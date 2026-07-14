import {
  createProtectedVehicleTailScript,
  vehicleRouteActor,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const THE_DEVELOPER: StoryChapter = {
  id: 'the-developer',
  actId: 'break-the-four-pillars',
  order: 3,
  title: 'The Developer',
  storyRole:
    'Rook hits the pillar that turned blight, fire, and displacement into redevelopment margins, forcing a property empire to answer for the ruins it engineered.',
  combinedGoal:
    'Steal the maps, stop the demolitions, rescue the trapped civilians, and crack the flagship tower until the third pillar falls under the weight of its own spectacle.',
  presentation: {
    opener: {
      speaker: 'Rook Vance',
      role: 'Cracking the model city',
      kicker: 'Crash The Model City',
    },
  },
  missions: [
    {
      id: 'model-unit',
      title: 'Model Unit',
      hook: 'The sales office is still dressed like aspiration, even though the redevelopment map inside it is a city-scale threat report.',
      primaryGoal:
        'Reach the show home, pull the redevelopment maps, and clear the sales lane before the office is scrubbed.',
      secondaryPressure:
        'The infiltration should be compact and sharp, not a drawn-out tower assault on the opening beat.',
      failureState: 'Fail if the redevelopment maps are scrubbed before they can be recovered.',
      payoff:
        'Rook learns which occupied block is next on the demolition schedule.',
      requiredSystems: ['scriptedEncounter'],
      prototypeRuntime: {
        id: 'model-unit',
        title: 'Model Unit',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the sales office before the maps are scrubbed',
            target: { x: 2176, y: 960 },
            radius: 84,
          },
          {
            kind: 'collect',
            description: 'Recover the 3 redevelopment map caches',
            count: 3,
          },
        ],
        reward: 7400,
      },
      prototypeScript: {
        primaryActorId: 'model-unit-office',
        actors: [],
        stages: [
          {
            id: 'model-unit-entry',
            title: 'Break the sales office cleanly',
            districtState: {
              label: 'The show home still thinks it is selling a future instead of erasing a district',
              summary:
                'Get the maps now before the office rewrites the block into another polite lie and a demolition permit.',
              trafficSpeedMultiplier: 0.8,
              serviceLaneBlocks: ['taxi'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'controlled-demolition',
      title: 'Controlled Demolition',
      hook: 'The explosives are wired to take an occupied block in sequence, which means the sequence can be broken if Rook reads it fast enough.',
      primaryGoal:
        'Cut the demolition lines in the right order before the block is leveled with people still inside.',
      secondaryPressure:
        'This should feel like a bomb-disarm variant driven by order and urgency rather than brute damage.',
      failureState: 'Fail if the occupied block is demolished before the sequence is cut.',
      payoff:
        'The residents live and the developer loses the easiest route to another cheap acquisition.',
      requiredSystems: ['sabotage', 'timedMultiStop'],
      prototypeRuntime: {
        id: 'controlled-demolition',
        title: 'Controlled Demolition',
        objectives: [
          {
            kind: 'sabotage',
            description: 'Cut the 4 demolition lines before the blast sequence completes',
            targets: [
              { x: 2624, y: 1664 },
              { x: 3072, y: 1600 },
              { x: 3456, y: 1856 },
              { x: 3200, y: 2240 },
            ],
            radius: 84,
            timeLimitSeconds: 78,
          },
        ],
        reward: 7900,
      },
      prototypeScript: {
        primaryActorId: 'controlled-demolition-grid',
        actors: [],
        stages: [
          {
            id: 'controlled-demolition-route',
            title: 'Break the blast sequence',
            districtState: {
              label: 'The demolition sequence is still aligned around one occupied block',
              summary:
                'Read the order and cut it fast enough that the developer cannot turn civilians into another redevelopment margin.',
              trafficSpeedMultiplier: 0.74,
              wantedPressureBonus: 1,
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'dust-run',
      title: 'Dust Run',
      hook: 'A school bus is trapped inside the collapse corridor the developer planned for everyone else.',
      primaryGoal:
        'Stay on the school bus through the collapse lane and keep it intact enough to clear the corridor alive.',
      secondaryPressure:
        'The rescue should be about preserving a fragile civilian vehicle under route pressure, not about trading gunfire.',
      failureState: 'Fail if the school bus is lost or too badly damaged before it clears the corridor.',
      payoff:
        'The bus escapes and the neighborhood coalition gets the moral leverage it needs for the next strike.',
      requiredSystems: ['tail', 'vehicleCondition', 'districtState'],
      prototypeRuntime: {
        id: 'dust-run',
        title: 'Dust Run',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay with the school bus through the collapse corridor for 14 seconds',
            seconds: 14,
          },
        ],
        reward: 8300,
      },
      prototypeScript: createProtectedVehicleTailScript({
        actorId: 'dust-run-bus',
        vehicleKind: 'van',
        route: [
          { x: 3136, y: 2560 },
          { x: 2880, y: 2816 },
          { x: 2624, y: 3008 },
          { x: 2368, y: 3136 },
        ],
        speed: 84,
        followRadius: 320,
        minHealth: 48,
        failureText: 'The school bus broke inside the collapse corridor.',
      }),
    },
    {
      id: 'permit-office',
      title: 'Permit Office',
      hook: 'The demolition approvals are moving in convoy because the developer knows they matter more than any speech after the fact.',
      primaryGoal:
        'Pin the approvals convoy and seize the permit cache before it is voided or rerouted.',
      secondaryPressure:
        'The mission should feel like a legal proof chase, where the paper matters as much as the takedown.',
      failureState: 'Fail if the approvals are voided before the convoy is stopped.',
      payoff:
        'The coalition gets the demolition approvals in hand and the flagship tower becomes a public target instead of a rumor.',
      requiredSystems: ['capture', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'permit-office',
        title: 'Permit Office',
        objectives: [
          {
            kind: 'capture',
            description: 'Hold the approvals convoy for 3 seconds and seize the permit cache',
            seconds: 3,
          },
        ],
        reward: 8700,
      },
      prototypeScript: {
        primaryActorId: 'permit-office-convoy',
        actors: [],
        stages: [
          {
            id: 'permit-office-stop',
            title: 'Stop the approvals convoy',
            primaryActorId: 'permit-office-convoy',
            districtState: {
              label: 'The approvals convoy still thinks paper can outrun consequences',
              summary:
                'Pin the convoy before the permits are voided and the whole demolition chain hides itself behind another administrative shrug.',
              trafficSpeedMultiplier: 0.8,
            },
            actors: [
              vehicleRouteActor(
                'permit-office-convoy',
                'van',
                [
                  { x: 2816, y: 1152 },
                  { x: 3072, y: 1216 },
                  { x: 3328, y: 1280 },
                ],
                102,
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
    {
      id: 'foundation-crack',
      title: 'Foundation Crack',
      hook: 'The flagship tower only looks permanent while its support generators keep panic and evacuation flowing in the right directions.',
      primaryGoal:
        'Kill the support generators and live through the plaza panic long enough for the tower to start failing in public.',
      secondaryPressure:
        'The third pillar should fall through structural spectacle, not through one more back-room confession.',
      failureState: 'Fail if the support grid survives or the plaza seals before the collapse starts.',
      payoff:
        'The flagship tower turns against the developer and the third pillar falls in front of everyone it displaced.',
      requiredSystems: ['sabotage', 'districtState'],
      prototypeRuntime: {
        id: 'foundation-crack',
        title: 'Foundation Crack',
        objectives: [
          {
            kind: 'sabotage',
            description: 'Kill the 3 support generators before the plaza is locked down',
            targets: [
              { x: 3328, y: 2496 },
              { x: 3520, y: 2432 },
              { x: 3648, y: 2624 },
            ],
            radius: 84,
            timeLimitSeconds: 74,
          },
          {
            kind: 'survive',
            description: 'Survive the plaza panic for 12 seconds while the tower starts to fail',
            seconds: 12,
          },
        ],
        reward: 9800,
      },
      prototypeScript: {
        primaryActorId: 'foundation-crack-plaza',
        actors: [],
        stages: [
          {
            id: 'foundation-crack-burn',
            title: 'Crack the tower foundation',
            districtState: {
              label: 'The flagship tower still believes its panic choreography can survive exposure',
              summary:
                'Kill the supports before the district can turn one more collapse into another profitable transfer of land.',
              trafficSpeedMultiplier: 0.68,
              suppressNpcDriving: true,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'foundation-crack-exit',
            title: 'Live through the plaza panic',
            districtState: {
              label: 'The tower is failing and the district can no longer stage-manage the fallout',
              summary:
                'Stay alive through the first panic wave and the developer loses the skyline symbol that sold the lie.',
              suppressNpcDriving: true,
              trafficSpeedMultiplier: 0.58,
              blackoutIntersections: true,
              serviceLaneBlocks: ['police', 'ambulance', 'tow'],
            },
            actors: [],
          },
        ],
      },
    },
  ],
};