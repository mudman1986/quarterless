const previewSize = { width: 360, height: 210 };

type PreviewRenderer = (context: CanvasRenderingContext2D, time: number) => void;

const colors = {
  asphalt: '#23282e',
  cyan: '#47d7ff',
  green: '#7dfc8a',
  magenta: '#ff4bb8',
  amber: '#ffd166',
  red: '#ff5d5d',
  violet: '#9c7cff',
};

function clear(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#0b0d12';
  context.fillRect(0, 0, previewSize.width, previewSize.height);
}

function drawSindicate(context: CanvasRenderingContext2D, time: number): void {
  clear(context);
  context.fillStyle = colors.asphalt;
  context.fillRect(0, 70, previewSize.width, 54);
  context.fillRect(132, 0, 54, previewSize.height);
  context.fillStyle = '#151a21';
  for (let tileY = 0; tileY < 3; tileY++) {
    for (let tileX = 0; tileX < 5; tileX++) {
      if (tileX === 2 || tileY === 1) continue;
      context.fillRect(tileX * 72 + 12, tileY * 70 + 12, 44, 42);
    }
  }
  context.strokeStyle = '#f8f2a5';
  context.setLineDash([18, 18]);
  context.beginPath();
  context.moveTo(0, 97);
  context.lineTo(previewSize.width, 97);
  context.moveTo(159, 0);
  context.lineTo(159, previewSize.height);
  context.stroke();
  context.setLineDash([]);

  const carX = ((time * 0.09) % (previewSize.width + 70)) - 35;
  const patrolY = ((time * 0.055) % (previewSize.height + 60)) - 30;
  context.fillStyle = colors.cyan;
  context.fillRect(carX, 82, 30, 16);
  context.fillStyle = colors.red;
  context.fillRect(145, patrolY, 16, 30);
  context.fillStyle = colors.green;
  context.fillRect(200 + Math.sin(time * 0.006) * 24, 102, 8, 8);
}

function drawPixelSprint(context: CanvasRenderingContext2D, time: number): void {
  clear(context);
  const horizon = 150;
  context.fillStyle = '#131722';
  context.fillRect(0, horizon, previewSize.width, previewSize.height - horizon);
  context.strokeStyle = '#384051';
  for (let offset = -((time * 0.12) % 32); offset < previewSize.width; offset += 32) {
    context.beginPath();
    context.moveTo(offset, horizon + 22);
    context.lineTo(offset + 16, horizon + 22);
    context.stroke();
  }
  const runnerY = 118 - Math.abs(Math.sin(time * 0.008)) * 46;
  context.fillStyle = colors.amber;
  context.fillRect(70, runnerY, 18, 26);
  context.fillStyle = colors.magenta;
  for (let index = 0; index < 4; index++) {
    const obstacleX = 360 - ((time * 0.14 + index * 120) % 480);
    context.fillRect(obstacleX, horizon - 28, 18, 28);
  }
  context.fillStyle = colors.green;
  for (let index = 0; index < 6; index++) {
    const coinX = 360 - ((time * 0.1 + index * 72) % 430);
    context.fillRect(coinX, 82 + Math.sin(index) * 16, 9, 9);
  }
}

function drawVoidSweep(context: CanvasRenderingContext2D, time: number): void {
  clear(context);
  context.fillStyle = '#d9f9ff';
  for (let index = 0; index < 38; index++) {
    const x = (index * 47 + time * 0.035) % previewSize.width;
    const y = (index * 29 + time * 0.055) % previewSize.height;
    context.fillRect(x, y, 2, 2);
  }
  context.fillStyle = colors.violet;
  context.beginPath();
  context.moveTo(72, 160);
  context.lineTo(94, 190);
  context.lineTo(50, 190);
  context.closePath();
  context.fill();
  context.fillStyle = colors.cyan;
  for (let index = 0; index < 5; index++) {
    const shotY = 160 - ((time * 0.22 + index * 55) % 190);
    context.fillRect(70, shotY, 4, 16);
  }
  context.strokeStyle = colors.red;
  context.lineWidth = 3;
  for (let index = 0; index < 4; index++) {
    const rockX = 340 - ((time * 0.08 + index * 90) % 390);
    const rockY = 36 + Math.sin(time * 0.002 + index) * 32 + index * 34;
    context.beginPath();
    context.arc(rockX, rockY, 16 + index * 2, 0, Math.PI * 2);
    context.stroke();
  }
}

function drawPenguinsOfTangram(context: CanvasRenderingContext2D, time: number): void {
  clear(context);
  context.fillStyle = '#8fd8ff';
  context.fillRect(0, 0, previewSize.width, previewSize.height);
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(68, 42, 24, 0, Math.PI * 2);
  context.arc(94, 48, 18, 0, Math.PI * 2);
  context.arc(40, 50, 16, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#77d16a';
  context.fillRect(0, 152, previewSize.width, 58);
  context.fillStyle = '#ffefc0';
  context.fillRect(190, 56, 110, 76);
  context.fillStyle = '#ffd166';
  context.fillRect(204, 36, 82, 30);
  context.fillStyle = '#ff8f66';
  context.fillRect(174, 126, 146, 12);
  context.fillStyle = '#59d0ff';
  context.fillRect(208, 74, 22, 28);
  context.fillRect(236, 74, 22, 28);
  context.fillRect(264, 74, 22, 28);

  const penguinY = 140 - Math.abs(Math.sin(time * 0.008)) * 22;
  context.fillStyle = '#1f3348';
  context.beginPath();
  context.ellipse(90, penguinY, 18, 26, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#f7fbff';
  context.beginPath();
  context.ellipse(90, penguinY + 3, 11, 14, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#ff7f50';
  context.fillRect(76, penguinY - 22, 28, 6);
  context.fillStyle = '#ffb15f';
  context.beginPath();
  context.moveTo(90, penguinY - 1);
  context.lineTo(100, penguinY + 4);
  context.lineTo(90, penguinY + 8);
  context.fill();
  context.fillRect(82, penguinY + 24, 8, 4);
  context.fillRect(92, penguinY + 24, 8, 4);

  context.fillStyle = '#ffd166';
  for (let index = 0; index < 5; index++) {
    const badgeX = 168 + index * 34 - ((time * 0.06) % 34);
    context.beginPath();
    context.arc(badgeX, 102 + Math.sin(index * 0.7) * 6, 7, 0, Math.PI * 2);
    context.fill();
  }
}

const renderers: Partial<Record<string, PreviewRenderer>> = {
  sindicate: drawSindicate,
  'pixel-sprint': drawPixelSprint,
  'penguins-of-tangram': drawPenguinsOfTangram,
  'void-sweep': drawVoidSweep,
};

function prepareCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = previewSize.width * pixelRatio;
  canvas.height = previewSize.height * pixelRatio;
  canvas.style.width = '100%';
  canvas.style.aspectRatio = `${previewSize.width} / ${previewSize.height}`;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.imageSmoothingEnabled = false;
  return context;
}

export function startPreviews(root: HTMLElement): () => void {
  const entries = Array.from(root.querySelectorAll<HTMLCanvasElement>('canvas[data-preview]'))
    .map((canvas) => {
      const renderer = renderers[canvas.dataset.preview ?? ''];
      const context = prepareCanvas(canvas);
      return renderer && context ? { context, renderer } : null;
    })
    .filter(
      (entry): entry is { context: CanvasRenderingContext2D; renderer: PreviewRenderer } => !!entry,
    );

  let frameId = 0;
  const frame = (time: number): void => {
    for (const entry of entries) entry.renderer(entry.context, time);
    frameId = window.requestAnimationFrame(frame);
  };
  frameId = window.requestAnimationFrame(frame);
  return () => window.cancelAnimationFrame(frameId);
}
