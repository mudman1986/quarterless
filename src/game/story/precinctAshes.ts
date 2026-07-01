import type { StoryChapter } from './storyMode';

export const PRECINCT_ASHES: StoryChapter = {
  id: 'precinct-ashes',
  actId: 'find-the-missing-dispatcher',
  order: 5,
  title: 'Precinct Ashes',
  storyRole: 'Rook learns corrupt police are renting response delays to the highest bidder.',
  combinedGoal:
    'Break into the precinct response chain, steal the records that show who is buying police delay, and survive the first direct strike against the internal archive.',
  missions: [
    {
      id: 'badge-borrower',
      title: 'Badge Borrower',
      hook: 'A stolen patrol lane is the only way through the sealed blocks around the records caches.',
      primaryGoal:
        'Reach the evidence caches under a stolen police route before the plate goes hot.',
      secondaryPressure: 'The route should feel like access control, not just another fetch run.',
      failureState: 'Fail if the cache route goes cold before all stops are reached.',
      payoff: 'Rook learns which annex holds the paper copy of the delay ledger.',
      prototypeRuntime: {
        id: 'badge-borrower',
        title: 'Badge Borrower',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the 3 evidence caches before the stolen plate is flagged',
            targets: [
              { x: 1280, y: 960 },
              { x: 1792, y: 896 },
              { x: 2304, y: 960 },
            ],
            radius: 84,
            timeLimitSeconds: 75,
          },
        ],
        reward: 3400,
      },
    },
    {
      id: 'suspect-carousel',
      title: 'Suspect Carousel',
      hook: "A gang convoy is about to be framed as the city's next emergency distraction.",
      primaryGoal:
        'Stay on the convoy long enough to plant the frame route and force the crackdown into motion.',
      secondaryPressure:
        'The player should feel the wanted system being manipulated rather than just surviving it.',
      failureState: 'Fail if the convoy route is lost before the frame is planted.',
      payoff: 'The false crackdown opens the blackout window at the annex.',
      prototypeRuntime: {
        id: 'suspect-carousel',
        title: 'Suspect Carousel',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay on the framed convoy until the crackdown is triggered',
            seconds: 10,
          },
        ],
        reward: 3700,
      },
      prototypeScript: {
        primaryActorId: 'framed-convoy-car',
        actors: [
          {
            kind: 'vehicleRoute',
            actorId: 'framed-convoy-car',
            vehicleKind: 'muscle',
            route: [
              { x: 2432, y: 1152 },
              { x: 2880, y: 1152 },
              { x: 3328, y: 1280 },
            ],
            speed: 115,
            followRadius: 320,
            tailDrainPerSecond: 2,
            loseGraceSeconds: 2.5,
          },
        ],
      },
    },
    {
      id: 'lockup-blackout',
      title: 'Lockup Blackout',
      hook: "The annex is dark for one short window, and the prisoner with Nia's next route is inside.",
      primaryGoal:
        'Reach the annex, clear the cell corridor, and open the route before the blackout ends.',
      secondaryPressure:
        'The player should feel the timer and corridor squeeze instead of just another firefight.',
      failureState: 'Fail if the corridor locks before the route is opened.',
      payoff: 'The freed insider confirms the records room is moving hard-copy ledgers tonight.',
      prototypeRuntime: {
        id: 'lockup-blackout',
        title: 'Lockup Blackout',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the precinct annex blackout corridor',
            target: { x: 3520, y: 1664 },
            radius: 88,
          },
          {
            kind: 'eliminate',
            description: 'Take down 5 marked annex guards',
            count: 5,
            targetsOnly: true,
          },
        ],
        reward: 4100,
      },
      prototypeScript: {
        primaryActorId: 'annex-guards',
        actors: [
          {
            kind: 'pedestrianSquad',
            actorId: 'annex-guards',
            center: { x: 3520, y: 1664 },
            count: 5,
            spread: 24,
            missionTargets: true,
          },
        ],
      },
    },
    {
      id: 'riot-route',
      title: 'Riot Route',
      hook: 'The corridor is open, but only if Rook can keep the fleeing civilians ahead of the reclaim teams.',
      primaryGoal:
        'Reach the corridor exits in order and keep the escape lane open long enough for the crowd to clear.',
      secondaryPressure: 'The route should feel like holding motion, not camping one choke point.',
      failureState: 'Fail if the escape corridor is sealed before the last exit clears.',
      payoff: 'The survivors leave behind the exact room where the paper ledger is being moved.',
      prototypeRuntime: {
        id: 'riot-route',
        title: 'Riot Route',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the corridor exits in order while keeping the route open',
            targets: [
              { x: 3136, y: 1728 },
              { x: 2624, y: 1728 },
              { x: 2112, y: 1664 },
            ],
            radius: 84,
            timeLimitSeconds: 80,
          },
        ],
        reward: 4300,
      },
    },
    {
      id: 'hard-copy',
      title: 'Hard Copy',
      hook: 'The paper ledger is moving under the last clean route the corrupt response chain still trusts.',
      primaryGoal:
        'Reach the records room, break the escort ring, and survive long enough to get the ledger out.',
      secondaryPressure:
        'The ending should feel like a desperate archive snatch, not a normal cleanup fight.',
      failureState: 'Fail if the ledger room is retaken before Rook clears the handoff.',
      payoff:
        "Act I closes with proof that the city's response delays are being sold from inside the system.",
      prototypeRuntime: {
        id: 'hard-copy',
        title: 'Hard Copy',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the precinct records room before the dragnet seals it',
            target: { x: 1792, y: 1600 },
            radius: 88,
          },
          {
            kind: 'survive',
            description: 'Hold the records room for 18 seconds and secure the ledger',
            seconds: 18,
          },
        ],
        reward: 5000,
      },
    },
  ],
};
