import { tileCenter, type City } from '../../core/city';
import type { Mission } from '../../core/mission';
import { type Vec2 } from '../../core/vector';
import { compileCampaignTemplate, type RuntimeCampaignTemplate } from './storyMode';

export function buildSandboxCampaignTemplates(city: City): RuntimeCampaignTemplate[] {
  const { spec } = city;
  const b = spec.block;
  const reach = (tx: number, ty: number, description: string) => ({
    kind: 'reach' as const,
    description,
    target: tileCenter(spec, tx, ty),
    radius: 56,
  });
  const reachPoint = (target: Vec2, description: string) => ({
    kind: 'reach' as const,
    description,
    target,
    radius: 64,
  });
  const policeStation = city.facilities.find((facility) => facility.kind === 'policeStation');
  const hospital = city.facilities.find((facility) => facility.kind === 'hospital');
  const towYard = city.facilities.find((facility) => facility.kind === 'towYard');
  const taxiDepot = city.facilities.find((facility) => facility.kind === 'taxiDepot');

  return [
    {
      id: 'make-a-name',
      title: 'Make a Name',
      summary: 'Fast onboarding jobs that teach reach, eliminate, collect, and delivery basics.',
      missions: [
        {
          id: 'intro',
          title: 'Make a Name',
          objectives: [
            reach(b * 3, b * 2, 'Drive to the marked junction (yellow ring)'),
            { kind: 'eliminate', description: 'Take down 3 targets — press F to shoot', count: 3 },
          ],
          reward: 1000,
        },
        {
          id: 'supply',
          title: 'Tooled Up',
          objectives: [
            { kind: 'collect', description: 'Grab 2 ammo crates (drive or walk over them)', count: 2 },
            reach(b * 6, b * 3, 'Deliver to the lockup (yellow ring)'),
          ],
          reward: 1500,
        },
      ],
    },
    {
      id: 'heat',
      title: 'Heat',
      summary: 'Wanted-level escalation followed by a short survive-and-evade cooldown.',
      missions: [
        {
          id: 'rampage',
          title: 'Send a Message',
          objectives: [
            { kind: 'wanted', description: 'Cause chaos until you hit a 3-star wanted level', stars: 3 },
          ],
          reward: 2000,
        },
        {
          id: 'laylow',
          title: 'Lay Low',
          objectives: [{ kind: 'survive', description: 'Shake the cops — stay alive 30s while wanted', seconds: 30 }],
          reward: 3000,
        },
      ],
    },
    {
      id: 'most-wanted',
      title: 'Most Wanted',
      summary: 'Marked-target takedown followed by a cross-town getaway and cooldown.',
      missions: [
        {
          id: 'takedown',
          title: 'Takedown',
          objectives: [
            {
              kind: 'eliminate',
              description: 'Take down 6 marked targets — run them over or shoot (F)',
              count: 6,
              targetsOnly: true,
            },
          ],
          reward: 4000,
        },
        {
          id: 'getaway',
          title: 'Getaway',
          objectives: [
            reach(b * 9, b * 9, 'Reach the safehouse across town (yellow ring)'),
            { kind: 'survive', description: 'Lie low for 20s', seconds: 20 },
          ],
          reward: 5000,
        },
      ],
    },
    {
      id: 'service',
      title: 'Service',
      summary: 'Side-service training that turns police, ambulance, tow, and taxi loops into mission goals.',
      missions: [
        {
          id: 'patrol-shift',
          title: 'Patrol Shift',
          objectives: [
            ...(policeStation ? [reachPoint(policeStation.roadSpawn, 'Reach the marked police station')] : []),
            { kind: 'service', description: 'Steal a patrol car and bust 1 suspect', service: 'police', count: 1 },
          ],
          reward: 1800,
        },
        {
          id: 'body-run',
          title: 'Body Run',
          objectives: [
            ...(hospital ? [reachPoint(hospital.roadSpawn, 'Reach the marked hospital vehicle bay')] : []),
            {
              kind: 'service',
              description: 'Steal an ambulance and complete 1 recovery — leave a body if you need a job',
              service: 'ambulance',
              count: 1,
            },
          ],
          reward: 2200,
        },
        {
          id: 'wreck-duty',
          title: 'Wreck Duty',
          objectives: [
            ...(towYard ? [reachPoint(towYard.roadSpawn, 'Reach the marked tow yard')] : []),
            {
              kind: 'service',
              description: 'Steal a tow truck and complete 1 recovery — wreck a car first if needed',
              service: 'tow',
              count: 1,
            },
          ],
          reward: 2400,
        },
        {
          id: 'cab-shift',
          title: 'Cab Shift',
          objectives: [
            ...(taxiDepot ? [reachPoint(taxiDepot.roadSpawn, 'Reach the marked taxi depot')] : []),
            { kind: 'service', description: 'Steal a taxi and complete 1 fare', service: 'taxi', count: 1 },
          ],
          reward: 2000,
        },
      ],
    },
  ];
}

export function buildSandboxCampaigns(city: City): Mission[][] {
  return buildSandboxCampaignTemplates(city).map(compileCampaignTemplate);
}