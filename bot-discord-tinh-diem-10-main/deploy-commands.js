require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Thieu DISCORD_TOKEN hoac CLIENT_ID trong .env');
  process.exit(1);
}

const commands = [];
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  // CHI lay file lenh SLASH (co "data" la SlashCommandBuilder) - bo qua
  // scoreCommand.js (lenh prefix "!td", khong phai slash, khong co .data).
  if (command && command.data && typeof command.data.toJSON === 'function') {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    const guildIds = (GUILD_ID || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (guildIds.length > 0) {
      for (const guildId of guildIds) {
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
        console.log(`Da deploy ${commands.length} lenh vao guild ${guildId}`);
      }
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log(`Da deploy ${commands.length} lenh global (co the mat toi 1h de cap nhat)`);
    }
  } catch (err) {
    console.error('Deploy that bai:', err);
    process.exit(1);
  }
})();
