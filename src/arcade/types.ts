export interface GameRuntime {
  stop(): void;
}

export type GameStarter = (parent: HTMLElement, onExit: () => void) => GameRuntime;
