import {
  createEscortMissionScript,
  missionTargetSquadActor,
  vehicleRouteActor,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const THE_MISSING_SHIFT: StoryChapter = {
  id: 'the-missing-shift',
  actId: 'expose-the-machine',
  order: 2,
  title: 'The Missing Shift',
  storyRole:
    "Rook follows the vanished dispatchers who worked Nia's last night, turning a rumor of disappearances into a paper trail that proves she was moved under an official lie.",
  combinedGoal:
    'Recover the missing dispatchers\' hidden clues, bait out the cleaners shadowing them, and break into the central roster office before the false-death paperwork disappears for good.',
  presentation: {
    opener: {
      speaker: 'Rook Vance',
      role: 'Following the missing voices',
      kicker: 'Dispatchers Gone Missing',
    },
  },
  missions: [
    {
      id: 'clock-in-ghosts',
      title: 'Clock-In Ghosts',
      hook: 'Three dispatchers left clues in their apartments before the cleaners arrived with gasoline and false reports.',
      primaryGoal:
        'Reach the three apartments in sequence, pull the hidden clues, and keep moving before the torch teams close the loop.',
      secondaryPressure:
        'The mission should feel investigative but hurried, with each apartment tightening the next approach.',
      failureState: 'Fail if the cleaners burn the remaining apartments before the clues are recovered.',
      payoff:
        'The clues point at a disused dispatch room that was only powered up once, on the night Nia vanished.',
      requiredSystems: ['timedMultiStop', 'districtState'],
      prototypeRuntime: {
        id: 'clock-in-ghosts',
        title: 'Clock-In Ghosts',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the 3 dispatcher apartments before the cleaners torch the trail',
            targets: [
              { x: 704, y: 768 },
              { x: 1344, y: 640 },
              { x: 1984, y: 704 },
            ],
            radius: 84,
            timeLimitSeconds: 80,
          },
          {
            kind: 'survive',
            description: 'Stay ahead of the torch teams for 10 seconds with the clues intact',
            seconds: 10,
          },
        ],
        reward: 5200,
      },
      prototypeScript: {
        primaryActorId: 'clock-in-ghosts-window',
        actors: [],
        stages: [
          {
            id: 'clock-in-ghosts-route',
            title: 'Pull the apartment clues before the fires start',
            districtState: {
              label: 'The cleaners are still split across the dispatcher apartments',
              summary:
                'Each apartment clue still exists, but the torch teams are reading the same addresses and closing the grid.',
              trafficSpeedMultiplier: 0.78,
              wantedPressureBonus: 1,
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'clock-in-ghosts-exit',
            title: 'Keep the clues moving',
            districtState: {
              label: 'The apartment trail is burning behind you now',
              summary:
                'The clues are safe only if you stay ahead of the torch teams long enough to clear the block network.',
              trafficSpeedMultiplier: 0.68,
              suppressNpcDriving: true,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'switch-room-bait',
      title: 'Switch Room Bait',
      hook: 'The disused switch room only needs one spark of power to bring the watchers running back to it.',
      primaryGoal:
        'Reach the switch room, restore the panel, and hold the room while the shutdown crew exposes itself.',
      secondaryPressure:
        'The tension should come from waiting inside a trap you armed yourself, not from crossing open ground.',
      failureState: 'Fail if the room is retaken before the shutdown crew commits to the bait.',
      payoff:
        'The captured shutdown crew gives up the radio phrase used to route the missing dispatchers between districts.',
      requiredSystems: ['defend', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'switch-room-bait',
        title: 'Switch Room Bait',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the dead dispatch room before the shutdown crew cuts power again',
            target: { x: 2176, y: 960 },
            radius: 84,
          },
          {
            kind: 'defend',
            description: 'Hold the switch room for 14 seconds while the bait power-up runs',
            target: { x: 2176, y: 960 },
            radius: 120,
            seconds: 14,
          },
          {
            kind: 'eliminate',
            description: 'Drop the 3 marked shutdown crew cleaners',
            count: 3,
            targetsOnly: true,
          },
        ],
        reward: 5600,
      },
      prototypeScript: {
        primaryActorId: 'switch-room-crew',
        actors: [],
        stages: [
          {
            id: 'switch-room-entry',
            title: 'Bring the room back online',
            districtState: {
              label: 'The switch room is still dark enough to reach cleanly',
              summary:
                'Get the bait power-up started before the shutdown crew reseals the room under another maintenance lie.',
              trafficSpeedMultiplier: 0.8,
              serviceLaneBlocks: ['ambulance'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'switch-room-hold',
            title: 'Hold until the shutdown crew shows',
            districtState: {
              label: 'The room is live and drawing the shutdown crew back in',
              summary:
                'Keep the room open until the crew commits and exposes which reroute phrase it is protecting.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 2 },
          },
          {
            id: 'switch-room-cleaners',
            title: 'Drop the shutdown crew',
            primaryActorId: 'switch-room-crew',
            districtState: {
              label: 'The shutdown crew is inside the room and committed to the wipe',
              summary:
                'The trap worked; take the marked cleaners before they can flatten the room and erase the phrase again.',
              suppressNpcDriving: true,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [missionTargetSquadActor('switch-room-crew', { x: 2176, y: 960 }, 3, 20)],
          },
        ],
      },
    },
    {
      id: 'voiceprint-chase',
      title: 'Voiceprint Chase',
      hook: 'The spoofed radio caller can only be traced by following which repeaters echo the same code phrase.',
      primaryGoal:
        'Triangulate the repeating call across three districts, then trap the spoof van before it clears the route.',
      secondaryPressure:
        'The chase should begin as signal reading and turn into a hard interception once the voiceprint resolves.',
      failureState: 'Fail if the spoof van escapes before the route is pinned down and boxed in.',
      payoff:
        'The spoof rig reveals the union tunnel where the missing dispatchers were moved between holding sites.',
      requiredSystems: ['tail', 'capture', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'voiceprint-chase',
        title: 'Voiceprint Chase',
        objectives: [
          {
            kind: 'route',
            description: 'Hit the 3 echo districts and finish the triangulation',
            targets: [
              { x: 2816, y: 1152 },
              { x: 3136, y: 1728 },
              { x: 3520, y: 640 },
            ],
            radius: 84,
            timeLimitSeconds: 78,
          },
          {
            kind: 'capture',
            description: 'Pin the spoof van long enough to seize the voiceprint rig',
            seconds: 3,
          },
        ],
        reward: 6100,
      },
      prototypeScript: {
        primaryActorId: 'voiceprint-van',
        actors: [],
        stages: [
          {
            id: 'voiceprint-triangulate',
            title: 'Finish the triangulation',
            districtState: {
              label: 'The spoof call is still bouncing between districts',
              summary:
                'The phrase keeps echoing off the same repeaters; hit each district fast enough to resolve where the van is really running.',
              trafficSpeedMultiplier: 0.76,
              wantedPressureBonus: 1,
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'voiceprint-van',
            title: 'Trap the spoof van',
            primaryActorId: 'voiceprint-van',
            districtState: {
              label: 'The voiceprint rig is mobile now that its cover is blown',
              summary:
                'Box the van in before the caller dumps the rig and reroutes the dispatchers through another lie.',
              trafficSpeedMultiplier: 0.8,
              serviceLaneBlocks: ['police'],
            },
            actors: [
              vehicleRouteActor(
                'voiceprint-van',
                'van',
                [
                  { x: 3136, y: 1728 },
                  { x: 3328, y: 1280 },
                  { x: 3584, y: 1216 },
                ],
                108,
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
      id: 'union-tunnel',
      title: 'Union Tunnel',
      hook: 'The rescued dispatchers know one tunnel still runs between the holding sites, but it is being pinched from both ends.',
      primaryGoal:
        'Lead the dispatcher group through the maintenance tunnel and keep them moving until the far-side union exit opens.',
      secondaryPressure:
        'The route should feel claustrophobic and one-way, with no room to let the escort fall behind.',
      failureState: 'Fail if the dispatcher group is separated from Rook inside the tunnel run.',
      payoff:
        'The group reaches safety and identifies the central roster office that buried Nia under a false death certificate.',
      requiredSystems: ['escort', 'districtState'],
      prototypeRuntime: {
        id: 'union-tunnel',
        title: 'Union Tunnel',
        objectives: [
          {
            kind: 'route',
            description: 'Clear the 3 tunnel junctions with the dispatcher group intact',
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
            description: 'Keep the dispatchers moving for 12 seconds to the union exit',
            seconds: 12,
          },
        ],
        reward: 6500,
      },
      prototypeScript: createEscortMissionScript({
        actorId: 'dispatcher-group',
        route: [
          { x: 3136, y: 2560 },
          { x: 2880, y: 2816 },
          { x: 2624, y: 3008 },
          { x: 2368, y: 3136 },
        ],
        speed: 38,
        failureText: 'The dispatcher group was cut off inside the tunnel.',
      }),
    },
    {
      id: 'shift-ledger',
      title: 'Shift Ledger',
      hook: 'The central roster office still holds the ledger that turned Nia into a false casualty on paper.',
      primaryGoal:
        'Reach the roster office, recover the live shift ledger caches, and live through the first records-room dragnet.',
      secondaryPressure:
        'The final beat should be a hard proof grab under pressure, not a long search through office floors.',
      failureState: 'Fail if the shift ledger is destroyed before every live cache is recovered.',
      payoff:
        'Rook learns Nia was moved alive under a forged death certificate, turning the investigation into a live rescue.',
      requiredSystems: ['scriptedEncounter'],
      prototypeRuntime: {
        id: 'shift-ledger',
        title: 'Shift Ledger',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the central roster office before the dragnet seals it',
            target: { x: 2720, y: 1056 },
            radius: 84,
          },
          {
            kind: 'collect',
            description: 'Recover the 3 live shift ledger caches',
            count: 3,
          },
          {
            kind: 'survive',
            description: 'Survive the records-room dragnet for 12 seconds',
            seconds: 12,
          },
        ],
        reward: 7200,
      },
      prototypeScript: {
        primaryActorId: 'shift-ledger-room',
        actors: [],
        stages: [
          {
            id: 'shift-ledger-entry',
            title: 'Break into the roster office',
            districtState: {
              label: 'The roster office is still between shift changes',
              summary:
                'Reach the office before the records dragnet closes and the false-death paperwork disappears into another private archive.',
              trafficSpeedMultiplier: 0.8,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'shift-ledger-grab',
            title: 'Pull the live shift caches',
            districtState: {
              label: 'The ledger is still on the office floor but not for long',
              summary:
                'Take the live caches before the records team burns the proof and buries the dispatchers again.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 2 },
          },
          {
            id: 'shift-ledger-dragnet',
            title: 'Live through the dragnet',
            districtState: {
              label: 'The records-room dragnet is collapsing around the office',
              summary:
                'The caches are yours; now survive the first sweep and clear the office with proof that Nia is still alive.',
              suppressNpcDriving: true,
              trafficSpeedMultiplier: 0.62,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
          },
        ],
      },
    },
  ],
};