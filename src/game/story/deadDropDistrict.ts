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

export const FIND_THE_MISSING_DISPATCHER: StoryAct = {
  id: 'find-the-missing-dispatcher',
  order: 1,
  title: 'Find The Missing Dispatcher',
  summary:
    'Rook follows Nia\'s physical evidence trail through the waterfront and learns the city is being manipulated by a hidden logistics network.',
  chapters: [DEAD_DROP_DISTRICT],
};

export const STORY_MODE_PROTOTYPE: StoryMode = {
  id: 'sindicate-story-mode',
  title: 'Sindicate Story Mode',
  premise:
    'Rook Vance returns to the city to find their missing sister Nia and uncovers the Switchboard, a shadow system that sells control of emergency movement.',
  acts: [FIND_THE_MISSING_DISPATCHER],
};