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
  version: process.env.MC_VERSION || '1.20.2',
  password: process.env.MC_PASSWORD || '123456'
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
    console.log(`[${new Date().toLocaleTimeString()}] Bot joined.`);

    // LoginSecurity auto-login: the bot must already be registered on the
    // server (run /register <password> <password> as the bot once, manually,
    // before relying on this). A short delay gives the server time to finish
    // sending the join packets before we chat.
    if (config.password) {
      setTimeout(() => {
        bot.chat(`/login ${config.password}`);
        console.log(`[${new Date().toLocaleTimeString()}] Sent /login`);
      }, 3000);
    }

    console.log(`[${new Date().toLocaleTimeString()}] Anti-AFK routine active.`);

    // The bot sits in a tight 1x1x3 enclosure, so no walking (it would just
    // push against bedrock). Essentials-style AFK plugins fire their
    // "player moved" check on rotation too, not just position, so looking
    // around is enough and stays perfectly safe here.
    afkInterval = setInterval(() => {
      if (!bot.entity) return;

      const yaw = Math.random() * Math.PI * 2;   // full circle, radians
      const pitch = (Math.random() - 0.5) * 1.0; // look up/down a bit
      bot.look(yaw, pitch, true);

      bot.swingArm('right');

      // Sneak on, then off a moment later - a distinct input packet from
      // look/swing, still doesn't move the bot's position.
      bot.setControlState('sneak', true);
      setTimeout(() => bot.setControlState('sneak', false), 500);

      // Cycle the held hotbar slot (0-8) - another distinct, silent packet.
      const nextSlot = (bot.quickBarSlot + 1) % 9;
      bot.setQuickBarSlot(nextSlot);
    }, 15000);
  });

  // Prints server messages (e.g. LoginSecurity's "Successfully logged in!"
  // or "Wrong password!") to the Render logs so you can confirm it worked.
  bot.on('message', (jsonMsg) => {
    console.log('Server says:', jsonMsg.toString());
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
