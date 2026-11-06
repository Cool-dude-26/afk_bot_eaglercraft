const mineflayer = require('mineflayer');
const express = require('express');

// 1. WEB SERVER FOR RENDER (keeps the service alive when pinged)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot status: ONLINE and keeping the server awake!');
});

app.listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});

// 2. CONFIG (read from Render > Environment)
const config = {
  host: process.env.MC_HOST,                       // no silent fallback: we want to notice if it's missing
  port: parseInt(process.env.MC_PORT, 10) || 25565, // 10 = base 10 (always pass it to parseInt)
  username: process.env.MC_USER || 'Falix_Keeper_Bot',
  version: process.env.MC_VERSION || '1.20.2'
};

// 3. RECONNECT WITH EXPONENTIAL BACKOFF
const BASE_DELAY_MS = 10 * 1000;     // first retry after 10s
const MAX_DELAY_MS = 5 * 60 * 1000;  // never wait more than 5 minutes
let attempt = 0;
let reconnectScheduled = false;      // stops two events from scheduling two reconnects

function scheduleReconnect(reason) {
  if (reconnectScheduled) return;
  reconnectScheduled = true;

  const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS); // 10s, 20s, 40s, ... 300s
  attempt++;

  console.log(
    `[${new Date().toLocaleTimeString()}] Disconnected (${reason}). ` +
    `Reconnecting in ${delay / 1000}s (attempt ${attempt})...`
  );

  setTimeout(() => {
    reconnectScheduled = false;
    startBot();
  }, delay);
}

// 4. THE BOT
function startBot() {
  console.log(`[${new Date().toLocaleTimeString()}] Connecting to ${config.host}:${config.port}...`);

  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version,
    auth: 'offline',
    checkTimeoutInterval: 60000 // wait up to 60s for keep-alive packets before giving up
  });

  let afkInterval = null;

  // once() instead of on(): 'spawn' fires again after every death/respawn,
  // and on() would stack a new anti-AFK timer each time.
  bot.once('spawn', () => {
    attempt = 0; // connected successfully, so reset the backoff
    console.log(`[${new Date().toLocaleTimeString()}] Bot joined! Anti-AFK routine active.`);

    afkInterval = setInterval(() => {
      if (!bot.entity) return;
      bot.swingArm('right');
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 500);
    }, 45000);
  });

  bot.on('kicked', (reason) => {
    const text = typeof reason === 'string' ? reason : JSON.stringify(reason);
    console.log('Kicked by server:', text);
  });

  bot.on('error', (err) => {
    console.error('Bot Error:', err.message);
  });

  bot.once('end', (reason) => {
    if (afkInterval) clearInterval(afkInterval);
    scheduleReconnect(reason);
  });
}

// 5. START
if (!config.host) {
  console.error('MC_HOST is not set. Add it in Render > your service > Environment, then redeploy.');
} else {
  startBot();
}
