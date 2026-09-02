module.exports = {
  apps: [{
    name: 'durismud-api',
    script: './dist/index.js',
    cwd: '/home/resakse/DurisWeb/backend',
    instances: 1,
    exec_mode: 'fork',

    // Production environment variables
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      HOST: '0.0.0.0',

      // Database (will be overridden by .env file if present)
      DB_HOST: '127.0.0.1',
      DB_USER: 'duris',
      DB_NAME: 'duris',
      DB_PORT: 3306,

      // MUD paths on the production server
      MUD_DIR: '/home/duris/duris',
      MUD_ACCOUNTS_DIR: '/home/duris/duris/Accounts',
      ENABLE_GUILD_SYNC: 'true',
    },

    // Logging
    error_file: '/home/resakse/DurisWeb/logs/err.log',
    out_file: '/home/resakse/DurisWeb/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // Auto-restart configuration
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,

    // Memory management
    max_memory_restart: '500M',

    // Watch and reload (disable in production)
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'dist'],

    // Process management
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
  }]
};
