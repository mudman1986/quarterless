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
        actors: [
          {
            kind: 'vehicleRoute',
            actorId: 'empty-shell-sedan',
            vehicleKind: 'sedan',
            route: [
              { x: 1984, y: 2176 },
              { x: 2496, y: 2112 },
              { x: 3008, y: 2112 },
            ],
            speed: 110,
            followRadius: 320,
            tailDrainPerSecond: 2,
            loseGraceSeconds: 2.5,
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
    },
  ],
};

export const FIND_THE_MISSING_DISPATCHER: StoryAct = {
  id: 'find-the-missing-dispatcher',
  order: 1,
  title: 'Find The Missing Dispatcher',
  summary:
    'Rook follows Nia\'s physical evidence trail through the waterfront and learns the city is being manipulated by a hidden logistics network.',
  chapters: [DEAD_DROP_DISTRICT, SPARE_PARTS_GOSPEL, STATIC_ON_THE_HOSPITAL_BAND],
};

export const STORY_MODE_PROTOTYPE: StoryMode = {
  id: 'sindicate-story-mode',
  title: 'Sindicate Story Mode',
  premise:
    'Rook Vance returns to the city to find their missing sister Nia and uncovers the Switchboard, a shadow system that sells control of emergency movement.',
  acts: [FIND_THE_MISSING_DISPATCHER],
};