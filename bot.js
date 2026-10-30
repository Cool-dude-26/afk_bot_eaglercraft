const mineflayer = require('mineflayer');
const express = require('express');

// 1. WEB SERVER FOR RENDER (Keeps the service alive)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot status: ONLINE and keeping the server awake!');
});

app.listen(PORT, () => {
  console.log(`Web server listening on port ${PORT}`);
});

// 2. MINEFLAYER BOT CONFIGURATION
const config = {
  host: 'YOUR_FALIX_SERVER_IP_OR_SUBDOMAIN', // Use numeric IP or direct node address (no wss://)
  port: YOUR_FALIX_PORT,                       // Your numeric port (e.g. 25565)
  username: 'Falix_Keeper_Bot',
  version: '1.20.2'
};

function startBot() {
  console.log(`[${new Date().toLocaleTimeString()}] Connecting to ${config.host}:${config.port}...`);
  
  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version,
    auth: 'offline'
  });

  bot.on('spawn', () => {
    console.log(`[${new Date().toLocaleTimeString()}] Bot joined! Anti-AFK routine active.`);
    
    const afkInterval = setInterval(() => {
      if (!bot.entity) return;
      bot.swingArm('right');
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 500);
    }, 45000);

    bot.once('end', () => clearInterval(afkInterval));
  });

  bot.on('end', (reason) => {
    console.log(`Disconnected. Reason: ${reason}. Reconnecting in 10 seconds...`);
    setTimeout(startBot, 10000);
  });

  bot.on('error', (err) => {
    console.error('Bot Error:', err.message);
  });
}

startBot();
