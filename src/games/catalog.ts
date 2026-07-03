import type { GameStarter } from '../arcade/types';

export type LaunchMode = 'sandbox' | 'story';

export interface LaunchOption {
  label: string;
  mode: LaunchMode;
}

export interface ArcadeGame {
  id: string;
  title: string;
  badge?: string;
  description: string;
  accent: string;
  launchOptions?: readonly LaunchOption[];
  load: () => Promise<{ startGame: GameStarter }>;
}

export const arcadeGames: readonly ArcadeGame[] = [
  {
    id: 'sindicate',
    title: 'Sindicate',
    badge: 'Work in progress',
    description: 'Top-down city chaos with traffic, wanted heat, service vehicles, taxis, and missions.',
    accent: '#47d7ff',
    load: () => import('./sindicate'),
  },
  {
    id: 'pixel-sprint',
    title: 'Pixel Sprint',
    badge: 'Work in progress',
    description: 'A twitchy side-scroller built from chunky pixels, hazards, coins, and rising speed.',
    accent: '#ffd166',
    load: () => import('./pixel-sprint'),
  },
  {
    id: 'penguins-of-tangram',
    title: 'Penguins of Tangram',
    badge: 'Expanded',
    description:
      'A cartoony school-themed Phaser platformer with a five-zone map, light character traits, badges, secrets, checkpoints, and a festival finish.',
    accent: '#59d0ff',
    load: () => import('./penguins-of-tangram'),
  },
  {
    id: 'void-sweep',
    title: 'Void Sweep',
    badge: 'Work in progress',
    description: 'A neon space sweep where auto-fire, drifting rocks, and quick dodges keep the screen hot.',
    accent: '#ff4bb8',
    load: () => import('./void-sweep'),
  },
] as const;
