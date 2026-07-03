import {
  createWantedPressureMissionScript,
  missionTargetSquadActor,
  vehicleRouteActor,
  wantedPressureFailRule,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const CIVIC_SHIELD: StoryChapter = {
  id: 'civic-shield',
  actId: 'expose-the-machine',
  order: 1,
  title: 'Civic Shield',
  storyRole:
    'Rook identifies Civic Shield, the private security contractor that acts as the Switchboard\'s muscle, and starts pulling apart the roster that decides who gets rescued and who gets left.',
  combinedGoal:
    'Learn the contractor\'s patrol logic from the inside, expose the staged panics it profits from, and steal the live roster that proves which emergencies are delayed on purpose before the district turns its guns on Rook.',
  missions: [
    {
      id: 'training-day',
      title: 'Training Day',
      hook: 'The only way to read Civic Shield\'s patrol logic is to run their proving route as one of their own.',
      primaryGoal:
        'Hold formation behind the lead cruiser through the proving run so the contractor\'s patrol pattern reads as routine.',
      secondaryPressure:
        'The pressure should come from disciplined, low-profile driving inside a moving formation rather than raw speed.',
      failureState: 'Fail if the stolen cruiser drifts out of formation or draws a full read from the proving crew.',
      payoff:
        'Rook memorizes the contractor\'s patrol cadence and learns the proving crew is screening for a staged panic drill downtown.',
      requiredSystems: ['tail', 'stealth', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'training-day',
        title: 'Training Day',
        objectives: [
          {
            kind: 'tail',
            description: 'Hold the proving-run formation behind the lead cruiser for 14 seconds',
            seconds: 14,
          },
        ],
        reward: 4800,
      },
      prototypeScript: {
        primaryActorId: 'proving-lead',
        actors: [],
        stages: [
          {
            id: 'proving-run',
            title: 'Stay inside the proving formation',
            primaryActorId: 'proving-lead',
            districtState: {
              label: 'The proving crew is still reading the stolen cruiser as one of their own',
              summary:
                'Hold the lead cruiser\'s cadence through the arterial run before the formation notices the plate does not belong.',
              trafficSpeedMultiplier: 0.82,
              wantedPressureBonus: 1,
            },
            actors: [
              vehicleRouteActor(
                'proving-lead',
                'police',
                [
                  { x: 480, y: 480 },
                  { x: 928, y: 480 },
                  { x: 1376, y: 480 },
                  { x: 1824, y: 480 },
                ],
                104,
                {
                  followRadius: 300,
                  tailDrainPerSecond: 2,
                  loseGraceSeconds: 2.5,
                },
              ),
            ],
            failRules: [
              wantedPressureFailRule(
                2,
                'The proving crew flagged the stolen cruiser once it drew a full read.',
              ),
            ],
          },
        ],
      },
    },
    {
      id: 'panic-demo',
      title: 'Panic Demo',
      hook: 'Civic Shield stages the panics it later charges the city to contain.',
      primaryGoal:
        'Reach the mall concourse and disable the planted panic triggers before the crowd is stampeded into the kill zones.',
      secondaryPressure:
        'The pressure should come from a hard clock on the triggers, not from a straight fight through security.',
      failureState: 'Fail if the crowd stampedes before every planted trigger is disabled.',
      payoff:
        'The defused drill proves Civic Shield manufactures the emergencies it sells protection from, and points Rook at an armored records convoy.',
      requiredSystems: ['sabotage', 'timedMultiStop', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'panic-demo',
        title: 'Panic Demo',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the mall concourse before the drill crowd is triggered',
            target: { x: 928, y: 608 },
            radius: 84,
          },
          {
            kind: 'sabotage',
            description: 'Disable the 3 planted panic triggers before the stampede starts',
            targets: [
              { x: 1376, y: 608 },
              { x: 1824, y: 672 },
              { x: 928, y: 800 },
            ],
            radius: 84,
            timeLimitSeconds: 65,
          },
        ],
        reward: 5200,
      },
      prototypeScript: {
        primaryActorId: 'panic-demo-crowd',
        actors: [],
        stages: [
          {
            id: 'panic-demo-approach',
            title: 'Reach the concourse before the drill starts',
            districtState: {
              label: 'The drill crowd is still loose enough to move without a stampede',
              summary:
                'Get onto the concourse before the contractor arms the planted triggers and the crowd is herded into the choke points.',
              trafficSpeedMultiplier: 0.78,
              serviceLaneBlocks: ['ambulance'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'panic-demo-triggers',
            title: 'Disable the planted triggers',
            districtState: {
              label: 'The triggers are live and the crowd is one bang from a stampede',
              summary:
                'Kill each planted trigger before the drill crowd is panicked into the sealed exits Civic Shield already covers.',
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
      id: 'armor-column',
      title: 'Armor Column',
      hook: 'The records convoy will not lose a straight firefight, so it has to be split by the city itself.',
      primaryGoal:
        'Reach the staging junction, blackout the intersections to break the armored convoy apart, then take down the exposed escorts.',
      secondaryPressure:
        'The convoy should be beaten by controlling the lights and lanes first, not by out-shooting the armor head-on.',
      failureState: 'Fail if the convoy re-forms and clears the district before the escorts are down.',
      payoff:
        'The split convoy gives up the location of Civic Shield\'s live contractor archive.',
      requiredSystems: ['scriptedEncounter', 'districtState'],
      prototypeRuntime: {
        id: 'armor-column',
        title: 'Armor Column',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the staging junction before the convoy passes',
            target: { x: 2272, y: 928 },
            radius: 84,
          },
          {
            kind: 'eliminate',
            description: 'Drop the 4 exposed convoy escorts once the column splits',
            count: 4,
            targetsOnly: true,
          },
        ],
        reward: 5600,
      },
      prototypeScript: {
        primaryActorId: 'armor-escorts',
        actors: [],
        stages: [
          {
            id: 'armor-column-stage',
            title: 'Blackout the junction to split the column',
            districtState: {
              label: 'The intersections are blacked out and the armored column is losing formation',
              summary:
                'With the lights dead the convoy cannot hold its box; reach the junction before the escorts re-establish the pattern.',
              blackoutIntersections: true,
              trafficSpeedMultiplier: 0.7,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'armor-column-escorts',
            title: 'Take the exposed escorts',
            primaryActorId: 'armor-escorts',
            districtState: {
              label: 'The escorts are split off from the armor and exposed on foot',
              summary:
                'Drop the stranded escorts before the armored cores can circle back and reseal the convoy box.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [missionTargetSquadActor('armor-escorts', { x: 2272, y: 928 }, 4, 26)],
          },
        ],
      },
    },
    {
      id: 'contract-burn',
      title: 'Contract Burn',
      hook: 'The roster that decides who gets saved is stored where no subpoena can reach it.',
      primaryGoal:
        'Reach the contractor archive and pull the live roster caches that show who is paid to arrive late, early, or never.',
      secondaryPressure:
        'The mission should reward a clean in-and-out extraction over a drawn-out shootout inside the archive.',
      failureState: 'Fail if the archive locks down before every roster cache is recovered.',
      payoff:
        'The stolen roster names the districts Civic Shield is being paid to abandon, and marks Rook for a shoot-on-sight response.',
      requiredSystems: ['scriptedEncounter'],
      prototypeRuntime: {
        id: 'contract-burn',
        title: 'Contract Burn',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the contractor archive before the shift lockout',
            target: { x: 2720, y: 1056 },
            radius: 84,
          },
          {
            kind: 'collect',
            description: 'Recover the 3 live roster caches from the archive floor',
            count: 3,
          },
        ],
        reward: 5900,
      },
      prototypeScript: {
        primaryActorId: 'contract-archive',
        actors: [],
        stages: [
          {
            id: 'contract-burn-stage',
            title: 'Pull the roster before the lockout',
            districtState: {
              label: 'The archive floor is still open between contractor shift changes',
              summary:
                'Grab the live roster caches before the shift lockout seals the archive and the response roster flips to shoot-on-sight.',
              trafficSpeedMultiplier: 0.8,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'black-badge-mile',
      title: 'Black Badge Mile',
      hook: 'Every checkpoint in the district now carries Rook\'s photo and a shoot-on-sight order.',
      primaryGoal:
        'Run the marked escape checkpoints and stay clear of the shoot-on-sight net long enough to leave the contractor\'s district behind.',
      secondaryPressure:
        'The climax should be about endurance and route choice under a hard clock, not a boss duel.',
      failureState: 'Fail if the checkpoint net holds a full read on Rook before the escape route clears.',
      payoff:
        'Rook escapes with the roster intact, turning Civic Shield from the Switchboard\'s shield into its first exposed pillar.',
      requiredSystems: ['scriptedEncounter', 'districtState'],
      prototypeRuntime: {
        id: 'black-badge-mile',
        title: 'Black Badge Mile',
        objectives: [
          {
            kind: 'route',
            description: 'Run the 3 marked escape checkpoints before the district seals',
            targets: [
              { x: 3168, y: 1120 },
              { x: 3616, y: 992 },
              { x: 4064, y: 928 },
            ],
            radius: 88,
            timeLimitSeconds: 70,
          },
          {
            kind: 'survive',
            description: 'Stay clear of the shoot-on-sight net for 12 seconds past the last checkpoint',
            seconds: 12,
          },
        ],
        reward: 7000,
      },
      prototypeScript: createWantedPressureMissionScript({
        id: 'black-badge-mile-run',
        title: 'Beat the shoot-on-sight net',
        label: 'Every checkpoint in the district is holding Rook\'s photo',
        summary:
          'A full checkpoint read past the district line turns the whole contractor net onto the escape route at once.',
        minStars: 3,
        failureText: 'The checkpoint net got a full read before the escape route cleared.',
        trafficSpeedMultiplier: 0.66,
        wantedPressureBonus: 2,
        suppressNpcDriving: true,
      }),
    },
  ],
};
