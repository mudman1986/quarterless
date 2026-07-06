import {
  createWantedPressureMissionScript,
  missionTargetSquadActor,
  vehicleRouteActor,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const BLUE_LIGHT_AUCTION: StoryChapter = {
  id: 'blue-light-auction',
  actId: 'expose-the-machine',
  order: 5,
  title: 'Blue Light Auction',
  storyRole:
    'Rook uncovers the market where police response priority is sold in person, turning a secret economy of selective law into something that can be named, stolen, and shattered.',
  combinedGoal:
    'Get inside the response auction, strip it of cover, and force its buyers into the open until the ledger becomes public proof instead of a private guarantee.',
  missions: [
    {
      id: 'bid-card',
      title: 'Bid Card',
      hook: 'The invitation is riding with a finance courier who assumes the whole city still works for him.',
      primaryGoal:
        'Stay on the finance courier long enough to read the route, then pin the car and take the invitation before the venue changes locations.',
      secondaryPressure:
        'The setup should feel quiet and predatory at first, then flip hard into a clean stop.',
      failureState: 'Fail if the courier escapes with the invitation before the venue route is known.',
      payoff:
        'Rook steals the bid card and learns where the buyers gather to purchase selective law.',
      requiredSystems: ['tail', 'capture', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'bid-card',
        title: 'Bid Card',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay on the finance courier for 10 seconds and read the auction route',
            seconds: 10,
          },
          {
            kind: 'capture',
            description: 'Pin the courier car for 3 seconds and take the bid card',
            seconds: 3,
          },
        ],
        reward: 5800,
      },
      prototypeScript: {
        primaryActorId: 'bid-card-courier',
        actors: [],
        stages: [
          {
            id: 'bid-card-tail',
            title: 'Read the courier route',
            primaryActorId: 'bid-card-courier',
            districtState: {
              label: 'The courier still believes the invitation is invisible in traffic',
              summary:
                'Read the venue route first; hit too early and the auction simply moves again under a fresh name.',
              trafficSpeedMultiplier: 0.82,
            },
            actors: [
              vehicleRouteActor(
                'bid-card-courier',
                'sedan',
                [
                  { x: 2176, y: 960 },
                  { x: 2720, y: 1056 },
                  { x: 3168, y: 1120 },
                ],
                100,
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
            id: 'bid-card-stop',
            title: 'Take the invitation',
            primaryActorId: 'bid-card-courier',
            districtState: {
              label: 'The courier knows the route is blown and is trying to flee with the invitation',
              summary:
                'Pin the car now before the bid card disappears into another finance safehouse and the venue resets.',
              trafficSpeedMultiplier: 0.78,
              serviceLaneBlocks: ['police'],
            },
            actors: [
              vehicleRouteActor(
                'bid-card-courier',
                'sedan',
                [
                  { x: 3168, y: 1120 },
                  { x: 3616, y: 992 },
                  { x: 4064, y: 928 },
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
      id: 'table-service',
      title: 'Table Service',
      hook: 'Inside the venue, the lot order matters more than the speeches, because it decides whose neighborhoods get abandoned first.',
      primaryGoal:
        'Reach the venue floor, tag the three priority buyers, and stay invisible long enough to walk the list back out.',
      secondaryPressure:
        'This should be information-first pressure, with a crowded room doing more work than a loud gunfight.',
      failureState: 'Fail if the lot order disappears before the priority buyers are tagged.',
      payoff:
        'Rook learns which buyers matter most and where their cars will try to leave once the venue breaks.',
      requiredSystems: ['stealth', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'table-service',
        title: 'Table Service',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the auction floor before the room locks down',
            target: { x: 3136, y: 1728 },
            radius: 84,
          },
          {
            kind: 'collect',
            description: 'Tag the 3 priority buyers on the lot order',
            count: 3,
          },
          {
            kind: 'survive',
            description: 'Keep the list live for 8 seconds while you clear the room',
            seconds: 8,
          },
        ],
        reward: 6100,
      },
      prototypeScript: {
        primaryActorId: 'table-service-floor',
        actors: [],
        stages: [
          {
            id: 'table-service-entry',
            title: 'Get inside the auction floor',
            districtState: {
              label: 'The venue is still pretending to be a private fundraiser',
              summary:
                'Reach the room before the auction flips from manners into panic and burns the lot order under security hands.',
              trafficSpeedMultiplier: 0.8,
              serviceLaneBlocks: ['taxi'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'table-service-tags',
            title: 'Tag the priority buyers',
            districtState: {
              label: 'The lot order is still visible while the room plays at civility',
              summary:
                'Get the buyer tags now; once the venue panics, the real lot order disappears into exits and bodyguards.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 2 },
          },
          {
            id: 'table-service-exit',
            title: 'Walk the list back out',
            districtState: {
              label: 'The venue knows its order is compromised now',
              summary:
                'Stay moving for a few more beats and the buyers lose the fiction that their deals still belong in private.',
              suppressNpcDriving: true,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'closing-bell',
      title: 'Closing Bell',
      hook: 'The auction only truly opens up if the room empties in fear and the auctioneer has nowhere left to hide.',
      primaryGoal:
        'Trigger the panic in the right order, then drop the marked auctioneer before the ledger disappears into the exits.',
      secondaryPressure:
        'The mission should escalate from controlled chaos into a fast extraction, not flatten into one room-wide brawl.',
      failureState: 'Fail if the auctioneer escapes with the live ledger during the panic empty-out.',
      payoff:
        'Rook tears the cover off the venue and sends the buyers scrambling into the underground car park.',
      requiredSystems: ['sabotage', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'closing-bell',
        title: 'Closing Bell',
        objectives: [
          {
            kind: 'sabotage',
            description: 'Trigger the 3 panic charges before the venue reseals',
            targets: [
              { x: 3328, y: 2496 },
              { x: 3520, y: 2432 },
              { x: 3648, y: 2624 },
            ],
            radius: 84,
            timeLimitSeconds: 68,
          },
          {
            kind: 'eliminate',
            description: 'Drop the marked auctioneer before the ledger leaves the floor',
            count: 1,
            targetsOnly: true,
          },
        ],
        reward: 6500,
      },
      prototypeScript: {
        primaryActorId: 'closing-bell-auctioneer',
        actors: [],
        stages: [
          {
            id: 'closing-bell-panic',
            title: 'Empty the room in panic',
            districtState: {
              label: 'The venue still believes it can exit in an orderly lie',
              summary:
                'Hit the panic points in order and the room empties faster than the security plan can adapt.',
              trafficSpeedMultiplier: 0.72,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'closing-bell-auctioneer',
            title: 'Drop the auctioneer',
            primaryActorId: 'closing-bell-auctioneer',
            districtState: {
              label: 'The auctioneer is exposed with the room in full collapse',
              summary:
                'Take the marked auctioneer now or the live ledger is gone in the same private exits as the buyers.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
            },
            actors: [missionTargetSquadActor('closing-bell-auctioneer', { x: 3456, y: 2624 }, 1, 1)],
          },
        ],
      },
    },
    {
      id: 'car-park-scramble',
      title: 'Car Park Scramble',
      hook: 'Five buyers are breaking for five different exits, but only two of them matter enough to chase all the way down.',
      primaryGoal:
        'Reach the garage exits before the scramble disperses and drop the two marked buyers that matter most.',
      secondaryPressure:
        'The pressure should be prioritization under motion, not a complete clear of the entire garage.',
      failureState: 'Fail if the marked buyers clear the exit maze before they are stopped.',
      payoff:
        'The captured buyers identify the district where the police shutdown will hit once the ledger goes public.',
      requiredSystems: ['scriptedEncounter', 'districtState'],
      prototypeRuntime: {
        id: 'car-park-scramble',
        title: 'Car Park Scramble',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the garage maze before the buyers fan out',
            target: { x: 3456, y: 2624 },
            radius: 88,
          },
          {
            kind: 'eliminate',
            description: 'Drop the 2 marked buyers before the scramble clears the exits',
            count: 2,
            targetsOnly: true,
          },
        ],
        reward: 6900,
      },
      prototypeScript: {
        primaryActorId: 'car-park-scramble-buyers',
        actors: [],
        stages: [
          {
            id: 'car-park-scramble-entry',
            title: 'Get into the garage before the exits split',
            districtState: {
              label: 'The buyers are still clustered inside the underground exit ring',
              summary:
                'Reach the garage now or the exit maze turns the whole thing back into anonymous traffic.',
              trafficSpeedMultiplier: 0.76,
              serviceLaneBlocks: ['tow'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'car-park-scramble-buyers',
            title: 'Take the marked buyers',
            primaryActorId: 'car-park-scramble-buyers',
            districtState: {
              label: 'The important buyers are still visible inside the scramble',
              summary:
                'Ignore the decoys and drop the two marked buyers before they clear the underground exits.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
            },
            actors: [missionTargetSquadActor('car-park-scramble-buyers', { x: 3456, y: 2624 }, 2, 18)],
          },
        ],
      },
    },
    {
      id: 'priority-zero',
      title: 'Priority Zero',
      hook: 'The only way to show the auction for what it is is to force the shutdown response into the open while the ledger goes public.',
      primaryGoal:
        'Reach the broadcast point, push the district into a 4-star response, and survive the shutdown long enough for the ledger to stay on air.',
      secondaryPressure:
        'The climax should feel like the system resisting exposure in real time, not like one more buyer shootout.',
      failureState: 'Fail if the broadcast dies before the police shutdown proves itself in full view.',
      payoff:
        'Rook turns selective law into a public scandal and strips the Board of another private market it relied on to stay hidden.',
      requiredSystems: ['districtState', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'priority-zero',
        title: 'Priority Zero',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the broadcast node before the district locks it out',
            target: { x: 3520, y: 640 },
            radius: 88,
          },
          {
            kind: 'wanted',
            description: 'Push the district into a 4-star shutdown while the ledger stays live',
            stars: 4,
          },
          {
            kind: 'survive',
            description: 'Survive the shutdown for 14 seconds while the ledger keeps broadcasting',
            seconds: 14,
          },
        ],
        reward: 7800,
      },
      prototypeScript: createWantedPressureMissionScript({
        id: 'priority-zero-shutdown',
        title: 'Hold against the district shutdown',
        label: 'The response market is panicking in public now',
        summary:
          'Keep the ledger on air while the district throws its entire shutdown doctrine at a proof it can no longer buy back.',
        minStars: 5,
        failureText: 'The shutdown crushed the broadcast before the ledger stayed public.',
        trafficSpeedMultiplier: 0.64,
        wantedPressureBonus: 2,
        suppressNpcDriving: true,
        blackoutIntersections: true,
        serviceLaneBlocks: ['police', 'ambulance', 'tow'],
      }),
    },
  ],
};