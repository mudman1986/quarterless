import {
  createEscortMissionScript,
  escortRadiusFailRule,
  escortRouteActor,
  missionTargetSquadActor,
  wantedPressureFailRule,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const SAINTS_OF_THE_SIDE_STREET: StoryChapter = {
  id: 'saints-of-the-side-street',
  actId: 'court-the-citys-middle-powers',
  order: 4,
  title: 'Saints Of The Side Street',
  storyRole:
    'A neighborhood aid network has been illegally covering for residents abandoned by official services.',
  combinedGoal:
    'Protect the aid network\'s kitchen, medicine, and clinic lines long enough to earn their trust before the Switchboard crushes the block outright.',
  missionGroups: [
    ['soup-line-watch'],
    ['siren-swap'],
    ['half-block-safehouse'],
    ['medicine-debt'],
    ['quiet-chapel'],
  ],
  missions: [
    {
      id: 'soup-line-watch',
      title: 'Soup Line Watch',
      hook: 'The mobile kitchen keeps rolling into blocks the official services already wrote off.',
      primaryGoal:
        'Escort the soup line van along its round and drive off the extortion crew without letting the van get wrecked.',
      secondaryPressure:
        'The pressure should come from protecting the people crowded around the van, not from raw firepower.',
      failureState:
        'Fail if the soup line van is destroyed or the extortion crew closes on the crowd before they scatter.',
      payoff: 'The kitchen crew points Rook toward the ambulance crews quietly working outside the official system.',
      requiredSystems: ['escort', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'soup-line-watch',
        title: 'Soup Line Watch',
        objectives: [
          {
            kind: 'eliminate',
            description: 'Drive off the 3 marked extortion crew before they reach the van',
            count: 3,
            targetsOnly: true,
          },
          {
            kind: 'survive',
            description: 'Keep the soup line van rolling for 16 seconds',
            seconds: 16,
          },
        ],
        reward: 3900,
      },
      prototypeScript: {
        primaryActorId: 'soup-line-van',
        actors: [
          escortRouteActor(
            'soup-line-van',
            [
              { x: 576, y: 3392 },
              { x: 896, y: 3328 },
              { x: 1216, y: 3264 },
            ],
            40,
          ),
          {
            kind: 'pedestrianSquad',
            actorId: 'extortion-crew',
            center: { x: 896, y: 3328 },
            count: 3,
            spread: 22,
            missionTargets: true,
          },
        ],
        failRules: [
          escortRadiusFailRule(
            'soup-line-van',
            'The soup line van was left exposed to the extortion crew.',
          ),
        ],
      },
    },
    {
      id: 'siren-swap',
      title: 'Siren Swap',
      hook: 'The marked ambulance is too hot to keep moving once the sweep starts looking for it.',
      primaryGoal:
        'Trade the marked ambulance for the unmarked clinic van at the handoff alley, then keep the medicine moving through the police sweep.',
      secondaryPressure:
        'The swap needs to feel exact, since a slow trade leaves the marked unit flagged before the handoff finishes.',
      failureState:
        'Fail if the handoff is missed or the wanted response catches the unmarked van before it clears the sweep.',
      payoff:
        'The medicine reaches the aid network intact, and the clinic crew agrees to hide the next batch of residents.',
      requiredSystems: ['capture', 'tail', 'deliver'],
      prototypeRuntime: {
        id: 'siren-swap',
        title: 'Siren Swap',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the handoff alley before the marked ambulance is flagged',
            target: { x: 864, y: 3392 },
            radius: 80,
          },
          {
            kind: 'capture',
            description: 'Hold the handoff long enough to swap vehicles',
            seconds: 3,
          },
          {
            kind: 'tail',
            description: 'Stay with the unmarked clinic van through the police sweep',
            seconds: 14,
          },
        ],
        reward: 4300,
      },
      prototypeScript: {
        primaryActorId: 'clinic-van',
        actors: [
          {
            kind: 'vehicleRoute',
            actorId: 'clinic-van',
            vehicleKind: 'van',
            route: [
              { x: 864, y: 3392 },
              { x: 608, y: 3136 },
              { x: 384, y: 2880 },
            ],
            speed: 100,
            followRadius: 300,
            tailDrainPerSecond: 2,
            loseGraceSeconds: 2.5,
          },
        ],
        failRules: [
          wantedPressureFailRule(
            2,
            'The clinic van was flagged by the sweep before it cleared the block.',
          ),
        ],
      },
    },
    {
      id: 'half-block-safehouse',
      title: 'Half Block Safehouse',
      hook: 'The block is coming apart building by building, and the people still on the street have nowhere marked to go.',
      primaryGoal:
        'Reach the three scattered residents before the block collapses, then lead the group to the shelter gate.',
      secondaryPressure:
        'The collapsing roads should force route changes mid-run instead of one clean line across the block.',
      failureState: 'Fail if the resident sweep times out or the group is cut off before the shelter gate.',
      payoff:
        "The rescued residents point Rook toward the black-market sellers hoarding the neighborhood's stolen medicine.",
      requiredSystems: ['timedMultiStop', 'escort'],
      prototypeRuntime: {
        id: 'half-block-safehouse',
        title: 'Half Block Safehouse',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the 3 scattered residents before the block collapses',
            targets: [
              { x: 512, y: 3648 },
              { x: 896, y: 3648 },
              { x: 1280, y: 3584 },
            ],
            radius: 80,
            timeLimitSeconds: 70,
          },
          {
            kind: 'survive',
            description: 'Lead the group to the shelter gate',
            seconds: 14,
          },
        ],
        reward: 4600,
      },
      prototypeScript: createEscortMissionScript({
        actorId: 'resident-group',
        route: [
          { x: 1280, y: 3584 },
          { x: 1024, y: 3392 },
          { x: 768, y: 3264 },
        ],
        speed: 40,
        failureText: 'The resident group was cut off before reaching the shelter gate.',
      }),
    },
    {
      id: 'medicine-debt',
      title: 'Medicine Debt',
      hook: "The black-market sellers hoarding the neighborhood's medicine do not all react the same way when Rook shows up.",
      primaryGoal:
        'Recover the stolen medicine caches from the sellers and put down the ones who spring an ambush instead of surrendering.',
      secondaryPressure:
        'Some sellers should stand down the moment Rook arrives, so the tension has to come from the ones who do not.',
      failureState: 'Fail if Rook is wasted or busted before every cache is recovered.',
      payoff:
        "The recovered medicine and the sellers' ledgers point straight at the church clinic the aid network is trying to protect.",
      requiredSystems: ['scriptedEncounter'],
      prototypeRuntime: {
        id: 'medicine-debt',
        title: 'Medicine Debt',
        objectives: [
          {
            kind: 'collect',
            description: 'Recover the 4 stolen medicine caches',
            count: 4,
          },
          {
            kind: 'eliminate',
            description: 'Put down the 2 sellers who spring the ambush',
            count: 2,
            targetsOnly: true,
          },
        ],
        reward: 4800,
      },
      prototypeScript: {
        primaryActorId: 'ambush-sellers',
        actors: [
          {
            kind: 'pedestrianSquad',
            actorId: 'ambush-sellers',
            center: { x: 1152, y: 3072 },
            count: 2,
            spread: 20,
            missionTargets: true,
          },
        ],
      },
    },
    {
      id: 'quiet-chapel',
      title: 'Quiet Chapel',
      hook: 'The aid network\'s church clinic is the last safe address the Switchboard has not touched yet, and tonight that changes.',
      primaryGoal:
        'Hold the church clinic through the raid, then get the doctors out through the cemetery gate after the front entrance falls.',
      secondaryPressure:
        'The defense should shift once the front door fails, forcing a fallback instead of one static holdout.',
      failureState:
        'Fail if the clinic falls before the doctors reach the cemetery gate, or if the doctors are lost during the evacuation.',
      payoff:
        'The neighborhood aid network commits fully to Rook, giving the resistance its first citywide safe-house line.',
      requiredSystems: ['defend', 'escort', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'quiet-chapel',
        title: 'Quiet Chapel',
        objectives: [
          {
            kind: 'defend',
            description: 'Hold the church clinic doors for 16 seconds',
            target: { x: 1408, y: 2944 },
            radius: 110,
            seconds: 16,
          },
          {
            kind: 'survive',
            description: 'Get the doctors clear through the cemetery gate',
            seconds: 12,
          },
        ],
        reward: 5500,
      },
      prototypeScript: {
        primaryActorId: 'clinic-raiders',
        actors: [],
        stages: [
          {
            id: 'clinic-hold',
            title: 'Hold the clinic doors',
            primaryActorId: 'clinic-raiders',
            districtState: {
              label: 'The raid is still hammering the chapel doors',
              summary:
                'The front entrance is holding for now, but the aid network is burning through every safe lane around the church.',
              serviceLaneBlocks: ['ambulance'],
              wantedPressureBonus: 1,
            },
            actors: [missionTargetSquadActor('clinic-raiders', { x: 1408, y: 2944 }, 4, 22)],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'cemetery-fallback',
            title: 'Get the doctors clear',
            primaryActorId: 'clinic-doctors',
            districtState: {
              label: 'The front entrance failed and the doctors are breaking for the cemetery gate',
              summary:
                'The clinic is lost, but the doctors can still make the safe-house line if you keep the fallback corridor open.',
              suppressNpcDriving: true,
              trafficSpeedMultiplier: 0.64,
              serviceLaneBlocks: ['ambulance', 'police'],
            },
            actors: [
              escortRouteActor(
                'clinic-doctors',
                [
                  { x: 1408, y: 2944 },
                  { x: 1600, y: 2752 },
                  { x: 1792, y: 2560 },
                ],
                38,
              ),
            ],
            failRules: [
              escortRadiusFailRule(
                'clinic-doctors',
                'The doctors were cut off before they reached the cemetery gate.',
              ),
            ],
          },
        ],
      },
    },
  ],
};
