import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npmCommand = 'npm';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = isWindows
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `${command} ${args.join(' ')}`], {
          stdio: 'inherit',
          ...options,
        })
      : spawn(command, args, {
          stdio: 'inherit',
          ...options,
        });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'null'}`));
    });
    child.on('error', reject);
  });
}

await run(npmCommand, ['run', 'build']);

const preview = isWindows
  ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `${npmCommand} run preview -- --host 127.0.0.1`], {
      stdio: 'inherit',
    })
  : spawn(npmCommand, ['run', 'preview', '--', '--host', '127.0.0.1'], {
      stdio: 'inherit',
    });

const forwardSignal = (signal) => {
  if (!preview.killed) preview.kill(signal);
};

process.on('SIGINT', forwardSignal);
process.on('SIGTERM', forwardSignal);

preview.on('exit', (code) => {
  process.exit(code ?? 0);
});

preview.on('error', (error) => {
  console.error(error);
  process.exit(1);
});