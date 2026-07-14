import {
  createProtectedVehicleTailScript,
  missionTargetSquadActor,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const THE_MINISTER_OF_CARE: StoryChapter = {
  id: 'the-minister-of-care',
  actId: 'break-the-four-pillars',
  order: 4,
  title: 'The Minister Of Care',
  storyRole:
    'Rook tears into the health-services pillar that weaponized ambulance scarcity, dead beds, and hidden casualties as tools of power.',
  combinedGoal:
    'Recover the missing medicine, keep the whistleblower alive, force the emergency doors open, and drag the hidden casualty records into daylight before the morgue locks down.',
  presentation: {
    opener: {
      speaker: 'Rook Vance',
      role: 'Naming the hidden dead',
      kicker: 'Count The Hidden Bodies',
    },
  },
  missions: [
    {
      id: 'short-supply',
      title: 'Short Supply',
      hook: 'The stolen medicine is scattered across fake clinics because scarcity is more useful when it looks accidental.',
      primaryGoal:
        'Recover the marked medicine caches before the stock is moved deeper into the resale chain.',
      secondaryPressure:
        'The encounters should be quick and ugly, with the point being reclamation rather than total extermination.',
      failureState: 'Fail if the medicine caches disappear into the resale network before they are recovered.',
      payoff:
        'Rook gets enough stock back to bring a whistleblower doctor out of hiding.',
      requiredSystems: ['timedMultiStop'],
      prototypeRuntime: {
        id: 'short-supply',
        title: 'Short Supply',
        objectives: [
          {
            kind: 'collect',
            description: 'Recover the 3 stolen medicine caches before they are resold',
            count: 3,
          },
        ],
        reward: 7600,
      },
      prototypeScript: {
        primaryActorId: 'short-supply-grid',
        actors: [],
        stages: [
          {
            id: 'short-supply-reclaim',
            title: 'Pull the medicine back out of circulation',
            districtState: {
              label: 'The fake clinics are still moving stock like panic is a commodity',
              summary:
                'Get the medicine first and the resale chain loses the scarcity it planned to profit from tonight.',
              trafficSpeedMultiplier: 0.78,
              wantedPressureBonus: 1,
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'bed-count',
      title: 'Bed Count',
      hook: 'The doctor will talk if they live long enough to cross the two hot zones the ministry left to rot.',
      primaryGoal:
        'Stay with the ambulance carrying the whistleblower and keep it healthy enough to clear both hot zones alive.',
      secondaryPressure:
        'The tension should be shared between passenger safety and vehicle condition, not just route speed.',
      failureState: 'Fail if the ambulance is lost or too badly damaged before the doctor clears the hot zones.',
      payoff:
        'The doctor names the locked emergency entrance that has been refusing the districts the ministry wrote off.',
      requiredSystems: ['tail', 'vehicleCondition', 'districtState'],
      prototypeRuntime: {
        id: 'bed-count',
        title: 'Bed Count',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay with the whistleblower ambulance for 14 seconds through the hot zones',
            seconds: 14,
          },
        ],
        reward: 8000,
      },
      prototypeScript: createProtectedVehicleTailScript({
        actorId: 'bed-count-ambulance',
        vehicleKind: 'ambulance',
        route: [
          { x: 3136, y: 2560 },
          { x: 2880, y: 2816 },
          { x: 2624, y: 3008 },
          { x: 2368, y: 3136 },
        ],
        speed: 92,
        followRadius: 320,
        minHealth: 48,
        failureText: 'The whistleblower ambulance did not survive the hot-zone transfer.',
      }),
    },
    {
      id: 'intake-refusal',
      title: 'Intake Refusal',
      hook: 'The emergency entrance is locked because the ministry decided some bodies do not count as a crisis worth seeing.',
      primaryGoal:
        'Reach the emergency entrance, force it open, and hold the lane long enough for civilians to flood inside.',
      secondaryPressure:
        'The breach should matter because it changes who gets to live, not because the door itself is dramatic.',
      failureState: 'Fail if the emergency entrance reseals before the civilian surge gets in.',
      payoff:
        'The intake lane breaks open and the hospital annex becomes vulnerable to a deeper push.',
      requiredSystems: ['defend', 'districtState'],
      prototypeRuntime: {
        id: 'intake-refusal',
        title: 'Intake Refusal',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the locked emergency entrance before the ministry sweep closes it again',
            target: { x: 3456, y: 2624 },
            radius: 88,
          },
          {
            kind: 'defend',
            description: 'Hold the entrance for 16 seconds while civilians flood through',
            target: { x: 3456, y: 2624 },
            radius: 124,
            seconds: 16,
          },
        ],
        reward: 8400,
      },
      prototypeScript: {
        primaryActorId: 'intake-refusal-door',
        actors: [],
        stages: [
          {
            id: 'intake-refusal-entry',
            title: 'Break the emergency door open',
            districtState: {
              label: 'The entrance is still one ministry order away from vanishing again',
              summary:
                'Get the lane open before the refusal becomes another dead statistic hidden behind a policy code.',
              trafficSpeedMultiplier: 0.74,
              serviceLaneBlocks: ['ambulance'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'intake-refusal-hold',
            title: 'Keep the lane alive',
            districtState: {
              label: 'The entrance is open and people are finally making it inside',
              summary:
                'Hold the line long enough that the ministry cannot pretend this was ever a capacity problem instead of a choice.',
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
      id: 'white-hallway',
      title: 'White Hallway',
      hook: 'Private guards and terrified staff are all mixed together inside the annex, which means target identification matters as much as speed.',
      primaryGoal:
        'Reach the annex and drop the marked private guards without turning the whole ward into blind collateral.',
      secondaryPressure:
        'Combat readability should be the challenge here, not raw enemy volume.',
      failureState: 'Fail if the marked guards hold the annex long enough to wipe the ward records.',
      payoff:
        'The annex falls and the morgue archive is left exposed behind a failing ministry lockdown.',
      requiredSystems: ['scriptedEncounter'],
      prototypeRuntime: {
        id: 'white-hallway',
        title: 'White Hallway',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the annex before the private guards wipe the ward records',
            target: { x: 3136, y: 1728 },
            radius: 84,
          },
          {
            kind: 'eliminate',
            description: 'Drop the 4 marked private guards in the annex',
            count: 4,
            targetsOnly: true,
          },
        ],
        reward: 8800,
      },
      prototypeScript: {
        primaryActorId: 'white-hallway-guards',
        actors: [],
        stages: [
          {
            id: 'white-hallway-entry',
            title: 'Push into the annex',
            districtState: {
              label: 'The annex is still crowded enough for the guards to hide in plain sight',
              summary:
                'Reach the hallway before the ward records die in the same confusion the ministry manufactured on purpose.',
              trafficSpeedMultiplier: 0.76,
              serviceLaneBlocks: ['taxi'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'white-hallway-guards',
            title: 'Pick the private guards out of the ward',
            primaryActorId: 'white-hallway-guards',
            districtState: {
              label: 'The guards are still mixed with frightened staff and patients',
              summary:
                'Drop the marked guards cleanly and the annex finally becomes a hospital again instead of a private kill zone.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
            },
            actors: [missionTargetSquadActor('white-hallway-guards', { x: 3136, y: 1728 }, 4, 24)],
          },
        ],
      },
    },
    {
      id: 'name-the-dead',
      title: 'Name The Dead',
      hook: 'The hidden casualty archive is in the morgue because the ministry never expected anyone to force open the numbers from the side of the dead.',
      primaryGoal:
        'Reach the morgue archive, hold it while the casualty records upload, and survive the final lockdown sweep.',
      secondaryPressure:
        'The fourth pillar should fall because the truth can no longer be buried, not because another boss dies off-camera.',
      failureState: 'Fail if the casualty archive locks down before the names go public.',
      payoff:
        'The ministry\'s hidden body count goes live and the fourth pillar falls under the weight of every death it erased.',
      requiredSystems: ['defend', 'districtState'],
      prototypeRuntime: {
        id: 'name-the-dead',
        title: 'Name The Dead',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the morgue archive before the lockdown hard-seals it',
            target: { x: 3520, y: 640 },
            radius: 88,
          },
          {
            kind: 'defend',
            description: 'Hold the morgue archive for 18 seconds while the casualty records upload',
            target: { x: 3520, y: 640 },
            radius: 124,
            seconds: 18,
          },
          {
            kind: 'survive',
            description: 'Survive the final lockdown sweep for 12 seconds',
            seconds: 12,
          },
        ],
        reward: 10200,
      },
      prototypeScript: {
        primaryActorId: 'name-the-dead-archive',
        actors: [],
        stages: [
          {
            id: 'name-the-dead-entry',
            title: 'Reach the morgue archive',
            districtState: {
              label: 'The hidden casualty ledger is still one sealed floor away from daylight',
              summary:
                'Get there before the ministry closes the morgue into another place where the dead can be counted only privately.',
              trafficSpeedMultiplier: 0.72,
              serviceLaneBlocks: ['ambulance'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'name-the-dead-hold',
            title: 'Upload the hidden casualty list',
            districtState: {
              label: 'The names are going live and the ministry cannot stop hearing them',
              summary:
                'Hold the archive through the upload and the body count becomes a public indictment instead of a hidden policy cost.',
              suppressNpcDriving: true,
              wantedPressureBonus: 2,
              blackoutIntersections: true,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 2 },
          },
          {
            id: 'name-the-dead-lockdown',
            title: 'Survive the lockdown sweep',
            districtState: {
              label: 'The archive is public and the ministry is collapsing into panic',
              summary:
                'The names are out; now live long enough for the fourth pillar to break under them.',
              suppressNpcDriving: true,
              trafficSpeedMultiplier: 0.58,
              serviceLaneBlocks: ['police', 'ambulance', 'tow'],
            },
            actors: [],
          },
        ],
      },
    },
  ],
};