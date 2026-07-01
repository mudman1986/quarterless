import {
  actorVehicleConditionFailRule,
  missionTargetSquadActor,
  vehicleRouteActor,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const BROADCAST_TEETH: StoryChapter = {
  id: 'broadcast-teeth',
  actId: 'court-the-citys-middle-powers',
  order: 5,
  title: 'Broadcast Teeth',
  storyRole:
    'Rook leans on a pirate-radio network to expose Switchboard routes, only to find the station web full of compromised hosts and retaliation crews.',
  combinedGoal:
    'Rebuild the radio network, flush out the compromised host, and keep the final citywide broadcast alive long enough to turn proof into open pressure.',
  missions: [
    {
      id: 'antenna-climb',
      title: 'Antenna Climb',
      hook: 'Three repeaters have to come back online before the pirate band can speak above the city noise again.',
      primaryGoal:
        'Reach the three hilltop repeaters in sequence and keep the last one alive long enough to re-stabilize the network.',
      secondaryPressure:
        'The route should feel like a positional scramble across exposed ridges rather than a single static hold.',
      failureState: 'Fail if the repeaters are not restored before the response wave locks down the hills.',
      payoff:
        'The radio network comes back online just long enough to bait the compromised hosts into reacting.',
      prototypeRuntime: {
        id: 'antenna-climb',
        title: 'Antenna Climb',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the 3 hilltop repeaters before the sweep locks them down again',
            targets: [
              { x: 704, y: 768 },
              { x: 1344, y: 640 },
              { x: 1984, y: 704 },
            ],
            radius: 84,
            timeLimitSeconds: 85,
          },
          {
            kind: 'survive',
            description: 'Hold the final repeater for 12 seconds while the network re-stabilizes',
            seconds: 12,
          },
        ],
        reward: 3600,
      },
      prototypeScript: {
        primaryActorId: 'antenna-window',
        actors: [],
        stages: [
          {
            id: 'antenna-first-climb',
            title: 'Hit the first repeater',
            districtState: {
              label: 'The first repeater is still outside the full security cone',
              summary:
                'The first ridge is exposed, but the sweep has not fully climbed the hill network yet.',
              trafficSpeedMultiplier: 0.8,
              wantedPressureBonus: 1,
            },
            actors: [],
            nextWhen: { kind: 'routeProgress', count: 1 },
          },
          {
            id: 'antenna-second-climb',
            title: 'Push the higher ridge',
            districtState: {
              label: 'Security cars are climbing toward the second ridge',
              summary:
                'The pirate band is audible again, which means the hostile watchers are now reading the hill routes much more aggressively.',
              trafficSpeedMultiplier: 0.68,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'antenna-hold',
            title: 'Keep the final repeater breathing',
            districtState: {
              label: 'The last repeater is live and drawing every hostile scanner uphill',
              summary:
                'Hold the hilltop a little longer while the repaired antenna floods the radio net with the station handshake.',
              suppressNpcDriving: true,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'open-mic-trap',
      title: 'Open Mic Trap',
      hook: 'Bait intel only works if Rook reaches the ambush block before the compromised host warns their backup.',
      primaryGoal:
        'Reach the ambush site first, shape the kill lane, and hold it until the bait call drags the target convoy into view.',
      secondaryPressure:
        'The preparation phase should feel tense rather than passive, because every second gives the moles another chance to spoil the setup.',
      failureState: 'Fail if the ambush block is lost before the target convoy commits.',
      payoff:
        'The compromised host takes the bait and reveals which station feeds the Switchboard its real-time route intelligence.',
      prototypeRuntime: {
        id: 'open-mic-trap',
        title: 'Open Mic Trap',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the ambush block before the convoy reroutes',
            target: { x: 2176, y: 960 },
            radius: 84,
          },
          {
            kind: 'defend',
            description: 'Hold the ambush block for 12 seconds while the bait broadcast goes out',
            target: { x: 2176, y: 960 },
            radius: 120,
            seconds: 12,
          },
        ],
        reward: 3900,
      },
      prototypeScript: {
        primaryActorId: 'open-mic-block',
        actors: [],
        stages: [
          {
            id: 'open-mic-setup',
            title: 'Shape the kill lane',
            districtState: {
              label: 'The host has not warned the convoy yet',
              summary:
                'Reach the block early enough to turn the street furniture and parked traffic into a proper ambush lane.',
              trafficSpeedMultiplier: 0.78,
              serviceLaneBlocks: ['tow'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'open-mic-hold',
            title: 'Keep the lane live until the convoy commits',
            districtState: {
              label: 'The compromised host is stalling while the convoy lines up the street',
              summary:
                'Hold the block a little longer so the target arrives inside the prepared kill lane instead of peeling away.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'jingle-bomb',
      title: 'Jingle Bomb',
      hook: 'A propaganda van is blaring the false narrative that keeps frightened neighborhoods compliant.',
      primaryGoal:
        'Chase down the propaganda van, pin it without destroying the audio master, and rip the broadcast reel out intact.',
      secondaryPressure:
        'The takedown should reward clean control instead of raw firepower, because a wrecked van kills the evidence.',
      failureState: 'Fail if the propaganda van is destroyed before the audio master is recovered.',
      payoff:
        'The intact reel proves which host packages Switchboard talking points into the city’s panic cycles.',
      requiredSystems: ['capture', 'vehicleCondition', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'jingle-bomb',
        title: 'Jingle Bomb',
        objectives: [
          {
            kind: 'capture',
            description: 'Pin the propaganda van long enough to cut the audio master free',
            seconds: 3,
          },
        ],
        reward: 4300,
      },
      prototypeScript: {
        primaryActorId: 'propaganda-van',
        actors: [],
        stages: [
          {
            id: 'jingle-bomb-chase',
            title: 'Get the van boxed in',
            primaryActorId: 'propaganda-van',
            districtState: {
              label: 'The propaganda van is still using busy commercial lanes as cover',
              summary:
                'Catch it cleanly and hold it still long enough to seize the reel before the driver panics and smashes the cargo.',
              trafficSpeedMultiplier: 0.82,
            },
            actors: [
              vehicleRouteActor(
                'propaganda-van',
                'van',
                [
                  { x: 2816, y: 1152 },
                  { x: 3072, y: 1216 },
                  { x: 3328, y: 1280 },
                  { x: 3584, y: 1216 },
                ],
                110,
                {
                  followRadius: 320,
                  captureRadius: 135,
                  captureMaxSpeed: 65,
                  tailDrainPerSecond: 2,
                  loseGraceSeconds: 2.5,
                },
              ),
            ],
            failRules: [
              actorVehicleConditionFailRule(
                'propaganda-van',
                45,
                'The propaganda van burned with the audio master still inside.',
                0.5,
              ),
            ],
          },
        ],
      },
    },
    {
      id: 'studio-sweep',
      title: 'Studio Sweep',
      hook: 'The station is still live, but one of the hosts is about to erase the backup tape and disappear into the staff.',
      primaryGoal:
        'Reach the studio, identify the compromised host, drop them before the tape is wiped, and survive the first panic wave.',
      secondaryPressure:
        'The studio should feel crowded and volatile, forcing a fast read instead of a long standoff.',
      failureState: 'Fail if the mole escapes with the tape or the backup reel is erased during the confusion.',
      payoff:
        'Rook exposes the station mole and learns where the final rooftop broadcast can turn proof into a citywide rupture.',
      prototypeRuntime: {
        id: 'studio-sweep',
        title: 'Studio Sweep',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the live station before the mole wipes the backup tape',
            target: { x: 3136, y: 1728 },
            radius: 84,
          },
          {
            kind: 'eliminate',
            description: 'Drop the marked mole before the backup reel disappears',
            count: 1,
            targetsOnly: true,
          },
          {
            kind: 'survive',
            description: 'Survive the station panic for 10 seconds',
            seconds: 10,
          },
        ],
        reward: 4700,
      },
      prototypeScript: {
        primaryActorId: 'studio-mole',
        actors: [],
        stages: [
          {
            id: 'studio-entry',
            title: 'Break into the live booth',
            districtState: {
              label: 'The station is still live and the staff has not scattered yet',
              summary:
                'Reach the studio fast enough that the compromised host cannot vanish into the live-broadcast chaos.',
              trafficSpeedMultiplier: 0.76,
              serviceLaneBlocks: ['taxi'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'studio-mole',
            title: 'Find and drop the mole',
            primaryActorId: 'studio-mole',
            districtState: {
              label: 'The mole is moving through the panicked studio staff',
              summary:
                'The backup reel is still in the building, but only if the marked host drops before they can flush the evidence.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
            },
            actors: [missionTargetSquadActor('studio-mole', { x: 3136, y: 1728 }, 1, 1)],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 2 },
          },
          {
            id: 'studio-panic',
            title: 'Live through the panic wave',
            districtState: {
              label: 'The station panic is spilling onto the surrounding blocks',
              summary:
                'The mole is down, but the live-broadcast panic still has to burn itself out before the rooftop route is clear.',
              suppressNpcDriving: true,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'citywide-readout',
      title: 'Citywide Readout',
      hook: 'The rooftop transmitter can finally dump the evidence across the whole city, if Rook can keep it alive long enough.',
      primaryGoal:
        'Reach the rooftop transmitter, defend it while the evidence plays citywide, and survive the final convergence wave.',
      secondaryPressure:
        'This should feel like open-war escalation, with every faction collapsing onto one exposed high point.',
      failureState: 'Fail if the rooftop transmitter drops before the readout finishes.',
      payoff:
        'The pirate network turns proof into public rupture, forcing the Switchboard out of the shadows and into direct retaliation.',
      prototypeRuntime: {
        id: 'citywide-readout',
        title: 'Citywide Readout',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the rooftop transmitter before the last security ring seals it',
            target: { x: 3520, y: 640 },
            radius: 88,
          },
          {
            kind: 'defend',
            description: 'Defend the transmitter for 18 seconds while the evidence broadcasts citywide',
            target: { x: 3520, y: 640 },
            radius: 125,
            seconds: 18,
          },
          {
            kind: 'survive',
            description: 'Survive the final convergence push for 12 seconds',
            seconds: 12,
          },
        ],
        reward: 6000,
      },
      prototypeScript: {
        primaryActorId: 'citywide-readout-roof',
        actors: [],
        stages: [
          {
            id: 'citywide-readout-entry',
            title: 'Reach the transmitter roof',
            districtState: {
              label: 'The evidence rig is still one push away from going fully live',
              summary:
                'Reach the roof before the last contractor ring closes and the pirate feed dies under static.',
              trafficSpeedMultiplier: 0.7,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'citywide-readout-hold',
            title: 'Keep the evidence on the air',
            districtState: {
              label: 'Every hostile faction is converging while the citywide readout stays live',
              summary:
                'Hold the rooftop long enough for the pirate network to dump the proof into every district at once.',
              suppressNpcDriving: true,
              wantedPressureBonus: 2,
              blackoutIntersections: true,
              serviceLaneBlocks: ['police', 'ambulance', 'tow'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 2 },
          },
          {
            id: 'citywide-readout-fallout',
            title: 'Survive the fallout',
            districtState: {
              label: 'The readout landed and the city is reacting in the open',
              summary:
                'The proof is out now; survive the first retaliation wave long enough for the hostile response to lose its synchronized edge.',
              suppressNpcDriving: true,
              wantedPressureBonus: 2,
              blackoutIntersections: true,
            },
            actors: [],
          },
        ],
      },
    },
  ],
};
