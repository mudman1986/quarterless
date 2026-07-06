import {
  createEscortMissionScript,
  createWantedPressureMissionScript,
} from './storyMode';
import type { StoryChapter } from './storyMode';

export const CITY_WITHOUT_PERMISSION: StoryChapter = {
  id: 'city-without-permission',
  actId: 'break-the-four-pillars',
  order: 5,
  title: 'City Without Permission',
  storyRole:
    'The Board is wounded and finally answers by trying to shut the whole city down at once, forcing Rook and every allied bloc to keep it alive long enough to fight back.',
  combinedGoal:
    'Reconnect the severed neighborhoods, cross the blackout city, hold the community convoy together, and keep the tower alive until the allies can organize the real counterstrike.',
  missions: [
    {
      id: 'grid-slip',
      title: 'Grid Slip',
      hook: 'The neighborhoods are cut off from each other because the Board knows isolation is cheaper than open war.',
      primaryGoal:
        'Reach the three severed neighborhood links and reconnect the city before the shutdown hardens.',
      secondaryPressure:
        'The scale should feel supportive and citywide, not like three isolated errands.',
      failureState: 'Fail if the shutdown hardens before the neighborhoods are reconnected.',
      payoff:
        'The neighborhoods can move supplies and witnesses again, denying the Board its easiest victory condition.',
      requiredSystems: ['timedMultiStop', 'districtState'],
      prototypeRuntime: {
        id: 'grid-slip',
        title: 'Grid Slip',
        objectives: [
          {
            kind: 'route',
            description: 'Reconnect the 3 severed neighborhood links before the shutdown hardens',
            targets: [
              { x: 1216, y: 2304 },
              { x: 2112, y: 2240 },
              { x: 3200, y: 2240 },
            ],
            radius: 88,
            timeLimitSeconds: 82,
          },
        ],
        reward: 8200,
      },
      prototypeScript: {
        primaryActorId: 'grid-slip-links',
        actors: [],
        stages: [
          {
            id: 'grid-slip-route',
            title: 'Reconnect the neighborhoods',
            districtState: {
              label: 'The shutdown still depends on each district staying isolated from the next',
              summary:
                'Reconnect the city before the Board turns a wounded machine into a total civic severing.',
              trafficSpeedMultiplier: 0.72,
              suppressNpcDriving: true,
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'no-green-lights',
      title: 'No Green Lights',
      hook: 'The entire map is under a synchronized signal blackout and hostile drivers know it gives them cover to turn every crossing into a weapon.',
      primaryGoal:
        'Cross the blackout city through the marked checkpoints and stay ahead of the hostile traffic chaos long enough to clear the route.',
      secondaryPressure:
        'This should be a traversal ordeal where the map itself is suddenly harder to trust.',
      failureState: 'Fail if the blackout route traps Rook before the city-crossing is complete.',
      payoff:
        'Rook proves the Board cannot fully freeze movement, and the allies get a route to the central tower.',
      requiredSystems: ['districtState'],
      prototypeRuntime: {
        id: 'no-green-lights',
        title: 'No Green Lights',
        objectives: [
          {
            kind: 'route',
            description: 'Cross the city through the 4 blackout checkpoints before the route collapses',
            targets: [
              { x: 704, y: 768 },
              { x: 1984, y: 704 },
              { x: 3072, y: 1600 },
              { x: 3520, y: 640 },
            ],
            radius: 88,
            timeLimitSeconds: 90,
          },
          {
            kind: 'survive',
            description: 'Stay ahead of the hostile traffic chaos for 10 seconds past the final crossing',
            seconds: 10,
          },
        ],
        reward: 8600,
      },
      prototypeScript: {
        primaryActorId: 'no-green-lights-grid',
        actors: [],
        stages: [
          {
            id: 'no-green-lights-route',
            title: 'Cross the blackout city',
            districtState: {
              label: 'No intersection in the city is being given a green light anymore',
              summary:
                'Make the crossing while every hostile driver treats the blackout as permission to turn chaos into a weapon.',
              blackoutIntersections: true,
              trafficSpeedMultiplier: 0.62,
              suppressNpcDriving: true,
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'no-green-lights-clear',
            title: 'Clear the last hostile crossings',
            districtState: {
              label: 'The citywide blackout is still trying to fold shut behind you',
              summary:
                'Stay moving a little longer and the crossing proves the Board cannot shut the city down all at once.',
              blackoutIntersections: true,
              trafficSpeedMultiplier: 0.58,
              serviceLaneBlocks: ['police', 'ambulance', 'tow'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'human-chain',
      title: 'Human Chain',
      hook: 'The community convoy cannot win a straight fight, so it has to stay together and move smarter than the Board expects.',
      primaryGoal:
        'Escort the supply convoy through the marked turns and keep it moving until the neighborhood line is whole again.',
      secondaryPressure:
        'The convoy should feel cooperative and fragile rather than militant and dominant.',
      failureState: 'Fail if the community convoy is split before the supply line reaches the next district.',
      payoff:
        'The allied factions hold their line and open a path to the central tower.',
      requiredSystems: ['escort', 'districtState'],
      prototypeRuntime: {
        id: 'human-chain',
        title: 'Human Chain',
        objectives: [
          {
            kind: 'route',
            description: 'Guide the convoy through the 3 handoff turns',
            targets: [
              { x: 3136, y: 2560 },
              { x: 2880, y: 2816 },
              { x: 2368, y: 3136 },
            ],
            radius: 88,
            timeLimitSeconds: 84,
          },
          {
            kind: 'survive',
            description: 'Keep the convoy moving for 12 seconds after the final handoff',
            seconds: 12,
          },
        ],
        reward: 9000,
      },
      prototypeScript: createEscortMissionScript({
        actorId: 'human-chain-convoy',
        route: [
          { x: 3136, y: 2560 },
          { x: 2880, y: 2816 },
          { x: 2624, y: 3008 },
          { x: 2368, y: 3136 },
        ],
        speed: 36,
        failureText: 'The community convoy was split before the supplies reached the next district.',
      }),
    },
    {
      id: 'the-empty-broadcast',
      title: 'The Empty Broadcast',
      hook: 'The central tower is still standing, but the Board got there first with a fake confession ready to poison the whole resistance.',
      primaryGoal:
        'Reach the tower, seize the fake confession tape, and stay alive long enough to keep it out of circulation.',
      secondaryPressure:
        'The reversal should land as a narrative gut punch that still asks the player to hold the line physically.',
      failureState: 'Fail if the fake confession escapes back onto the city feed.',
      payoff:
        'Rook strips away the Board\'s last narrative weapon and turns the tower into a real rally point.',
      requiredSystems: ['scriptedEncounter'],
      prototypeRuntime: {
        id: 'the-empty-broadcast',
        title: 'The Empty Broadcast',
        objectives: [
          {
            kind: 'reach',
            description: 'Reach the central tower before the fake confession goes live',
            target: { x: 3520, y: 640 },
            radius: 88,
          },
          {
            kind: 'collect',
            description: 'Recover the fake confession tape',
            count: 1,
          },
          {
            kind: 'survive',
            description: 'Keep the tape secure for 10 seconds while the tower is contested',
            seconds: 10,
          },
        ],
        reward: 9500,
      },
      prototypeScript: {
        primaryActorId: 'the-empty-broadcast-tower',
        actors: [],
        stages: [
          {
            id: 'the-empty-broadcast-entry',
            title: 'Beat the fake confession to the tower',
            districtState: {
              label: 'The tower is one hostile feed away from turning the city against itself',
              summary:
                'Get there first or the Board buries the resistance in a lie more damaging than any convoy or gun line.',
              trafficSpeedMultiplier: 0.7,
              serviceLaneBlocks: ['police'],
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 1 },
          },
          {
            id: 'the-empty-broadcast-grab',
            title: 'Seize the fake tape',
            districtState: {
              label: 'The lie is still physically here, but only barely',
              summary:
                'Take the tape off the board before another clean signal turns it into a citywide fracture.',
              suppressNpcDriving: true,
              wantedPressureBonus: 1,
            },
            actors: [],
            nextWhen: { kind: 'storyObjective', objectiveIndex: 2 },
          },
          {
            id: 'the-empty-broadcast-hold',
            title: 'Keep the lie from getting back on air',
            districtState: {
              label: 'The tower is contested but the fake confession is no longer free to move',
              summary:
                'Hold the position and the Board loses the last easy way to turn its own defeat into another public confusion.',
              suppressNpcDriving: true,
              serviceLaneBlocks: ['police', 'ambulance'],
            },
            actors: [],
          },
        ],
      },
    },
    {
      id: 'hold-until-morning',
      title: 'Hold Until Morning',
      hook: 'Every allied faction is coordinating the real counterstrike, but only if the tower survives the night first.',
      primaryGoal:
        'Hold the central tower through the overnight assault and survive until the allied counterstrike is ready.',
      secondaryPressure:
        'The long-form survival should feel like the whole city balancing on one remaining high point.',
      failureState: 'Fail if the tower falls before the allied factions can coordinate the morning response.',
      payoff:
        'The city makes it to morning with a real coalition intact, setting the board for the final rescue and collapse of the Switchboard.',
      requiredSystems: ['defend', 'districtState'],
      prototypeRuntime: {
        id: 'hold-until-morning',
        title: 'Hold Until Morning',
        objectives: [
          {
            kind: 'defend',
            description: 'Hold the central tower for 20 seconds through the overnight assault',
            target: { x: 3520, y: 640 },
            radius: 124,
            seconds: 20,
          },
          {
            kind: 'survive',
            description: 'Survive the final push for 15 seconds until the counterstrike is ready',
            seconds: 15,
          },
        ],
        reward: 10800,
      },
      prototypeScript: createWantedPressureMissionScript({
        id: 'hold-until-morning-siege',
        title: 'Keep the tower alive through the night',
        label: 'The whole wounded Board is converging on one last defensible point',
        summary:
          'Hold until the city wakes on your side; if the tower dies tonight, the coalition dies with it.',
        minStars: 5,
        failureText: 'The tower fell before morning and the counterstrike never formed.',
        trafficSpeedMultiplier: 0.56,
        wantedPressureBonus: 2,
        suppressNpcDriving: true,
        blackoutIntersections: true,
        serviceLaneBlocks: ['police', 'ambulance', 'tow'],
      }),
    },
  ],
};