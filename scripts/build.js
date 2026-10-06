const { spawnSync } = require('child_process');

process.env.DISABLE_ESLINT_PLUGIN = 'true';
process.env.GENERATE_SOURCEMAP = 'false';

const command = process.platform === 'win32' ? 'react-scripts.cmd' : 'react-scripts';
const result = spawnSync(command, ['build'], { stdio: 'inherit', shell: process.platform === 'win32' });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
