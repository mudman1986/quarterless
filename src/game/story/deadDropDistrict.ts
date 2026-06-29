import type { StoryAct, StoryChapter, StoryMode } from './storyMode';

export const DEAD_DROP_DISTRICT: StoryChapter = {
  id: 'dead-drop-district',
  actId: 'find-the-missing-dispatcher',
  order: 1,
  title: 'Dead Drop District',
  storyRole:
    "Rook returns to the waterfront, learns Nia was moving evidence, and discovers someone is already cleaning up her trail.",
  combinedGoal:
    "Trace Nia's evidence trail from the waterfront lockers to the Pier 9 cleaners' office before the last physical proof is erased.",
  missions: [
    {
      id: 'night-ferry-run',
      title: 'Night Ferry Run',
      hook: 'Rook lands in a district that already feels watched.',
      primaryGoal: 'Reach the old dock motel and confirm Nia used it as a dead-drop stop.',
      secondaryPressure: 'Patrol presence and cleanup spotters should steadily narrow safe routes into the motel block.',
      failureState: 'Fail if Rook is wasted, busted, or the motel contact vanishes before the handoff point is reached.',
      payoff: 'Rook finds the first dead-drop direction and learns the waterfront trail is active tonight, not cold history.',
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
    },
    {
      id: 'burned-locker',
      title: 'Burned Locker',
      hook: 'Three storage lockers hold the ledger fragments Nia split up before she disappeared.',
      primaryGoal: 'Hit the lockers in time, recover every fragment, and break contact after the final pickup triggers a city response.',
      secondaryPressure: 'The order should matter because each locker changes the next route with fresh cleanup crews and rising heat.',
      failureState: 'Fail if any locker is permanently burned before the fragment is recovered or if Rook is stopped during extraction.',
      payoff: 'The fragments reveal that evidence was being moved toward Pier 9 under ambulance cover.',
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
    },
    {
      id: 'wreck-before-dawn',
      title: 'Wreck Before Dawn',
      hook: 'A cleanup van is carrying the next piece of the trail out of the district.',
      primaryGoal: 'Stage a crash that blocks the van, seize the cargo manifest, and get clear before the district locks down.',
      secondaryPressure: 'The collision must feel deliberate, with enough aftermath chaos that Rook can choose to fight through or peel away.',
      failureState: 'Fail if the manifest burns with the van, the roadblock never sticks, or Rook is neutralized during the grab.',
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
    },
    {
      id: 'false-ambulance',
      title: 'False Ambulance',
      hook: 'Someone is using emergency livery to move witnesses without scrutiny.',
      primaryGoal: 'Tail the fake ambulance without spooking it, then intercept it once it reaches the chop garage.',
      secondaryPressure: 'Rook must hold visual contact without crowding the target long enough to trigger an early route change.',
      failureState: 'Fail if the ambulance escapes sight for too long, is destroyed before the witness is found, or the witness is killed in the stop.',
      payoff: 'The rescued contact confirms the cleaners are storing Nia\'s badge and paper trail in the Pier 9 office.',
      requiredSystems: ['tail', 'capture', 'scriptedEncounter'],
      prototypeRuntime: {
        id: 'false-ambulance',
        title: 'False Ambulance',
        objectives: [
          {
            kind: 'tail',
            description: 'Tail the fake ambulance without losing the route',
            seconds: 12,
          },
          {
            kind: 'capture',
            description: 'Hold the ambulance at the chop garage long enough to force a stop',
            seconds: 3,
          },
        ],
        reward: 4200,
      },
      prototypeScript: {
        primaryActorId: 'false-ambulance-van',
        actors: [
          {
            kind: 'vehicleRoute',
            actorId: 'false-ambulance-van',
            vehicleKind: 'ambulance',
            route: [
              { x: 2560, y: 1472 },
              { x: 3008, y: 1472 },
              { x: 3456, y: 1216 },
              { x: 3648, y: 1024 },
            ],
            speed: 120,
            followRadius: 320,
            captureRadius: 120,
            captureMaxSpeed: 25,
            tailDrainPerSecond: 2,
            loseGraceSeconds: 2.5,
          },
        ],
      },
    },
    {
      id: 'last-call-at-pier-9',
      title: 'Last Call At Pier 9',
      hook: 'Rook reaches the cleaners\' last strongpoint before dawn burns the evidence for good.',
      primaryGoal: 'Break into the pier office, take down the marked cleaners, recover Nia\'s dispatch badge, and survive the counterpush.',
      secondaryPressure: 'The escape route should stay pinched until the office is cleared, forcing a short hold under converging pressure.',
      failureState: 'Fail if Rook dies, is arrested during the holdout, or leaves without the badge.',
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
    },
  ],
};

export const SPARE_PARTS_GOSPEL: StoryChapter = {
  id: 'spare-parts-gospel',
  actId: 'find-the-missing-dispatcher',
  order: 2,
  title: 'Spare Parts Gospel',
  storyRole:
    'The trail points toward independent tow operators who know where the city hides inconvenient wrecks and bodies.',
  combinedGoal:
    'Infiltrate the tow-yard network, trace where sensitive wrecks are being hidden, and earn a route to the dispatcher behind the cleanup crews.',
  missionGroups: [['yard-talk'], ['hook-chain', 'the-empty-shell'], ['crusher-feed'], ['towline-oath']],
  missions: [
    {
      id: 'yard-talk',
      title: 'Yard Talk',
      hook: 'Rook needs a way into the tow-yard chatter without looking like an outsider.',
      primaryGoal: 'Steal a tow truck, run one convincing pickup, and bring it back before the yard locks the gate.',
      secondaryPressure: 'The job should feel legitimate enough that the player learns the yard loop instead of simply stealing and fleeing.',
      failureState: 'Fail if the truck is destroyed or if Rook abandons the yard run before returning to the lot.',
      payoff: 'Rook earns an introduction to the tow-yard crew and overhears the first hints about hidden wreck storage.',
      prototypeRuntime: {
        id: 'yard-talk',
        title: 'Yard Talk',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the tow yard and steal a truck cleanly',
            target: { x: 1216, y: 2304 },
            radius: 80,
          },
          {
            kind: 'service',
            description: 'Complete 1 tow recovery to earn the crew\'s trust',
            service: 'tow',
            count: 1,
          },
        ],
        reward: 2400,
      },
    },
    {
      id: 'hook-chain',
      title: 'Hook Chain',
      hook: 'Two sensitive wrecks are about to vanish into a rival yard.',
      primaryGoal: 'Reach the wreck sites before the rivals do and secure both recovery points for the yard crew.',
      secondaryPressure: 'Each pickup should force a different route across the district instead of replaying the same drive twice.',
      failureState: 'Fail if Rook loses the second recovery point for too long or is taken out while the wreck chain is live.',
      payoff: 'The recovered shells point toward a stripped sedan carrying hidden route documents.',
      prototypeRuntime: {
        id: 'hook-chain',
        title: 'Hook Chain',
        objectives: [
          {
            kind: 'route',
            description: 'Reach both wreck sites before the rival yard clears them',
            targets: [
              { x: 1792, y: 2176 },
              { x: 2496, y: 1984 },
            ],
            radius: 84,
            timeLimitSeconds: 70,
          },
        ],
        reward: 2600,
      },
    },
    {
      id: 'the-empty-shell',
      title: 'The Empty Shell',
      hook: 'The stripped sedan is moving under light guard, which usually means the cargo matters more than the car.',
      primaryGoal: 'Intercept the sedan convoy and stay on it long enough to learn which yard is receiving the documents.',
      secondaryPressure: 'Rook needs to stay close without starting the fight too early or letting the convoy shake loose.',
      failureState: 'Fail if the convoy route is lost before the receiving yard is identified.',
      payoff: 'The sedan leads Rook straight to the scrap plant that is laundering the evidence trail.',
      prototypeRuntime: {
        id: 'the-empty-shell',
        title: 'The Empty Shell',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay on the stripped sedan convoy long enough to find the receiving yard',
            seconds: 10,
          },
        ],
        reward: 3000,
      },
      prototypeScript: {
        primaryActorId: 'empty-shell-sedan',
        actors: [],
        stages: [
          {
            id: 'shell-breakaway',
            title: 'Stay on the shell convoy',
            districtState: {
              label: 'Decoy wrecks are dragging the chase east',
              summary: 'A decoy sedan peels away while the real shell heads toward the salvage lane.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'empty-shell-sedan',
                vehicleKind: 'sedan',
                route: [
                  { x: 1984, y: 2176 },
                  { x: 2304, y: 2176 },
                  { x: 2496, y: 2112 },
                ],
                speed: 108,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
              {
                kind: 'vehicleRoute',
                actorId: 'empty-shell-decoy',
                vehicleKind: 'coupe',
                route: [
                  { x: 1984, y: 2176 },
                  { x: 2048, y: 2496 },
                  { x: 2240, y: 2752 },
                ],
                speed: 104,
                followRadius: 240,
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'empty-shell-sedan' },
          },
          {
            id: 'shell-yard-handoff',
            title: 'Confirm the receiving yard',
            districtState: {
              label: 'The real shell is slipping through the salvage gate',
              summary: 'Hold the tail until the receiving yard is unmistakable.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'empty-shell-sedan',
                vehicleKind: 'sedan',
                route: [
                  { x: 2496, y: 2112 },
                  { x: 2816, y: 2112 },
                  { x: 3008, y: 2112 },
                ],
                speed: 112,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
          },
        ],
      },
    },
    {
      id: 'crusher-feed',
      title: 'Crusher Feed',
      hook: 'Inside the scrap plant, the evidence is about to be flattened into anonymous metal.',
      primaryGoal: 'Crash the plant, take down the cleaners guarding the crusher lane, and get out before the yard seals.',
      secondaryPressure: 'The player should feel pressure from both the plant interior and the exit lane instead of a static arena.',
      failureState: 'Fail if the plant guards hold the crusher lane long enough for the papers to vanish or if Rook is dropped inside the yard.',
      payoff: 'The plant records expose the dispatcher contact organizing the raids on the independent tow crews.',
      prototypeRuntime: {
        id: 'crusher-feed',
        title: 'Crusher Feed',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the scrap plant crusher lane',
            target: { x: 3136, y: 2112 },
            radius: 88,
          },
          {
            kind: 'eliminate',
            description: 'Take down 5 marked plant guards',
            count: 5,
            targetsOnly: true,
          },
          {
            kind: 'survive',
            description: 'Hold the lane for 12 seconds and get clear',
            seconds: 12,
          },
        ],
        reward: 3600,
      },
      prototypeScript: {
        primaryActorId: 'crusher-squad',
        actors: [
          {
            kind: 'pedestrianSquad',
            actorId: 'crusher-squad',
            center: { x: 3136, y: 2112 },
            count: 5,
            spread: 26,
            missionTargets: true,
          },
        ],
      },
    },
    {
      id: 'towline-oath',
      title: 'Towline Oath',
      hook: 'The yard backs Rook for one night, but only if Rook helps them survive the retaliation.',
      primaryGoal: 'Defend the tow yard through the raid and keep the dispatcher trail alive long enough to pull a name out of the attackers.',
      secondaryPressure: 'The defense should turn into a counterpush so the chapter ends by forcing the enemy to retreat, not by waiting them out.',
      failureState: 'Fail if the raid overruns the yard or if Rook cannot hold the line long enough for the crew to trace the dispatcher.',
      payoff: 'The tow crew gives Rook the hospital-route lead that opens the next chapter.',
      prototypeRuntime: {
        id: 'towline-oath',
        title: 'Towline Oath',
        objectives: [
          {
            kind: 'reach',
            description: 'Return to the tow yard before the raid breaks through',
            target: { x: 1216, y: 2304 },
            radius: 88,
          },
          {
            kind: 'eliminate',
            description: 'Take down 6 marked raiders',
            count: 6,
            targetsOnly: true,
          },
          {
            kind: 'survive',
            description: 'Hold the yard for 18 seconds while the crew traces the dispatcher',
            seconds: 18,
          },
        ],
        reward: 4200,
      },
      prototypeScript: {
        primaryActorId: 'tow-yard-raiders',
        actors: [
          {
            kind: 'pedestrianSquad',
            actorId: 'tow-yard-raiders',
            center: { x: 1216, y: 2304 },
            count: 6,
            spread: 28,
            missionTargets: true,
          },
        ],
      },
    },
  ],
};

export const STATIC_ON_THE_HOSPITAL_BAND: StoryChapter = {
  id: 'static-on-the-hospital-band',
  actId: 'find-the-missing-dispatcher',
  order: 3,
  title: 'Static On The Hospital Band',
  storyRole:
    'Nia\'s final calls mention missing ambulance routes and patients who never reached intake.',
  combinedGoal:
    'Trace the falsified ambulance routes, recover the surviving witness trail, and extract the hospital insider who can map the next dispatcher handoff.',
  missionGroups: [['cold-intake'], ['flatline-gap', 'clean-sheets'], ['crash-cart'], ['ward-6-exit']],
  missions: [
    {
      id: 'cold-intake',
      title: 'Cold Intake',
      hook: 'A witness is bleeding out at the edge of a blackout zone before the rival squad can pick them up.',
      primaryGoal: 'Reach the ambulance route, secure the witness first, and hold the handoff lane until the safe clinic is ready.',
      secondaryPressure: 'The player should feel the difference between getting there first and simply surviving the aftermath.',
      failureState: 'Fail if the witness convoy lane is lost or if Rook is dropped before the safe handoff is secured.',
      payoff: 'The witness confirms that hospital-route records are being falsified in relay dead zones across the district.',
      prototypeRuntime: {
        id: 'cold-intake',
        title: 'Cold Intake',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the witness pickup lane before the rival squad closes it',
            target: { x: 896, y: 2816 },
            radius: 88,
          },
          {
            kind: 'survive',
            description: 'Hold the lane for 12 seconds until the clinic runner arrives',
            seconds: 12,
          },
        ],
        reward: 2800,
      },
    },
    {
      id: 'flatline-gap',
      title: 'Flatline Gap',
      hook: 'The relay dead zones are shorting out the only records that still point to Nia\'s last route.',
      primaryGoal: 'Reach the dead radio sites in sequence and re-open the route map before the cleanup crews jam the district again.',
      secondaryPressure: 'The path should force the player to keep moving instead of digging in at one location.',
      failureState: 'Fail if the route goes cold before all relay sites are reached.',
      payoff: 'Rook restores enough of the route map to identify the forged intake tunnel at the hospital loading wing.',
      prototypeRuntime: {
        id: 'flatline-gap',
        title: 'Flatline Gap',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the 4 dead radio sites before the district jams again',
            targets: [
              { x: 1216, y: 3136 },
              { x: 1728, y: 3136 },
              { x: 2240, y: 2944 },
              { x: 2752, y: 2816 },
            ],
            radius: 84,
            timeLimitSeconds: 95,
          },
        ],
        reward: 3200,
      },
      prototypeScript: {
        primaryActorId: 'relay-tech',
        actors: [],
        stages: [
          {
            id: 'relay-tech-route',
            title: 'Protect the relay tech',
            primaryActorId: 'relay-tech',
            districtState: {
              label: 'The blackout pockets are still narrow enough for a runner',
              summary: 'A clinic runner is still threading the first dead zones before the jammer vans close them for good.',
            },
            actors: [
              {
                kind: 'pedestrianRoute',
                actorId: 'relay-tech',
                route: [
                  { x: 1216, y: 3136 },
                  { x: 1728, y: 3136 },
                  { x: 2048, y: 3072 },
                ],
                speed: 44,
                uniform: 'medic',
                escortRadius: 180,
              },
            ],
            failRules: [
              {
                kind: 'escortRadius',
                actorId: 'relay-tech',
                radius: 220,
                maxSeconds: 3,
                failureText: 'The relay tech was cut off before the dead zones were mapped.',
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'relay-tech' },
          },
          {
            id: 'jammer-van-window',
            title: 'Beat the jammer van to the last relay sites',
            primaryActorId: 'jammer-van',
            districtState: {
              label: 'A jammer van is trying to reseal the route behind you',
              summary: 'The last relay sites will stay open only while the jammer van is still moving to close them.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'jammer-van',
                vehicleKind: 'van',
                route: [
                  { x: 2048, y: 3072 },
                  { x: 2240, y: 2944 },
                  { x: 2752, y: 2816 },
                ],
                speed: 102,
                followRadius: 280,
              },
            ],
          },
        ],
      },
    },
    {
      id: 'clean-sheets',
      title: 'Clean Sheets',
      hook: 'Inside the loading tunnel, the paper trail is cleaner than it should be.',
      primaryGoal: 'Break into the loading tunnel and recover the falsified transfer records before they are scrubbed.',
      secondaryPressure: 'The player should feel like they are slipping into a secure service corridor, not storming a fortress.',
      failureState: 'Fail if the records are burned before Rook reaches the archive room.',
      payoff: 'The records reveal that the surviving nurse hacker is being moved during an active lockdown window.',
      prototypeRuntime: {
        id: 'clean-sheets',
        title: 'Clean Sheets',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the hospital loading tunnel archive room',
            target: { x: 3200, y: 2752 },
            radius: 88,
          },
          {
            kind: 'collect',
            description: 'Collect the 1 forged transfer record cache',
            count: 1,
          },
        ],
        reward: 3600,
      },
    },
    {
      id: 'crash-cart',
      title: 'Crash Cart',
      hook: 'The witness route is blown, and the only way out is a damaged ambulance sprint through blocked intersections.',
      primaryGoal: 'Follow the emergency route and keep the ambulance corridor open long enough to clear the district.',
      secondaryPressure: 'The challenge should come from route control and sustained pressure, not one static shootout.',
      failureState: 'Fail if the corridor collapses before the ambulance clears the district.',
      payoff: 'The escape proves the hospital routes are being actively manipulated from inside the lockdown perimeter.',
      prototypeRuntime: {
        id: 'crash-cart',
        title: 'Crash Cart',
        objectives: [
          {
            kind: 'route',
            description: 'Follow the emergency corridor out of the hospital district',
            targets: [
              { x: 3264, y: 2368 },
              { x: 3456, y: 1920 },
              { x: 3648, y: 1472 },
            ],
            radius: 88,
            timeLimitSeconds: 70,
          },
          {
            kind: 'survive',
            description: 'Keep the exit lane clear for 10 seconds',
            seconds: 10,
          },
        ],
        reward: 3900,
      },
    },
    {
      id: 'ward-6-exit',
      title: 'Ward 6 Exit',
      hook: 'The nurse hacker can still open the dispatch logs, but only if Rook gets them out through the lockdown routes.',
      primaryGoal: 'Reach the extraction point, protect the hacker long enough to break the lockdown, and clear the district alive.',
      secondaryPressure: 'The player should feel the lockdown squeezing tighter instead of simply fighting another wave.',
      failureState: 'Fail if the extraction window collapses or Rook cannot hold the line long enough for the hacker to clear the route.',
      payoff: 'The hospital insider points Rook toward the taxi dispatch records in the next chapter.',
      prototypeRuntime: {
        id: 'ward-6-exit',
        title: 'Ward 6 Exit',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the Ward 6 extraction point before the lockdown seals',
            target: { x: 3776, y: 1280 },
            radius: 88,
          },
          {
            kind: 'eliminate',
            description: 'Take down 5 marked lockdown enforcers',
            count: 5,
            targetsOnly: true,
          },
          {
            kind: 'survive',
            description: 'Hold the extraction lane for 15 seconds',
            seconds: 15,
          },
        ],
        reward: 4600,
      },
      prototypeScript: {
        primaryActorId: 'ward6-nurse',
        actors: [
          {
            kind: 'pedestrianRoute',
            actorId: 'ward6-nurse',
            route: [
              { x: 3520, y: 1600 },
              { x: 3648, y: 1472 },
              { x: 3776, y: 1280 },
            ],
            speed: 46,
            uniform: 'medic',
            escortRadius: 180,
          },
        ],
        failRules: [
          {
            kind: 'escortRadius',
            actorId: 'ward6-nurse',
            radius: 220,
            maxSeconds: 3,
            failureText: 'The nurse hacker was left behind in the lockdown corridor.',
          },
        ],
      },
    },
  ],
};

export const METER_RUNNING: StoryChapter = {
  id: 'meter-running',
  actId: 'find-the-missing-dispatcher',
  order: 4,
  title: 'Meter Running',
  storyRole: 'Taxi dispatch logs show Nia was using civilian rides to move informants under the radar.',
  combinedGoal:
    'Use the taxi network to trace Nia\'s informant routes, survive the retaliatory tail jobs, and secure the dying dispatcher who knows the next lead.',
  missionGroups: [['ghost-fare'], ['double-booking', 'red-light-choir'], ['meter-burn'], ['farewell-signal']],
  missions: [
    {
      id: 'ghost-fare',
      title: 'Ghost Fare',
      hook: 'A mystery passenger is using the taxi lanes to test whether Rook can move quietly through the city.',
      primaryGoal: 'Reach the pickup circuit and follow the ghost fare route cleanly enough to earn the next drop.',
      secondaryPressure: 'The player should feel like clean route handling matters as much as speed.',
      failureState: 'Fail if the fare route is lost before the final drop point is reached.',
      payoff: 'Rook learns which dispatch cabs were carrying real informants and which ones were bait.',
      prototypeRuntime: {
        id: 'ghost-fare',
        title: 'Ghost Fare',
        objectives: [
          {
            kind: 'route',
            description: 'Follow the ghost fare route through the taxi circuit',
            targets: [
              { x: 960, y: 960 },
              { x: 1472, y: 896 },
              { x: 1984, y: 960 },
            ],
            radius: 84,
            timeLimitSeconds: 75,
          },
        ],
        reward: 3000,
      },
    },
    {
      id: 'double-booking',
      title: 'Double Booking',
      hook: 'Two fares overlap at once, and only one route holds the real clue.',
      primaryGoal: 'Reach the two overlapping fare lanes and keep enough tempo to identify the live route.',
      secondaryPressure: 'The route should force prioritization rather than a single straight sprint.',
      failureState: 'Fail if both fare routes go cold before Rook closes the overlap.',
      payoff: 'Rook narrows the search to one radio host who rode with the dispatch insiders.',
      prototypeRuntime: {
        id: 'double-booking',
        title: 'Double Booking',
        objectives: [
          {
            kind: 'route',
            description: 'Reach both overlapping fare lanes before they scatter',
            targets: [
              { x: 2240, y: 1088 },
              { x: 2816, y: 960 },
            ],
            radius: 84,
            timeLimitSeconds: 65,
          },
        ],
        reward: 3300,
      },
    },
    {
      id: 'red-light-choir',
      title: 'Red Light Choir',
      hook: 'A radio host is still driving the nightlife grid with a bodyguard tail on every corner.',
      primaryGoal: 'Stay on the host\'s cab route long enough to find the producer carrying the tape.',
      secondaryPressure: 'Rook has to stay close enough to track the route without losing the host in traffic.',
      failureState: 'Fail if the host\'s route is lost before the producer\'s car is identified.',
      payoff: 'The tape reveals where the dying dispatcher is trying to make their last call.',
      prototypeRuntime: {
        id: 'red-light-choir',
        title: 'Red Light Choir',
        objectives: [
          {
            kind: 'tail',
            description: 'Tail the radio host through the nightlife grid',
            seconds: 10,
          },
        ],
        reward: 3600,
      },
      prototypeScript: {
        primaryActorId: 'radio-host-cab',
        actors: [],
        stages: [
          {
            id: 'host-cab-route',
            title: 'Stay on the host cab',
            primaryActorId: 'radio-host-cab',
            districtState: {
              label: 'The host is still blending into the nightlife loop',
              summary: 'The bodyguard car is close enough to mask the host cab if you drift too far back.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'radio-host-cab',
                vehicleKind: 'taxi',
                route: [
                  { x: 3008, y: 1216 },
                  { x: 3328, y: 960 },
                  { x: 3520, y: 960 },
                ],
                speed: 115,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
              {
                kind: 'vehicleRoute',
                actorId: 'bodyguard-coupe',
                vehicleKind: 'coupe',
                route: [
                  { x: 2944, y: 1280 },
                  { x: 3264, y: 1024 },
                  { x: 3456, y: 1024 },
                ],
                speed: 112,
                followRadius: 240,
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'radio-host-cab' },
          },
          {
            id: 'producer-handoff',
            title: 'Track the producer car',
            primaryActorId: 'producer-sedan',
            districtState: {
              label: 'The tape has changed cars in the alley merge',
              summary: 'A producer sedan is trying to peel off with the recording before the club crowd thins out.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'producer-sedan',
                vehicleKind: 'sedan',
                route: [
                  { x: 3520, y: 960 },
                  { x: 3776, y: 1088 },
                  { x: 3968, y: 1344 },
                ],
                speed: 122,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
          },
        ],
      },
    },
    {
      id: 'meter-burn',
      title: 'Meter Burn',
      hook: 'The only safe contraband route left is disguised as another ordinary fare.',
      primaryGoal: 'Keep the fare lane moving through the checkpoint strip long enough to clear the sweep.',
      secondaryPressure: 'The route should feel like a controlled smuggling run rather than a sprint to one marker.',
      failureState: 'Fail if the checkpoint strip locks down before Rook clears the final lane.',
      payoff: 'Rook reaches the dispatch contact block with the route still quiet enough to make the pickup.',
      prototypeRuntime: {
        id: 'meter-burn',
        title: 'Meter Burn',
        objectives: [
          {
            kind: 'route',
            description: 'Clear the disguised fare route through the checkpoint strip',
            targets: [
              { x: 1984, y: 1536 },
              { x: 2496, y: 1600 },
              { x: 3008, y: 1536 },
            ],
            radius: 84,
            timeLimitSeconds: 70,
          },
        ],
        reward: 3900,
      },
    },
    {
      id: 'farewell-signal',
      title: 'Farewell Signal',
      hook: 'The dying dispatcher is one block ahead of the killers, and the city is closing around the last pickup lane.',
      primaryGoal: 'Reach the dispatcher, protect them long enough to secure the final clue, and clear the block alive.',
      secondaryPressure: 'The encounter should feel like a protective escape, not a static arena brawl.',
      failureState: 'Fail if the pickup lane is overrun before the dispatcher can hand over the clue.',
      payoff: 'Rook secures the next lead and learns the police records are being sold from inside the precinct chain.',
      prototypeRuntime: {
        id: 'farewell-signal',
        title: 'Farewell Signal',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the dispatcher pickup lane before the assassins close it',
            target: { x: 3648, y: 1792 },
            radius: 88,
          },
          {
            kind: 'survive',
            description: 'Hold the lane for 15 seconds while the dispatcher talks',
            seconds: 15,
          },
        ],
        reward: 4300,
      },
    },
  ],
};

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
      primaryGoal: 'Reach the evidence caches under a stolen police route before the plate goes hot.',
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
      hook: 'A gang convoy is about to be framed as the city\'s next emergency distraction.',
      primaryGoal: 'Stay on the convoy long enough to plant the frame route and force the crackdown into motion.',
      secondaryPressure: 'The player should feel the wanted system being manipulated rather than just surviving it.',
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
      hook: 'The annex is dark for one short window, and the prisoner with Nia\'s next route is inside.',
      primaryGoal: 'Reach the annex, clear the cell corridor, and open the route before the blackout ends.',
      secondaryPressure: 'The player should feel the timer and corridor squeeze instead of just another firefight.',
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
      primaryGoal: 'Reach the corridor exits in order and keep the escape lane open long enough for the crowd to clear.',
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
      primaryGoal: 'Reach the records room, break the escort ring, and survive long enough to get the ledger out.',
      secondaryPressure: 'The ending should feel like a desperate archive snatch, not a normal cleanup fight.',
      failureState: 'Fail if the ledger room is retaken before Rook clears the handoff.',
      payoff: 'Act I closes with proof that the city\'s response delays are being sold from inside the system.',
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

export const THE_SWITCHBOARD_NAME: StoryChapter = {
  id: 'the-switchboard-name',
  actId: 'find-the-missing-dispatcher',
  order: 6,
  title: 'The Switchboard Name',
  storyRole: 'The paper ledger finally reveals the hidden network\'s name and shows that multiple power blocs are feeding it.',
  combinedGoal:
    'Follow the first hard evidence trail into Switchboard infrastructure, survive the blackout response, and decrypt the first complete proof that the conspiracy is city-wide.',
  missionGroups: [['dead-letter-branch'], ['relay-theft', 'blue-map-room'], ['four-minute-silence'], ['name-in-the-static']],
  missions: [
    {
      id: 'dead-letter-branch',
      title: 'Dead Letter Branch',
      hook: 'A shuttered post office still hides the lockers that once carried rerouted dispatch slips.',
      primaryGoal: 'Reach the old branch and unlock the hidden locker sequence before the building is burned shut.',
      secondaryPressure: 'The route should feel like a navigation puzzle under a live clock, not just another pickup chain.',
      failureState: 'Fail if the locker route times out before the final branch is opened.',
      payoff: 'Rook finds the hardware route that links the post routes to the Switchboard courier lane.',
      prototypeRuntime: {
        id: 'dead-letter-branch',
        title: 'Dead Letter Branch',
        objectives: [
          {
            kind: 'route',
            description: 'Open the hidden locker route before the branch is torched',
            targets: [
              { x: 1024, y: 3328 },
              { x: 1536, y: 3264 },
              { x: 2048, y: 3200 },
            ],
            radius: 84,
            timeLimitSeconds: 80,
          },
        ],
        reward: 3600,
      },
    },
    {
      id: 'relay-theft',
      title: 'Relay Theft',
      hook: 'A courier van is moving switch hardware toward a handoff that no one outside the network is meant to see.',
      primaryGoal: 'Stay on the courier route through the handoff and track the hardware long enough to identify the safehouse line.',
      secondaryPressure: 'The route should escalate from one vehicle tail to a second-stage handoff instead of a single continuous chase.',
      failureState: 'Fail if the hardware route is lost before the second carrier is identified.',
      payoff: 'Rook learns which blackout safehouse is decrypting the first complete Switchboard file.',
      prototypeRuntime: {
        id: 'relay-theft',
        title: 'Relay Theft',
        objectives: [
          {
            kind: 'tail',
            description: 'Stay on the switch hardware handoff route',
            seconds: 14,
          },
        ],
        reward: 4100,
      },
      prototypeScript: {
        primaryActorId: 'switch-van',
        stages: [
          {
            id: 'switch-van-tail',
            title: 'Tail The Courier Van',
            primaryActorId: 'switch-van',
            districtState: { label: 'Courier Window', summary: 'The courier van is still inside the quiet route network.' },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'switch-van',
                vehicleKind: 'van',
                route: [
                  { x: 2240, y: 3264 },
                  { x: 2752, y: 3200 },
                  { x: 3264, y: 3136 },
                ],
                speed: 105,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'switch-van' },
          },
          {
            id: 'safehouse-handoff',
            title: 'Track The Handoff Car',
            primaryActorId: 'handoff-sedan',
            districtState: { label: 'Safehouse Handoff', summary: 'The hardware has changed cars and the route is burning down.' },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'handoff-sedan',
                vehicleKind: 'sedan',
                route: [
                  { x: 3264, y: 3136 },
                  { x: 3584, y: 2816 },
                  { x: 3712, y: 2432 },
                ],
                speed: 125,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
          },
        ],
        actors: [],
      },
    },
    {
      id: 'blue-map-room',
      title: 'Blue Map Room',
      hook: 'A city planner is moving street-closure blueprints that can expose how the blackouts are staged.',
      primaryGoal: 'Reach the blue-map archive route and force the planner to abandon the escape corridor.',
      secondaryPressure: 'Rook should feel like the route is closing piece by piece instead of just fighting a static room.',
      failureState: 'Fail if the planner\'s archive route is lost before the corridor is forced shut.',
      payoff: 'The blueprints show how one district can be cut off from emergency routes on command.',
      prototypeRuntime: {
        id: 'blue-map-room',
        title: 'Blue Map Room',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the blue-map archive room before the planner escapes',
            target: { x: 3584, y: 2240 },
            radius: 88,
          },
          {
            kind: 'capture',
            description: 'Hold the planner route at the archive long enough to force a stop',
            seconds: 3,
          },
        ],
        reward: 4300,
      },
    },
    {
      id: 'four-minute-silence',
      title: 'Four Minute Silence',
      hook: 'The district goes black at once, and the city keeps moving only where the Switchboard allows it.',
      primaryGoal: 'Survive the blackout window and keep the route alive long enough to reach the rooftop decrypt lane.',
      secondaryPressure: 'The city itself should feel unstable instead of simply more crowded.',
      failureState: 'Fail if the blackout response overwhelms the route before the window closes.',
      payoff: 'Rook sees what a district looks like when every response lane is sold off at once.',
      prototypeRuntime: {
        id: 'four-minute-silence',
        title: 'Four Minute Silence',
        objectives: [{ kind: 'survive', description: 'Survive the blackout district for 18 seconds', seconds: 18 }],
        reward: 4600,
      },
    },
    {
      id: 'name-in-the-static',
      title: 'Name In The Static',
      hook: 'The first full Switchboard file is almost readable if Rook can hold the rooftop link against the counterpush.',
      primaryGoal: 'Reach the decrypt rooftop, hold it long enough to finish the upload, and survive the response teams.',
      secondaryPressure: 'The ending should feel like a named reveal, not just another defense wave.',
      failureState: 'Fail if the rooftop link is broken before the file resolves.',
      payoff: 'Act I ends with proof that the Switchboard is the machine behind the city\'s engineered emergencies.',
      prototypeRuntime: {
        id: 'name-in-the-static',
        title: 'Name In The Static',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the rooftop transmitter before the decrypt window closes',
            target: { x: 3904, y: 2048 },
            radius: 88,
          },
          {
            kind: 'survive',
            description: 'Hold the rooftop for 20 seconds while the file decrypts',
            seconds: 20,
          },
        ],
        reward: 5200,
      },
    },
  ],
};

export const FREIGHT_UNION_MORNING: StoryChapter = {
  id: 'freight-union-morning',
  actId: 'court-the-citys-middle-powers',
  order: 1,
  title: 'Freight Union Morning',
  storyRole: 'Rook approaches the dock freight union, which hates the Switchboard because rerouted inspections are crushing independent shipping.',
  combinedGoal:
    'Win the freight union\'s trust, protect their routes long enough to expose the manipulated shipping manifests, and convert them into the first major ally bloc of Act II.',
  missionGroups: [['union-test-run'], ['picket-line-breaker', 'harbor-echo'], ['crane-jam'], ['the-long-manifest']],
  missions: [
    {
      id: 'union-test-run',
      title: 'Union Test Run',
      hook: 'The dock crews do not trust anyone who cannot move a load without wrecking the line.',
      primaryGoal: 'Reach the cargo route in order and prove Rook can keep a union haul moving across the harbor lanes.',
      secondaryPressure: 'The route should feel heavy and deliberate, not just fast.',
      failureState: 'Fail if the load route collapses before the convoy clears the harbor strip.',
      payoff: 'The union agrees to share the first falsified manifest route.',
      prototypeRuntime: {
        id: 'union-test-run',
        title: 'Union Test Run',
        objectives: [
          {
            kind: 'route',
            description: 'Follow the harbor haul route through all 3 cargo lanes',
            targets: [
              { x: 896, y: 3520 },
              { x: 1600, y: 3520 },
              { x: 2304, y: 3456 },
            ],
            radius: 88,
            timeLimitSeconds: 90,
          },
        ],
        reward: 3800,
      },
    },
    {
      id: 'picket-line-breaker',
      title: 'Picket Line Breaker',
      hook: 'The strike route is being peeled apart by hired blockers before the morning convoy can leave the harbor.',
      primaryGoal: 'Reach the strike corridor and clear the blocker line without losing the workers\' route.',
      secondaryPressure: 'The route should feel like selective pressure, not just a body count.',
      failureState: 'Fail if the strike corridor is broken before the workers clear it.',
      payoff: 'The dock crews open the gate to the moving ferry convoy carrying the forged customs tags.',
      prototypeRuntime: {
        id: 'picket-line-breaker',
        title: 'Picket Line Breaker',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the strike corridor before the blockers scatter the line',
            target: { x: 2432, y: 3392 },
            radius: 88,
          },
          {
            kind: 'eliminate',
            description: 'Take down 4 marked blockers',
            count: 4,
            targetsOnly: true,
          },
        ],
        reward: 4100,
      },
      prototypeScript: {
        primaryActorId: 'picket-blockers',
        actors: [
          {
            kind: 'pedestrianSquad',
            actorId: 'picket-blockers',
            center: { x: 2432, y: 3392 },
            count: 4,
            spread: 22,
            missionTargets: true,
          },
        ],
      },
    },
    {
      id: 'harbor-echo',
      title: 'Harbor Echo',
      hook: 'The forged customs tags are moving across a ferry convoy where every deck hand answers to someone else.',
      primaryGoal: 'Stay on the ferry convoy through the harbor handoff long enough to identify the crate carrying the false manifest.',
      secondaryPressure: 'The convoy should feel like a layered moving route instead of one more city tail.',
      failureState: 'Fail if the convoy handoff is lost before the forged-crate route is identified.',
      payoff: 'Rook learns which crane lane will be used to trap the enemy convoy in the next strike.',
      prototypeRuntime: {
        id: 'harbor-echo',
        title: 'Harbor Echo',
        objectives: [{ kind: 'tail', description: 'Stay on the ferry convoy through the harbor handoff', seconds: 12 }],
        reward: 4500,
      },
      prototypeScript: {
        primaryActorId: 'ferry-lead-truck',
        stages: [
          {
            id: 'dock-approach',
            title: 'Track The Lead Truck',
            primaryActorId: 'ferry-lead-truck',
            districtState: { label: 'Harbor Approach', summary: 'The convoy is still rolling under the dock cranes.' },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'ferry-lead-truck',
                vehicleKind: 'pickup',
                route: [
                  { x: 2752, y: 3520 },
                  { x: 3200, y: 3520 },
                  { x: 3584, y: 3392 },
                ],
                speed: 110,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'ferry-lead-truck' },
          },
          {
            id: 'ferry-handoff',
            title: 'Stay On The Crate Car',
            primaryActorId: 'crate-sedan',
            districtState: { label: 'Ferry Handoff', summary: 'The forged tags have moved to a smaller car inside the yard lanes.' },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'crate-sedan',
                vehicleKind: 'sedan',
                route: [
                  { x: 3584, y: 3392 },
                  { x: 3840, y: 3136 },
                  { x: 3968, y: 2880 },
                ],
                speed: 120,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
          },
        ],
        actors: [],
      },
    },
    {
      id: 'crane-jam',
      title: 'Crane Jam',
      hook: 'The union finally has one shot to pin the enemy convoy in the loading lane.',
      primaryGoal: 'Reach the crane lane and hold the trap long enough for the convoy to lock in place.',
      secondaryPressure: 'The player should feel like the trap is closing around a moving target instead of just defending a point.',
      failureState: 'Fail if the trap lane is lost before the convoy locks in.',
      payoff: 'The trapped convoy confirms the forged manifest route and gives the union something worth broadcasting.',
      prototypeRuntime: {
        id: 'crane-jam',
        title: 'Crane Jam',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the crane lane before the convoy slips the trap',
            target: { x: 3840, y: 2624 },
            radius: 88,
          },
          {
            kind: 'survive',
            description: 'Hold the trap lane for 14 seconds',
            seconds: 14,
          },
        ],
        reward: 4700,
      },
    },
    {
      id: 'the-long-manifest',
      title: 'The Long Manifest',
      hook: 'The union leader will finally go public if Rook can keep the rolling ambush from killing the broadcast.',
      primaryGoal: 'Escort the union leader across the harbor route and keep them inside the lane until the manifesto hits the air.',
      secondaryPressure: 'This should feel like protecting a live route under pressure, not just surviving near an NPC.',
      failureState: 'Fail if the union leader is left behind or the broadcast lane breaks before the readout finishes.',
      payoff: 'Act II opens with the freight union committed as the first major ally bloc against the Switchboard.',
      prototypeRuntime: {
        id: 'the-long-manifest',
        title: 'The Long Manifest',
        objectives: [{ kind: 'survive', description: 'Keep the broadcast lane alive for 18 seconds', seconds: 18 }],
        reward: 5400,
      },
      prototypeScript: {
        primaryActorId: 'union-leader',
        actors: [
          {
            kind: 'pedestrianRoute',
            actorId: 'union-leader',
            route: [
              { x: 3968, y: 2496 },
              { x: 3776, y: 2240 },
              { x: 3456, y: 2112 },
            ],
            speed: 42,
            escortRadius: 180,
          },
        ],
        failRules: [
          {
            kind: 'escortRadius',
            actorId: 'union-leader',
            radius: 220,
            maxSeconds: 3,
            failureText: 'The union leader was cut off before the broadcast lane held.',
          },
        ],
      },
    },
  ],
};

export const NEON_COURIERS: StoryChapter = {
  id: 'neon-couriers',
  actId: 'court-the-citys-middle-powers',
  order: 2,
  title: 'Neon Couriers',
  storyRole: 'Street racers and courier crews know how to move through the city faster than official systems do.',
  combinedGoal:
    'Win over the courier crews, learn how the Switchboard routes around surveillance, and steal the tape that maps the fast lanes no official dispatcher admits exist.',
  missionGroups: [['signal-sprint'], ['drop-stack', 'blind-corner'], ['rival-tape'], ['lamps-out']],
  missions: [
    {
      id: 'signal-sprint',
      title: 'Signal Sprint',
      hook: 'The couriers trust route memory more than bravado.',
      primaryGoal: 'Clear the courier sprint route ahead of the rival team to prove Rook knows the fast lanes.',
      secondaryPressure: 'The route should reward clean pathing rather than raw top speed.',
      failureState: 'Fail if the courier route times out before Rook clears every sprint gate.',
      payoff: 'The crews admit Rook can read the city fast enough to learn their dead-drop network.',
      prototypeRuntime: {
        id: 'signal-sprint',
        title: 'Signal Sprint',
        objectives: [
          {
            kind: 'route',
            description: 'Clear the courier sprint route ahead of the rival team',
            targets: [
              { x: 960, y: 1984 },
              { x: 1472, y: 1856 },
              { x: 1984, y: 1792 },
              { x: 2496, y: 1728 },
            ],
            radius: 84,
            timeLimitSeconds: 70,
          },
        ],
        reward: 4000,
      },
    },
    {
      id: 'drop-stack',
      title: 'Drop Stack',
      hook: 'Every delivered package changes the patrol map for the next one.',
      primaryGoal: 'Hit the dead-drop stack in the right order before the route closes behind the crew.',
      secondaryPressure: 'The route should feel like a changing traffic puzzle, not a static collect chain.',
      failureState: 'Fail if the stack route times out before the last package lane is reached.',
      payoff: 'Rook learns which courier routes pass under the surveillance grid unnoticed.',
      prototypeRuntime: {
        id: 'drop-stack',
        title: 'Drop Stack',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the courier dead drops in sequence before the route closes',
            targets: [
              { x: 2752, y: 1664 },
              { x: 3264, y: 1600 },
              { x: 3776, y: 1536 },
            ],
            radius: 84,
            timeLimitSeconds: 80,
          },
        ],
        reward: 4300,
      },
    },
    {
      id: 'blind-corner',
      title: 'Blind Corner',
      hook: 'One passenger still knows which roads cameras cannot quite see.',
      primaryGoal: 'Escort the blind-corner guide through the surveillance gaps long enough to map the safe route.',
      secondaryPressure: 'The player should feel pressure to keep the guide close without drifting out of escort range.',
      failureState: 'Fail if the guide is left outside the moving safe lane for too long.',
      payoff: 'The guide points Rook to the crew carrying the producer\'s tape.',
      prototypeRuntime: {
        id: 'blind-corner',
        title: 'Blind Corner',
        objectives: [{ kind: 'survive', description: 'Keep the guide moving through the blind-corner route for 16 seconds', seconds: 16 }],
        reward: 4600,
      },
      prototypeScript: {
        primaryActorId: 'blind-corner-guide',
        actors: [
          {
            kind: 'pedestrianRoute',
            actorId: 'blind-corner-guide',
            route: [
              { x: 3712, y: 1792 },
              { x: 3520, y: 2048 },
              { x: 3200, y: 2240 },
            ],
            speed: 44,
            escortRadius: 180,
          },
        ],
        failRules: [
          {
            kind: 'escortRadius',
            actorId: 'blind-corner-guide',
            radius: 220,
            maxSeconds: 3,
            failureText: 'The guide slipped out of the safe blind-corner lane.',
          },
        ],
      },
    },
    {
      id: 'rival-tape',
      title: 'Rival Tape',
      hook: 'The tape is changing vehicles in the middle of the boulevard rush.',
      primaryGoal: 'Stay on the tape route through the courier handoff until the decoder safehouse is identified.',
      secondaryPressure: 'The route should escalate through one handoff rather than one long straight tail.',
      failureState: 'Fail if the tape handoff is lost before the decoder car reaches the safehouse line.',
      payoff: 'Rook now knows where the producer is cutting the dispatch evidence loose from the network.',
      prototypeRuntime: {
        id: 'rival-tape',
        title: 'Rival Tape',
        objectives: [{ kind: 'tail', description: 'Stay on the tape handoff route', seconds: 12 }],
        reward: 5000,
      },
      prototypeScript: {
        primaryActorId: 'bike-runner',
        stages: [
          {
            id: 'bike-run',
            title: 'Track The Bike Runner',
            primaryActorId: 'bike-runner',
            districtState: { label: 'Courier Relay', summary: 'The tape is still with the bike runner threading the boulevard.' },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'bike-runner',
                vehicleKind: 'sports',
                route: [
                  { x: 2944, y: 2368 },
                  { x: 3328, y: 2368 },
                  { x: 3648, y: 2240 },
                ],
                speed: 125,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'bike-runner' },
          },
          {
            id: 'decoder-handoff',
            title: 'Stay On The Decoder Car',
            primaryActorId: 'decoder-coupe',
            districtState: { label: 'Decoder Handoff', summary: 'The tape has moved into the decoder car headed for the safehouse.' },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'decoder-coupe',
                vehicleKind: 'coupe',
                route: [
                  { x: 3648, y: 2240 },
                  { x: 3904, y: 1984 },
                  { x: 4032, y: 1728 },
                ],
                speed: 120,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
          },
        ],
        actors: [],
      },
    },
    {
      id: 'lamps-out',
      title: 'Lamps Out',
      hook: 'The couriers can move unseen only if the boulevard festival falls dark in the right order.',
      primaryGoal: 'Reach the power vans in sequence and hold the blackout long enough for the courier sweep to pass.',
      secondaryPressure: 'The route should feel like orchestrated disruption instead of another random destruction spree.',
      failureState: 'Fail if the blackout order breaks before the courier sweep clears the boulevard.',
      payoff: 'The crews become willing allies and point Rook toward the property managers working with the Switchboard.',
      prototypeRuntime: {
        id: 'lamps-out',
        title: 'Lamps Out',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the power vans in the blackout order',
            targets: [
              { x: 3904, y: 1536 },
              { x: 3456, y: 1472 },
              { x: 3008, y: 1408 },
            ],
            radius: 84,
            timeLimitSeconds: 75,
          },
          {
            kind: 'survive',
            description: 'Keep the boulevard dark for 12 seconds',
            seconds: 12,
          },
        ],
        reward: 5400,
      },
    },
  ],
};

export const GLASS_TOWERS_EMPTY_FLOORS: StoryChapter = {
  id: 'glass-towers-empty-floors',
  actId: 'court-the-citys-middle-powers',
  order: 3,
  title: 'Glass Towers, Empty Floors',
  storyRole: 'Corporate property managers are using staged accidents to depress district prices before buying them up.',
  combinedGoal:
    'Turn the courier evidence into a property-fraud case, expose the staged-collapse routes, and hit the transaction archive before the brokers can bury it.',
  missionGroups: [['tenant-warning'], ['window-tax', 'lobby-flood'], ['fire-sale-run'], ['vacancy-notice']],
  missions: [
    {
      id: 'tenant-warning',
      title: 'Tenant Warning',
      hook: 'Three tenant leaders still need the evidence before the private security sweep reaches them.',
      primaryGoal: 'Reach the tenant warning route in order and deliver the evidence before the sweep closes the blocks.',
      secondaryPressure: 'The route should feel like you are outrunning a pressure wave, not just collecting objectives.',
      failureState: 'Fail if the warning route times out before the last leader is reached.',
      payoff: 'The tenants reveal which generator nodes are being used to fake the next outage.',
      prototypeRuntime: {
        id: 'tenant-warning',
        title: 'Tenant Warning',
        objectives: [
          {
            kind: 'route',
            description: 'Reach the tenant leaders before the sweep closes the blocks',
            targets: [
              { x: 1024, y: 960 },
              { x: 1536, y: 1024 },
              { x: 2048, y: 1088 },
            ],
            radius: 84,
            timeLimitSeconds: 75,
          },
        ],
        reward: 4200,
      },
    },
    {
      id: 'window-tax',
      title: 'Window Tax',
      hook: 'The outage pattern is being managed from maintenance vans that never stop in the same place twice.',
      primaryGoal: 'Track the maintenance route and hold the vans long enough to expose the generator order.',
      secondaryPressure: 'The route should feel like corporate choreography rather than gang panic.',
      failureState: 'Fail if the maintenance route disappears before the generator order is captured.',
      payoff: 'Rook learns exactly which tower will be used to flush the broker into the underground garage meet.',
      prototypeRuntime: {
        id: 'window-tax',
        title: 'Window Tax',
        objectives: [{ kind: 'tail', description: 'Stay on the maintenance route until the generator order is exposed', seconds: 11 }],
        reward: 4500,
      },
      prototypeScript: {
        primaryActorId: 'maintenance-van',
        actors: [],
        stages: [
          {
            id: 'maintenance-loop',
            title: 'Stay on the maintenance van',
            primaryActorId: 'maintenance-van',
            districtState: {
              label: 'The maintenance crew is still writing the outage order in motion',
              summary: 'A second van is shadowing the route to scramble the order if you drift too far back.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'maintenance-van',
                vehicleKind: 'van',
                route: [
                  { x: 2240, y: 1216 },
                  { x: 2624, y: 1280 },
                  { x: 2944, y: 1280 },
                ],
                speed: 105,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
              {
                kind: 'vehicleRoute',
                actorId: 'decoy-maintenance-van',
                vehicleKind: 'pickup',
                route: [
                  { x: 2176, y: 1152 },
                  { x: 2496, y: 1216 },
                  { x: 2880, y: 1216 },
                ],
                speed: 101,
                followRadius: 220,
              },
            ],
            nextWhen: { kind: 'routeComplete', actorId: 'maintenance-van' },
          },
          {
            id: 'generator-order-exit',
            title: 'Confirm the generator order',
            primaryActorId: 'order-runner',
            districtState: {
              label: 'The order runner is carrying the final generator sequence',
              summary: 'Stay close until the runner reaches the tower lane with the true outage order.',
            },
            actors: [
              {
                kind: 'vehicleRoute',
                actorId: 'order-runner',
                vehicleKind: 'sedan',
                route: [
                  { x: 2944, y: 1280 },
                  { x: 3264, y: 1344 },
                  { x: 3520, y: 1472 },
                ],
                speed: 118,
                followRadius: 320,
                tailDrainPerSecond: 2,
                loseGraceSeconds: 2.5,
              },
            ],
          },
        ],
      },
    },
    {
      id: 'lobby-flood',
      title: 'Lobby Flood',
      hook: 'The broker only leaves the tower if the sprinkler panic hits the right floor at the right time.',
      primaryGoal: 'Clear the panic route and force the broker into the garage exit lane.',
      secondaryPressure: 'The player should feel like the trap is being built step by step instead of sprung all at once.',
      failureState: 'Fail if the broker route slips free before the garage lane is forced shut.',
      payoff: 'The broker is pushed into the forged-deeds convoy that carries the transaction archive.',
      prototypeRuntime: {
        id: 'lobby-flood',
        title: 'Lobby Flood',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the garage exit lane before the broker escapes',
            target: { x: 3456, y: 1536 },
            radius: 88,
          },
          {
            kind: 'capture',
            description: 'Hold the broker lane long enough to force the garage lock',
            seconds: 3,
          },
        ],
        reward: 4800,
      },
    },
    {
      id: 'fire-sale-run',
      title: 'Fire Sale Run',
      hook: 'The forged deeds are moving in a box truck that must not be destroyed before the archive reaches the press.',
      primaryGoal: 'Escort the archive truck through the district until it reaches the press lane alive.',
      secondaryPressure: 'The route should force active protection instead of just staying nearby.',
      failureState: 'Fail if the archive truck falls outside the safe lane too long.',
      payoff: 'Rook turns the forged deeds into proof of the district-level property play.',
      prototypeRuntime: {
        id: 'fire-sale-run',
        title: 'Fire Sale Run',
        objectives: [{ kind: 'survive', description: 'Keep the archive truck moving for 18 seconds', seconds: 18 }],
        reward: 5200,
      },
      prototypeScript: {
        primaryActorId: 'archive-truck',
        actors: [
          {
            kind: 'pedestrianRoute',
            actorId: 'archive-truck',
            route: [
              { x: 3648, y: 1728 },
              { x: 3328, y: 1984 },
              { x: 3008, y: 2176 },
            ],
            speed: 42,
            escortRadius: 180,
          },
        ],
        failRules: [
          {
            kind: 'escortRadius',
            actorId: 'archive-truck',
            radius: 220,
            maxSeconds: 3,
            failureText: 'The archive truck slipped out of the safe press lane.',
          },
        ],
      },
    },
    {
      id: 'vacancy-notice',
      title: 'Vacancy Notice',
      hook: 'The transaction archive is moving to the half-built tower where the whole district play was planned.',
      primaryGoal: 'Reach the half-built tower and hold the archive lane long enough to drag the full transaction file into the open.',
      secondaryPressure: 'The ending should feel like a public reveal climbing into the skyline, not another street skirmish.',
      failureState: 'Fail if the tower archive lane breaks before the transaction file is exposed.',
      payoff: 'Rook and the tenant bloc force the first public corporate fracture in the Switchboard coalition.',
      prototypeRuntime: {
        id: 'vacancy-notice',
        title: 'Vacancy Notice',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the half-built tower archive lane before the convoy seals it',
            target: { x: 3904, y: 2368 },
            radius: 88,
          },
          {
            kind: 'survive',
            description: 'Hold the archive lane for 20 seconds',
            seconds: 20,
          },
        ],
        reward: 5800,
      },
    },
  ],
};

export const FIND_THE_MISSING_DISPATCHER: StoryAct = {
  id: 'find-the-missing-dispatcher',
  order: 1,
  title: 'Find The Missing Dispatcher',
  summary:
    'Rook follows Nia\'s physical evidence trail through the waterfront and learns the city is being manipulated by a hidden logistics network.',
  chapters: [DEAD_DROP_DISTRICT, SPARE_PARTS_GOSPEL, STATIC_ON_THE_HOSPITAL_BAND, METER_RUNNING, PRECINCT_ASHES, THE_SWITCHBOARD_NAME],
};

export const COURT_THE_CITYS_MIDDLE_POWERS: StoryAct = {
  id: 'court-the-citys-middle-powers',
  order: 2,
  title: 'Court The City\'s Middle Powers',
  summary:
    'Rook turns proof into alliances by winning over the city\'s dock crews, couriers, and neighborhood networks before the Switchboard can isolate them.',
  chapters: [FREIGHT_UNION_MORNING, NEON_COURIERS, GLASS_TOWERS_EMPTY_FLOORS],
};

export const STORY_MODE_PROTOTYPE: StoryMode = {
  id: 'sindicate-story-mode',
  title: 'Sindicate Story Mode',
  premise:
    'Rook Vance returns to the city to find their missing sister Nia and uncovers the Switchboard, a shadow system that sells control of emergency movement.',
  acts: [FIND_THE_MISSING_DISPATCHER, COURT_THE_CITYS_MIDDLE_POWERS],
};