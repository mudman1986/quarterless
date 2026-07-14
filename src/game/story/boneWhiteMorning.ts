import {
  actorVehicleConditionFailRule,
  createEscortMissionScript,
  createWantedPressureMissionScript,
  missionTargetSquadActor,
  vehicleRouteActor,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const BONE_WHITE_MORNING: StoryChapter = {
  id: 'bone-white-morning',
  actId: 'expose-the-machine',
  order: 6,
  title: 'Bone White Morning',
  storyRole:
    'Rook finds the industrial chain that moved missing dispatchers and witnesses off the books, and finally hears Nia name the Board that has been treating the city like inventory.',
  combinedGoal:
    'Trace the detention route, split the transport convoy, free the surviving captives, and recover Nia\'s recorded proof before the Board relocates her again.',
  presentation: {
    opener: {
      speaker: 'Rook Vance',
      role: 'Following the hidden convoys',
      kicker: 'The Bays Beneath The City',
    },
  },
  missions: [
    {
      id: 'quarry-wake',
      title: 'Quarry Wake',
      hook: 'The detention site only looks empty if you never stop to read how the routine actually moves.',
      primaryGoal:
        'Reach the three survey points around the industrial yard and finish the recon pass before the spotters burn the line.',
      secondaryPressure:
        'This should feel like fragile reconnaissance under pressure, not a raid on the first pass.',
      failureState: 'Fail if the yard goes fully active before the recon line is complete.',
      payoff:
        'Rook confirms the site is moving living captives, not just shuffling sealed freight.',
      requiredSystems: ['stealth', 'districtState'],
      prototypeRuntime: {
        id: 'quarry-wake',
        title: 'Quarry Wake',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the 3 survey points before the yard wakes fully up',
            targets: [
              { x: 704, y: 768 },
              { x: 1344, y: 640 },
              { x: 1984, y: 704 },
            ],
            radius: 84,
            timeLimitSeconds: 76,
          },
        ],
        reward: 6000,
      },
      prototypeScript: createWantedPressureMissionScript({
        id: 'quarry-wake-cover',
        title: 'Keep the yard from fully waking up',
        label: 'The industrial yard still reads as routine from a distance',
        summary:
          'Finish the recon pass before the spotters stop seeing a drifting vehicle and start seeing a live witness.',
        minStars: 2,
        failureText: 'The recon line burned once the industrial yard woke fully up.',
        trafficSpeedMultiplier: 0.78,
        wantedPressureBonus: 1,
      }),
    },
    {
      id: 'freight-coffin',
      title: 'Freight Coffin',
      hook: 'The sealed transport is only useful if it arrives intact enough to prove there were live captives inside.',
      primaryGoal:
        'Pin the transport truck without destroying it and hold it long enough to force the cargo bay open.',
      secondaryPressure:
        'The stop should reward control and restraint, because too much damage kills the proof as surely as an escape does.',
      failureState: 'Fail if the transport truck is destroyed before the bay is opened.',
      payoff:
        'The truck opens with live captives inside, confirming the detention network has been moving people, not evidence.',
      requiredSystems: ['capture', 'vehicleCondition', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'freight-coffin',
        title: 'Freight Coffin',
        objectives: [
          {
            kind: 'capture',
            description: 'Hold the transport truck for 3 seconds and force the bay open',
            seconds: 3,
          },
        ],
        reward: 6400,
      },
      prototypeScript: {
        primaryActorId: 'freight-coffin-truck',
        actors: [],
        stages: [
          {
            id: 'freight-coffin-stop',
            title: 'Stop the transport intact',
            primaryActorId: 'freight-coffin-truck',
            districtState: {
              label: 'The sealed truck is still trying to clear the industrial route intact',
              summary:
                'Catch it cleanly enough to prove what is inside before the detention chain can burn another load of witnesses.',
              trafficSpeedMultiplier: 0.8,
            },
            actors: [
              vehicleRouteActor(
                'freight-coffin-truck',
                'van',
                [
                  { x: 2240, y: 1152 },
                  { x: 2368, y: 1088 },
                  { x: 2496, y: 1024 },
                  { x: 2720, y: 1056 },
                ],
                92,
                {
                  followRadius: 340,
                  captureRadius: 145,
                  captureMaxSpeed: 60,
                  tailDrainPerSecond: 2,
                  loseGraceSeconds: 2.5,
                },
              ),
            ],
            failRules: [
              actorVehicleConditionFailRule(
                'freight-coffin-truck',
                48,
                'The transport was wrecked before the captives could be proven alive.',
                0.5,
              ),
            ],
          },
        ],
      },
    },
    {
      id: 'split-convoy',
      title: 'Split Convoy',
      hook: 'The decoy transports only matter until the route is broken hard enough that the real truck has to show itself.',
      primaryGoal:
        'Reach the blackout junction, split the convoy, and drop the marked escorts covering the real transport.',
      secondaryPressure:
        'The convoy should be solved by lane control first and violence second.',
      failureState: 'Fail if the real transport clears the junction before the escort screen breaks.',
      payoff:
        'The exposed route gives up the lower-bay detention entrance and the path to the surviving captives.',
      requiredSystems: ['districtState', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'split-convoy',
        title: 'Split Convoy',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the blackout junction before the convoy clears it',
            target: { x: 2272, y: 928 },
            radius: 84,
          },
          {
            kind: 'eliminate',
            description: 'Drop the 3 marked convoy escorts',
            count: 3,
            targetsOnly: true,
          },
        ],
        reward: 6900,
      },
      prototypeScript: {
        primaryActorId: 'split-convoy-escorts',
        actors: [],
        stages: [
          {
            id: 'split-convoy-junction',
            title: 'Blackout the junction and split the convoy',
            districtState: {
              label: 'The convoy still depends on a clean signal run through the junction',
              summary:
                'Kill the order at the lights and the decoys break away from the real transport instead of hiding it.',
              blackoutIntersections: true,
              trafficSpeedMultiplier: 0.7,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'split-convoy-escorts',
            title: 'Drop the exposed escorts',
            primaryActorId: 'split-convoy-escorts',
            districtState: {
              label: 'The real transport is visible now that the escort box is split',
              summary:
                'Take the marked escorts off the lane before they can reseal the transport behind another decoy run.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [missionTargetSquadActor('split-convoy-escorts', { x: 2272, y: 928 }, 3, 22)],
          },
        ],
      },
    },
    {
      id: 'the-lower-bays',
      title: 'The Lower Bays',
      hook: 'The captives can still be pulled out, but only if the lower bays are opened cell by cell and the survivors kept moving.',
      primaryGoal:
        'Free the surviving captives from the lower bays and keep the group together until the exit lane clears.',
      secondaryPressure:
        'The rescue should feel like evacuation triage rather than a total clear of every room.',
      failureState: 'Fail if the surviving captives are cut off before the lower-bay exit opens.',
      payoff:
        'The survivors escape with names, routes, and one last recorder location tied directly to Nia.',
      requiredSystems: ['escort', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'the-lower-bays',
        title: 'The Lower Bays',
        objectives: [
          {
            kind: 'collect',
            description: 'Free the 4 surviving captives in the lower bays',
            count: 4,
          },
          {
            kind: 'survive',
            description: 'Keep the survivor group moving for 14 seconds to the extraction lane',
            seconds: 14,
          },
        ],
        reward: 7400,
      },
      prototypeScript: createEscortMissionScript({
        actorId: 'lower-bays-survivors',
        route: [
          { x: 3136, y: 2560 },
          { x: 2880, y: 2816 },
          { x: 2624, y: 3008 },
          { x: 2368, y: 3136 },
        ],
        speed: 36,
        failureText: 'The survivors were cut off before the lower-bay exit opened.',
      }),
    },
    {
      id: 'nias-voice',
      title: "Nia's Voice",
      hook: 'The recorder is real, and so is the proof that Nia reached long enough to name the Board before she was moved again.',
      primaryGoal:
        'Reach the recorder site, hold the line while the message is pulled, and survive the last industrial sweep.',
      secondaryPressure:
        'The scene should land as revelation under fire, not a quiet file pickup.',
      failureState: 'Fail if the recorder is destroyed before Nia\'s message is fully recovered.',
      payoff:
        'Nia names the Board\'s four pillars and confirms she is still alive, setting up the final war against the city\'s owners.',
      requiredSystems: ['defend', 'districtState'],
      prototypeRuntime: {
        id: 'nias-voice',
        title: "Nia's Voice",
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the recorder site before the cleanup crew gets there first',
            target: { x: 3520, y: 640 },
            radius: 88,
          },
          {
            kind: 'defend',
            description: 'Hold the recorder site for 16 seconds while Nia\'s message is recovered',
            target: { x: 3520, y: 640 },
            radius: 124,
            seconds: 16,
          },
          {
            kind: 'survive',
            description: 'Survive the final industrial sweep for 12 seconds',
            seconds: 12,
          },
        ],
        reward: 8200,
      },
      prototypeScript: {
        primaryActorId: 'nias-voice-site',
        actors: [],
        stages: [
          {
            id: 'nias-voice-entry',
            title: 'Reach the recorder before the cleanup team',
            districtState: {
              label: 'The recorder site is still one push ahead of the sweep',
              summary:
                'Get there now or the Board buries the last message Nia left before she was moved again.',
              trafficSpeedMultiplier: 0.72,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'nias-voice-hold',
            title: 'Keep Nia\'s message alive',
            districtState: {
              label: 'The recorder is live and pulling the Board into the open',
              summary:
                'Hold the site long enough for the full message to land before the industrial sweep crushes the evidence again.',
              suppressNpcDriving: true,
              wantedPressureBonus: 2,
              blackoutIntersections: true,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 2 },
          },
          {
            id: 'nias-voice-sweep',
            title: 'Survive the industrial sweep',
            districtState: {
              label: 'The message is out and the whole detention chain is panicking',
              summary:
                'Nia named the Board; now live through the first retaliatory sweep and carry that truth into the final act.',
              suppressNpcDriving: true,
              trafficSpeedMultiplier: 0.6,
              serviceLaneBlocks: ['police', 'ambulance', 'tow'],
            },
            actors: [],
          },
        ],
      },
    },
  ],
};