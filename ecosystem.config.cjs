module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'node_modules/.bin/vite',
      args: 'preview --host 0.0.0.0 --port 3000 --strictPort',
      cwd: '/home/user/webapp',
      env: { NODE_ENV: 'production', PORT: 3000 },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M',
    },
  ],
}
