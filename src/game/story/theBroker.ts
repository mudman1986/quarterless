import {
  createWantedPressureMissionScript,
  missionTargetSquadActor,
  vehicleRouteActor,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const THE_BROKER: StoryChapter = {
  id: 'the-broker',
  actId: 'break-the-four-pillars',
  order: 1,
  title: 'The Broker',
  storyRole:
    'Rook takes the first pillar head-on, tearing into the freight broker who turned wrecks, claims, and reroutes into a private balance sheet for urban disaster.',
  combinedGoal:
    'Hijack the broker\'s paper flow, break the scrapyard shell game, and burn the live accounting vault so the first pillar falls in both numbers and spectacle.',
  missions: [
    {
      id: 'invoice-run',
      title: 'Invoice Run',
      hook: 'The destruction claims are moving in billing vans that still assume paperwork is safer than gunfire.',
      primaryGoal:
        'Hijack the claims route and drive the marked auditor drops before the broker\'s crews can reclaim the paper trail.',
      secondaryPressure:
        'The pressure should come from keeping the billing run plausible under pursuit, not from parking for a prolonged fight.',
      failureState: 'Fail if the billing route collapses before the auditors receive the live claims.',
      payoff:
        'The union auditors get proof of the wreck racket and point Rook at the shell convoy hiding the broker\'s real archive.',
      requiredSystems: ['deliver', 'districtState'],
      prototypeRuntime: {
        id: 'invoice-run',
        title: 'Invoice Run',
        objectives: [
          {
            kind: 'route',
            description: 'Drive the 3 union auditor drops before the claims are reclaimed',
            targets: [
              { x: 1216, y: 2304 },
              { x: 1600, y: 2304 },
              { x: 2112, y: 2240 },
            ],
            radius: 84,
            timeLimitSeconds: 78,
          },
        ],
        reward: 6900,
      },
      prototypeScript: createWantedPressureMissionScript({
        id: 'invoice-run-route',
        title: 'Keep the claims route alive',
        label: 'The broker still thinks the stolen billing van is part of the normal paperwork churn',
        summary:
          'Make the drops fast enough that the wreck market cannot reclaim the claims before the auditors lock them in.',
        minStars: 2,
        failureText: 'The billing route collapsed before the auditors got the claims.',
        trafficSpeedMultiplier: 0.76,
        wantedPressureBonus: 1,
      }),
    },
    {
      id: 'empty-chassis',
      title: 'Empty Chassis',
      hook: 'The broker is hiding its archive inside one stripped shell in a convoy built to look equally worthless.',
      primaryGoal:
        'Stay on the stripped-car convoy long enough to read the real shell, then pin it before the archive is transferred.',
      secondaryPressure:
        'The mission should feel like pattern-reading under motion rather than a race to destroy every shell in sight.',
      failureState: 'Fail if the archive shell escapes before it can be pinned and searched.',
      payoff:
        'Rook identifies the correct shell and learns which scrapyards must be pulled into a false-alarm scramble.',
      requiredSystems: ['tail', 'capture', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'empty-chassis',
        title: 'Empty Chassis',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay on the stripped-car convoy for 12 seconds and read the archive shell',
            seconds: 12,
          },
          {
            kind: 'capture',
            description: 'Pin the archive shell for 3 seconds before the handoff completes',
            seconds: 3,
          },
        ],
        reward: 7300,
      },
      prototypeScript: {
        primaryActorId: 'empty-chassis-shell',
        actors: [],
        stages: [
          {
            id: 'empty-chassis-read',
            title: 'Read the convoy pattern',
            primaryActorId: 'empty-chassis-shell',
            districtState: {
              label: 'The stripped-car convoy still looks like meaningless wreck churn',
              summary:
                'Stay close enough to read which shell carries the archive without spooking the whole convoy into a scatter.',
              trafficSpeedMultiplier: 0.82,
            },
            actors: [
              vehicleRouteActor(
                'empty-chassis-shell',
                'sedan',
                [
                  { x: 2240, y: 1152 },
                  { x: 2368, y: 1088 },
                  { x: 2720, y: 1056 },
                ],
                96,
                {
                  followRadius: 320,
                  captureRadius: 135,
                  captureMaxSpeed: 65,
                  tailDrainPerSecond: 2,
                  loseGraceSeconds: 2.5,
                },
              ),
            ],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'empty-chassis-pin',
            title: 'Pin the archive shell',
            primaryActorId: 'empty-chassis-shell',
            districtState: {
              label: 'The right shell is identified and trying to slip the handoff route',
              summary:
                'Hold it now or the broker\'s archive vanishes back into stripped steel and private yards.',
              trafficSpeedMultiplier: 0.78,
              serviceLaneBlocks: ['tow'],
            },
            actors: [
              vehicleRouteActor(
                'empty-chassis-shell',
                'sedan',
                [
                  { x: 2720, y: 1056 },
                  { x: 3168, y: 1120 },
                  { x: 3616, y: 992 },
                ],
                104,
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
      id: 'yard-fire-drill',
      title: 'Yard Fire Drill',
      hook: 'Three scrapyards have to be yanked into false alarms at once or the broker\'s crews simply consolidate around the real strike.',
      primaryGoal:
        'Trigger the marked scrapyard alarms in sequence before the crews realize which site actually matters.',
      secondaryPressure:
        'This should feel like preparation through misdirection, not a simple list of explosions.',
      failureState: 'Fail if the false alarms do not hold the broker\'s crews away from the real strike route.',
      payoff:
        'The broker\'s security grid thins out, leaving the loading lane vulnerable to an ambush.',
      requiredSystems: ['sabotage', 'districtState'],
      prototypeRuntime: {
        id: 'yard-fire-drill',
        title: 'Yard Fire Drill',
        objectives: [
          {
            kind: 'sabotage',
            description: 'Trigger the 3 scrapyard alarms before the crews re-read the pattern',
            targets: [
              { x: 2624, y: 1664 },
              { x: 3072, y: 1600 },
              { x: 3456, y: 1856 },
            ],
            radius: 84,
            timeLimitSeconds: 72,
          },
        ],
        reward: 7700,
      },
      prototypeScript: {
        primaryActorId: 'yard-fire-drill-grid',
        actors: [],
        stages: [
          {
            id: 'yard-fire-drill-route',
            title: 'Pull the crews off the real yard',
            districtState: {
              label: 'The broker still trusts the scrapyard alarm net',
              summary:
                'Trip the false fires in the right order and the real strike lane opens faster than the broker can understand why.',
              trafficSpeedMultiplier: 0.74,
              wantedPressureBonus: 1,
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'counterweight',
      title: 'Counterweight',
      hook: 'The broker\'s armored limo can only be stopped by turning the loading lane itself into a trap.',
      primaryGoal:
        'Reach the loading lane first, spring the counterweight trap, and drop the marked security holding the limo box together.',
      secondaryPressure:
        'The kill should come from using the environment to freeze the limo, not from trying to outgun an armored lane head-on.',
      failureState: 'Fail if the broker limo clears the loading lane before the security box is broken.',
      payoff:
        'The broker is cornered inside the processing lane and the accounting vault becomes vulnerable.',
      requiredSystems: ['scriptedEncounter', 'districtState'],
      prototypeRuntime: {
        id: 'counterweight',
        title: 'Counterweight',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the loading lane before the armored limo clears it',
            target: { x: 2272, y: 928 },
            radius: 84,
          },
          {
            kind: 'eliminate',
            description: 'Drop the 4 marked security around the broker limo',
            count: 4,
            targetsOnly: true,
          },
        ],
        reward: 8100,
      },
      prototypeScript: {
        primaryActorId: 'counterweight-security',
        actors: [],
        stages: [
          {
            id: 'counterweight-trap',
            title: 'Spring the loading-lane trap',
            districtState: {
              label: 'The loading lane still has room to freeze the limo into place',
              summary:
                'Beat the lane and the broker\'s own cargo equipment becomes the ambush instead of the escort box.',
              trafficSpeedMultiplier: 0.72,
              serviceLaneBlocks: ['tow'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'counterweight-security',
            title: 'Break the security box',
            primaryActorId: 'counterweight-security',
            districtState: {
              label: 'The limo is trapped but its security ring is still intact',
              summary:
                'Drop the marked security and the broker loses the armored fiction that made the whole lane untouchable.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police'],
            },
            actors: [missionTargetSquadActor('counterweight-security', { x: 2272, y: 928 }, 4, 24)],
          },
        ],
      },
    },
    {
      id: 'ledgers-in-the-furnace',
      title: 'Ledgers In The Furnace',
      hook: 'The broker\'s last protection is an accounting vault built into a live processing plant.',
      primaryGoal:
        'Burn the live accounting vault and stay alive long enough to clear the active processing floor.',
      secondaryPressure:
        'The finale should feel like destroying the broker\'s economics in the middle of its machinery, not one more paperwork grab.',
      failureState: 'Fail if the live vault survives or the plant seals before the burn finishes.',
      payoff:
        'The first pillar falls, and the city\'s wreck economy loses the books that made its disasters profitable.',
      requiredSystems: ['sabotage', 'districtState'],
      prototypeRuntime: {
        id: 'ledgers-in-the-furnace',
        title: 'Ledgers In The Furnace',
        objectives: [
          {
            kind: 'sabotage',
            description: 'Burn the 3 live accounting stacks inside the processing plant',
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
            description: 'Stay alive for 12 seconds while the plant clears around the burn',
            seconds: 12,
          },
        ],
        reward: 9000,
      },
      prototypeScript: {
        primaryActorId: 'ledgers-in-the-furnace-floor',
        actors: [],
        stages: [
          {
            id: 'ledgers-in-the-furnace-burn',
            title: 'Burn the broker books',
            districtState: {
              label: 'The processing floor still feeds the broker\'s ledger furnace',
              summary:
                'Torch the live stacks before the plant turns the last honest accounting of disaster into ash and smoke again.',
              trafficSpeedMultiplier: 0.68,
              suppressNpcDriving: true,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'ledgers-in-the-furnace-exit',
            title: 'Clear the active plant',
            districtState: {
              label: 'The books are burning and the whole processing floor is turning hostile',
              summary:
                'Live through the plant\'s panic long enough for the broker\'s balance sheet to die for good.',
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