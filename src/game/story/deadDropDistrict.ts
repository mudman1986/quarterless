import {
  missionTargetSquadActor,
  vehicleRouteActor,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const DEAD_DROP_DISTRICT: StoryChapter = {
  id: 'dead-drop-district',
  actId: 'find-the-missing-dispatcher',
  order: 1,
  title: 'Dead Drop District',
  storyRole:
    'Rook returns to the waterfront, learns Nia was moving evidence, and discovers someone is already cleaning up her trail.',
  combinedGoal:
    "Trace Nia's evidence trail from the waterfront lockers to the Pier 9 cleaners' office before the last physical proof is erased.",
  missions: [
    {
      id: 'night-ferry-run',
      title: 'Night Ferry Run',
      hook: 'Rook lands in a district that already feels watched.',
      primaryGoal: 'Reach the old dock motel and confirm Nia used it as a dead-drop stop.',
      secondaryPressure:
        'Patrol presence and cleanup spotters should steadily narrow safe routes into the motel block.',
      failureState:
        'Fail if Rook is wasted, busted, or the motel contact vanishes before the handoff point is reached.',
      payoff:
        'Rook finds the first dead-drop direction and learns the waterfront trail is active tonight, not cold history.',
      requiredSystems: ['scriptedEncounter'],
      prototypeRuntime: {
        id: 'night-ferry-run',
        title: 'Night Ferry Run',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the old dock motel before the watchers close in',
            target: { x: 640, y: 1088 },
            radius: 72,
          },
          {
            kind: 'survive',
            description: 'Stay moving for 12 seconds while the district wakes up',
            seconds: 12,
          },
        ],
        reward: 1500,
      },
      prototypeScript: {
        primaryActorId: 'dock-motel-runner',
        actors: [],
        stages: [
          {
            id: 'night-ferry-approach',
            title: 'Slip into the dock motel',
            districtState: {
              label: 'Dock spotters are still scanning the motel blocks',
              summary:
                'Reach the drop before the first cleanup watchers finish pinching the alleys around the old dock motel.',
              trafficSpeedMultiplier: 0.82,
              wantedPressureBonus: 1,
            },
            actors: [
              {
                kind: 'pedestrianRoute',
                actorId: 'dock-motel-runner',
                route: [
                  { x: 640, y: 1088 },
                  { x: 736, y: 1088 },
                  { x: 832, y: 1024 },
                ],
                speed: 42,
              },
            ],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'night-ferry-hold',
            title: 'Ride out the wake-up call',
            districtState: {
              label: 'The motel block is awake and closing around the drop',
              summary:
                'Cleanup spotters are lighting up the block now that the handoff is confirmed; keep moving until the wake-up call fades.',
              trafficSpeedMultiplier: 0.76,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'burned-locker',
      title: 'Burned Locker',
      hook: 'Three storage lockers hold the ledger fragments Nia split up before she disappeared.',
      primaryGoal:
        'Hit the lockers in time, recover every fragment, and break contact after the final pickup triggers a city response.',
      secondaryPressure:
        'The order should matter because each locker changes the next route with fresh cleanup crews and rising heat.',
      failureState:
        'Fail if any locker is permanently burned before the fragment is recovered or if Rook is stopped during extraction.',
      payoff:
        'The fragments reveal that evidence was being moved toward Pier 9 under ambulance cover.',
      requiredSystems: ['timedMultiStop', 'districtState', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'burned-locker',
        title: 'Burned Locker',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the 3 storage lockers in sequence before the trail goes cold',
            targets: [
              { x: 1024, y: 1472 },
              { x: 1472, y: 1472 },
              { x: 1920, y: 1472 },
            ],
            radius: 72,
            timeLimitSeconds: 75,
          },
          {
            kind: 'survive',
            description: 'Break contact for 15 seconds after the last grab',
            seconds: 15,
          },
        ],
        reward: 2200,
      },
      prototypeScript: {
        primaryActorId: 'burned-locker-net',
        actors: [],
        stages: [
          {
            id: 'burned-locker-first',
            title: 'Crack the first locker',
            districtState: {
              label: 'The first locker is still outside the full cleanup cordon',
              summary:
                'Get the waterfront fragment now; the next locker wakes the whole strip and collapses your clean approach.',
              trafficSpeedMultiplier: 0.8,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'routeProgress', count: 1 },
          },
          {
            id: 'burned-locker-second',
            title: 'Beat the middle sweep',
            districtState: {
              label: 'The middle lockers are pulling the response inward',
              summary:
                'Cleanup crews are shifting east and starting to read the route, forcing a faster cut between the next fragments.',
              trafficSpeedMultiplier: 0.68,
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
            },
            actors: [],
            nextWhen: { kind: 'routeProgress', count: 2 },
          },
          {
            id: 'burned-locker-third',
            title: 'Take the last fragment before it burns',
            districtState: {
              label: 'The last locker is about to burn with the district watching',
              summary:
                'The final locker is lighting up every scanner on the avenue; push through before the ambulance cover closes the lane.',
              trafficSpeedMultiplier: 0.6,
              suppressNpcDriving: true,
              serviceLaneBlocks: ['ambulance', 'police'],
              wantedPressureBonus: 2,
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'burned-locker-extract',
            title: 'Break contact with the fragments',
            districtState: {
              label: 'The waterfront sweep is collapsing on your exit lane',
              summary:
                'Every locker hit lit up the response; keep cutting forward until the sweep burns through its first rush.',
              trafficSpeedMultiplier: 0.55,
              suppressNpcDriving: true,
              serviceLaneBlocks: ['ambulance', 'police'],
              wantedPressureBonus: 2,
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'wreck-before-dawn',
      title: 'Wreck Before Dawn',
      hook: 'A cleanup van is carrying the next piece of the trail out of the district.',
      primaryGoal:
        'Stage a crash that blocks the van, seize the cargo manifest, and get clear before the district locks down.',
      secondaryPressure:
        'The collision must feel deliberate, with enough aftermath chaos that Rook can choose to fight through or peel away.',
      failureState:
        'Fail if the manifest burns with the van, the roadblock never sticks, or Rook is neutralized during the grab.',
      payoff: 'The manifest identifies the false ambulance team and their chop-garage destination.',
      requiredSystems: ['sabotage', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'wreck-before-dawn',
        title: 'Wreck Before Dawn',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the interception point before the cleanup van escapes the district',
            target: { x: 2368, y: 1088 },
            radius: 72,
          },
          {
            kind: 'eliminate',
            description: 'Take down 4 marked cleaners guarding the manifest',
            count: 4,
            targetsOnly: true,
          },
          {
            kind: 'survive',
            description: 'Hold the roadblock for 10 seconds and get clear',
            seconds: 10,
          },
        ],
        reward: 3200,
      },
      prototypeScript: {
        primaryActorId: 'cleanup-van',
        actors: [],
        stages: [
          {
            id: 'wreck-intercept',
            title: 'Cut off the cleanup van',
            districtState: {
              label: 'The cleanup van is still trying to slip past the dock choke point',
              summary:
                'Beat it to the roadblock window before the blockers peel off and the manifest disappears into the dawn traffic.',
              trafficSpeedMultiplier: 0.72,
              serviceLaneBlocks: ['tow'],
            },
            actors: [
              vehicleRouteActor(
                'cleanup-van',
                'van',
                [
                  { x: 2240, y: 1152 },
                  { x: 2368, y: 1088 },
                  { x: 2496, y: 1024 },
                ],
                92,
                { followRadius: 260 },
              ),
            ],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'manifest-grab',
            title: 'Pull the manifest off the wreck crew',
            primaryActorId: 'pier-9-manifest-crew',
            districtState: {
              label: 'The roadblock is live and the manifest crew is digging in',
              summary:
                'Marked cleaners are trying to burn the papers while the crash lane buys them one last defensive pocket.',
              suppressNpcDriving: true,
              serviceLaneBlocks: ['police'],
              wantedPressureBonus: 1,
            },
            actors: [missionTargetSquadActor('pier-9-manifest-crew', { x: 2368, y: 1088 }, 4, 24)],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 2 },
          },
          {
            id: 'wreck-hold',
            title: 'Hold the block and clear out',
            districtState: {
              label: 'The crash lane is pinched shut while reinforcements pile in',
              summary:
                'The manifest is yours, but the roadblock only sticks if you hold the avenue a few beats longer before peeling away.',
              suppressNpcDriving: true,
              trafficSpeedMultiplier: 0.58,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'false-ambulance',
      title: 'False Ambulance',
      hook: 'Someone is using emergency livery to move witnesses without scrutiny.',
      primaryGoal:
        'Stop the fake ambulance before it reaches the chop garage: pin it, force it to stop, or blow it up.',
      secondaryPressure:
        'The ambulance keeps moving unless Rook gets close enough to shut the lane down, so the chase still needs a real interception.',
      failureState:
        'Fail if the ambulance escapes the district before the witness is secured or the witness is killed in the stop.',
      payoff:
        "The rescued contact confirms the cleaners are storing Nia's badge and paper trail in the Pier 9 office.",
      requiredSystems: ['tail', 'capture', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'false-ambulance',
        title: 'False Ambulance',
        objectives: [
          {
            kind: 'capture',
            description: 'Stop the fake ambulance before it reaches the chop garage',
            seconds: 3,
          },
        ],
        reward: 4200,
      },
      prototypeScript: {
        primaryActorId: 'false-ambulance-van',
        actors: [],
        stages: [
          {
            id: 'false-ambulance-stop',
            title: 'Stop the ambulance',
            primaryActorId: 'false-ambulance-van',
            districtState: {
              label: 'Stop the fake ambulance before it reaches the chop garage',
              summary:
                'Box it in anywhere on the route or blow it up before the crew reaches the garage.',
              serviceLaneBlocks: ['ambulance'],
            },
            actors: [
              vehicleRouteActor(
                'false-ambulance-van',
                'ambulance',
                [
                  { x: 2560, y: 1472 },
                  { x: 2784, y: 1472 },
                  { x: 3008, y: 1472 },
                  { x: 3248, y: 1352 },
                  { x: 3456, y: 1216 },
                  { x: 3568, y: 1120 },
                  { x: 3648, y: 1024 },
                ],
                120,
                {
                  followRadius: 320,
                  captureRadius: 140,
                  captureMaxSpeed: 65,
                  tailDrainPerSecond: 2,
                  loseGraceSeconds: 2.5,
                },
              ),
            ],
            nextWhen: { kind: 'captureSeconds', seconds: 1 },
          },
          {
            id: 'false-ambulance-boxed-in',
            title: 'Hold the stop long enough to pull the witness clear',
            primaryActorId: 'false-ambulance-van',
            districtState: {
              label: 'The witness lane is shut but the crew is still fighting to break it open',
              summary:
                'Keep the fake ambulance pinned for a few more seconds so the witness can be dragged out before the chop garage crew regains momentum.',
              serviceLaneBlocks: ['ambulance', 'police'],
              suppressNpcDriving: true,
            },
            actors: [
              vehicleRouteActor(
                'false-ambulance-van',
                'ambulance',
                [
                  { x: 2560, y: 1472 },
                  { x: 2784, y: 1472 },
                  { x: 3008, y: 1472 },
                  { x: 3248, y: 1352 },
                  { x: 3456, y: 1216 },
                  { x: 3568, y: 1120 },
                  { x: 3648, y: 1024 },
                ],
                120,
                {
                  followRadius: 320,
                  captureRadius: 140,
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
      id: 'last-call-at-pier-9',
      title: 'Last Call At Pier 9',
      hook: "Rook reaches the cleaners' last strongpoint before dawn burns the evidence for good.",
      primaryGoal:
        "Break into the pier office, take down the marked cleaners, recover Nia's dispatch badge, and survive the counterpush.",
      secondaryPressure:
        'The escape route should stay pinched until the office is cleared, forcing a short hold under converging pressure.',
      failureState:
        'Fail if Rook dies, is arrested during the holdout, or leaves without the badge.',
      payoff: 'Act I now has a tangible artifact tying Nia to the wider Switchboard conspiracy.',
      prototypeRuntime: {
        id: 'last-call-at-pier-9',
        title: 'Last Call At Pier 9',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the Pier 9 office (yellow ring)',
            target: { x: 3520, y: 704 },
            radius: 72,
          },
          {
            kind: 'eliminate',
            description: 'Take down 6 marked cleaners',
            count: 6,
            targetsOnly: true,
          },
          {
            kind: 'survive',
            description: 'Survive the counterpush for 20 seconds',
            seconds: 20,
          },
        ],
        reward: 5500,
      },
      prototypeScript: {
        primaryActorId: 'pier-9-office',
        actors: [],
        stages: [
          {
            id: 'pier-9-breach',
            title: 'Punch into the office',
            districtState: {
              label: 'Pier 9 is still trying to burn the office ledgers',
              summary:
                'Reach the office before the cleaners fully reset the evidence room and dump the last trace tying Nia to the pier.',
              trafficSpeedMultiplier: 0.78,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'pier-9-clear',
            title: 'Clear the office cleaners',
            primaryActorId: 'pier-9-cleaners',
            districtState: {
              label: 'The evidence room is live and the cleaners are holding the badge',
              summary:
                'The last marked crew is dug in around Nia’s dispatch badge while the pier tries to choke the office exits.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [missionTargetSquadActor('pier-9-cleaners', { x: 3520, y: 704 }, 6, 22)],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 2 },
          },
          {
            id: 'pier-9-counterpush',
            title: 'Survive the counterpush',
            districtState: {
              label: 'Pier 9 is locking the avenues while the counterpush closes in',
              summary:
                'The badge is secure, but the exit stays pinched until the first wave of reinforcements burns itself out.',
              suppressNpcDriving: true,
              trafficSpeedMultiplier: 0.52,
              serviceLaneBlocks: ['police', 'ambulance', 'tow'],
            },
            actors: [],
          },
        ],
      },
    },
  ],
};
