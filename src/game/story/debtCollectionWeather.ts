import {
  createEscortMissionScript,
  createWantedPressureMissionScript,
  missionTargetSquadActor,
  vehicleRouteActor,
  wantedPressureFailRule,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const DEBT_COLLECTION_WEATHER: StoryChapter = {
  id: 'debt-collection-weather',
  actId: 'court-the-citys-middle-powers',
  order: 6,
  title: 'Debt Collection Weather',
  storyRole:
    'Rook turns from propaganda to the street-level damage cycle itself, exposing the fake service-call traps that keep entire blocks in permanent debt.',
  combinedGoal:
    'Save the trapped witnesses, steal the collectors’ records, and collapse the fake-callout debt market before the district can be reset.',
  missions: [
    {
      id: 'missed-payment',
      title: 'Missed Payment',
      hook: 'A shop owner is about to disappear into an enforcer van under the cover of a fake service callout.',
      primaryGoal:
        'Intercept the enforcer van before it clears the block and hold it still long enough to pull the shop owner free.',
      secondaryPressure:
        'The mission should hit hard and fast, rewarding a clean interception over a long chase.',
      failureState: 'Fail if the van escapes the block before the shop owner is pulled out.',
      payoff:
        'The rescued owner confirms the collectors are recycling fake damage claims through a rotating set of extorted businesses.',
      requiredSystems: ['capture', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'missed-payment',
        title: 'Missed Payment',
        objectives: [
          {
            kind: 'capture',
            description: 'Hold the enforcer van long enough to pull the shop owner free',
            seconds: 3,
          },
        ],
        reward: 3900,
      },
      prototypeScript: {
        primaryActorId: 'missed-payment-van',
        actors: [],
        stages: [
          {
            id: 'missed-payment-chase',
            title: 'Cut off the enforcer van',
            primaryActorId: 'missed-payment-van',
            districtState: {
              label: 'The collectors are still trying to clear the block with the witness inside',
              summary:
                'Get the van boxed in before the fake service call route turns into another disappeared debtor.',
              trafficSpeedMultiplier: 0.82,
            },
            actors: [
              vehicleRouteActor(
                'missed-payment-van',
                'van',
                [
                  { x: 704, y: 3008 },
                  { x: 960, y: 3008 },
                  { x: 1216, y: 2944 },
                ],
                108,
                {
                  followRadius: 300,
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
      id: 'three-stores-down',
      title: 'Three Stores Down',
      hook: 'Three extorted businesses will talk, but only if Rook can keep each owner alive long enough to reach the final meet.',
      primaryGoal:
        'Visit the three threatened storefronts in sequence and keep the surviving witnesses moving until the final rendezvous.',
      secondaryPressure:
        'The route should make the district feel interconnected, with each stop tightening the pressure on the next witness.',
      failureState: 'Fail if the witness chain collapses before the final rendezvous is secured.',
      payoff:
        'The collected testimony maps the fake repair bills back to a single rotating collector team.',
      requiredSystems: ['timedMultiStop', 'escort'],
      prototypeRuntime: {
        id: 'three-stores-down',
        title: 'Three Stores Down',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the 3 threatened storefronts before the witness chain collapses',
            targets: [
              { x: 1216, y: 2304 },
              { x: 1600, y: 2304 },
              { x: 2112, y: 2240 },
            ],
            radius: 80,
            timeLimitSeconds: 80,
          },
          {
            kind: 'survive',
            description: 'Keep the witness group moving to the final rendezvous',
            seconds: 14,
          },
        ],
        reward: 4300,
      },
      prototypeScript: createEscortMissionScript({
        actorId: 'storefront-witnesses',
        route: [
          { x: 2112, y: 2240 },
          { x: 2368, y: 2176 },
          { x: 2624, y: 2112 },
        ],
        speed: 38,
        failureText: 'The witness chain collapsed before the final rendezvous could be reached.',
      }),
    },
    {
      id: 'ledger-heat',
      title: 'Ledger Heat',
      hook: "The collectors' own car can clone the debt ledger, but only if it is driven through the right checkpoints before the system locks.",
      primaryGoal:
        'Steal the collector car and drive it through the marked checkpoints before the auto-lock system wipes the account cache.',
      secondaryPressure:
        'The puzzle should come from traversal tempo and route choice rather than simple pursuit alone.',
      failureState: 'Fail if the collector car locks down before every checkpoint pass is copied.',
      payoff:
        'Rook pulls the encrypted debt map and learns where the witnesses can still escape through the maintenance network.',
      prototypeRuntime: {
        id: 'ledger-heat',
        title: 'Ledger Heat',
        objectives: [
          {
            kind: 'route',
            description: 'Drive the collector car through the 4 marked checkpoints before it self-locks',
            targets: [
              { x: 2624, y: 1664 },
              { x: 3072, y: 1600 },
              { x: 3456, y: 1856 },
              { x: 3200, y: 2240 },
            ],
            radius: 88,
            timeLimitSeconds: 75,
          },
        ],
        reward: 4700,
      },
      prototypeScript: createWantedPressureMissionScript({
        id: 'ledger-heat-window',
        title: 'Keep the collector car clean',
        label: 'The collector car is still passing as a normal debt-run vehicle',
        summary:
          'A full police read locks the onboard ledger before you can clone the remaining checkpoint passes.',
        minStars: 2,
        failureText: 'The collector car locked down once the checkpoint sweep got a full read.',
        trafficSpeedMultiplier: 0.72,
        wantedPressureBonus: 1,
      }),
    },
    {
      id: 'storm-drain-exit',
      title: 'Storm Drain Exit',
      hook: 'The surface lanes are closing, so the last witnesses have to move through maintenance roads and underpasses instead.',
      primaryGoal:
        'Stay with the maintenance van through the storm-drain lanes until the witness route clears the tightening surface patrols.',
      secondaryPressure:
        'The mission should feel spatially different, with the safer path becoming longer and more claustrophobic.',
      failureState: 'Fail if the maintenance van is lost before the witnesses clear the underpass route.',
      payoff:
        'The surviving witnesses reach safety and identify the auction site where the collectors sell the forged claims in bulk.',
      requiredSystems: ['tail', 'deliver', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'storm-drain-exit',
        title: 'Storm Drain Exit',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay with the maintenance van through the storm-drain escape route',
            seconds: 14,
          },
        ],
        reward: 5000,
      },
      prototypeScript: {
        primaryActorId: 'storm-drain-van',
        actors: [],
        stages: [
          {
            id: 'storm-drain-lane',
            title: 'Stay with the underpass escape route',
            primaryActorId: 'storm-drain-van',
            districtState: {
              label: 'The surface patrols are tightening while the drain roads still breathe',
              summary:
                'Stick with the maintenance van through the underpasses before the surface closure ripples down into the low lanes.',
              trafficSpeedMultiplier: 0.72,
              suppressNpcDriving: true,
              serviceLaneBlocks: ['police'],
            },
            actors: [
              vehicleRouteActor(
                'storm-drain-van',
                'van',
                [
                  { x: 3136, y: 2560 },
                  { x: 2880, y: 2816 },
                  { x: 2624, y: 3008 },
                  { x: 2368, y: 3136 },
                ],
                96,
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
                'The underpass route was compromised once the surface patrols got a full read.',
              ),
            ],
          },
        ],
      },
    },
    {
      id: 'rain-of-receipts',
      title: 'Rain Of Receipts',
      hook: 'The fake-claims market is open for one night only, and every boss in the chain is standing in the same auction block.',
      primaryGoal:
        'Crash the debt auction, drop the marked bosses, then burn the claim archive before the private reinforcements seal the exits.',
      secondaryPressure:
        'The finale should escalate from breach to execution to destruction instead of becoming one flat firefight.',
      failureState: 'Fail if the marked bosses escape with the ledger or the claim archive survives the lockdown.',
      payoff:
        'Rook breaks the debt cycle in the open and leaves the middle-city collectors unable to hide the paper trail anymore.',
      requiredSystems: ['sabotage', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'rain-of-receipts',
        title: 'Rain Of Receipts',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the debt auction before the private exits seal',
            target: { x: 3456, y: 2624 },
            radius: 88,
          },
          {
            kind: 'eliminate',
            description: 'Drop the 5 marked debt bosses',
            count: 5,
            targetsOnly: true,
          },
          {
            kind: 'sabotage',
            description: 'Burn the 3 claim archive stacks before reinforcements seal the block',
            targets: [
              { x: 3328, y: 2496 },
              { x: 3520, y: 2432 },
              { x: 3648, y: 2624 },
            ],
            radius: 84,
            timeLimitSeconds: 70,
          },
        ],
        reward: 6200,
      },
      prototypeScript: {
        primaryActorId: 'auction-bosses',
        actors: [],
        stages: [
          {
            id: 'rain-of-receipts-breach',
            title: 'Crash the auction block',
            districtState: {
              label: 'The auction exits are still soft enough to breach',
              summary:
                'Reach the block before the private security ring turns the auction into another sealed debtor disappearance.',
              trafficSpeedMultiplier: 0.74,
              serviceLaneBlocks: ['tow'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'rain-of-receipts-bosses',
            title: 'Drop the marked bosses',
            primaryActorId: 'auction-bosses',
            districtState: {
              label: 'The auction bosses are still clustered around the live ledger tables',
              summary:
                'Take the marked bosses off the floor before the archive runners scatter the claims into private exits.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
              serviceLaneBlocks: ['police'],
            },
            actors: [missionTargetSquadActor('auction-bosses', { x: 3456, y: 2624 }, 5, 24)],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 2 },
          },
          {
            id: 'rain-of-receipts-archive',
            title: 'Burn the claim archive',
            districtState: {
              label: 'Private reinforcements are sealing the block while the archive still burns',
              summary:
                'The bosses are down; now torch the live claims before the contractor ring turns the auction site into another off-books cleanup.',
              suppressNpcDriving: true,
              trafficSpeedMultiplier: 0.58,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
          },
        ],
      },
    },
  ],
};
