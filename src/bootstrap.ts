const bootGame = async (): Promise<void> => {
  const { startGame } = await import('./game/main');
  startGame();
};

const scheduleBoot = (): void => {
  window.requestAnimationFrame(() => {
    void bootGame();
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleBoot, { once: true });
} else {
  scheduleBoot();
}