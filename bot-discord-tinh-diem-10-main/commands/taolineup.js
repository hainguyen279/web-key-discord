const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { composeLineup } = require('../imageComposer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('taolineup')
    .setDescription('Tao anh Line Up Team Free Fire voi ten doi va 5 player')
    .addStringOption((option) =>
      option
        .setName('teamname')
        .setDescription('Ten doi (toi da 20 ky tu)')
        .setRequired(true)
        .setMaxLength(20),
    )
    .addStringOption((option) =>
      option
        .setName('player1')
        .setDescription('Ten player 1 (toi da 16 ky tu)')
        .setRequired(true)
        .setMaxLength(16),
    )
    .addStringOption((option) =>
      option
        .setName('player2')
        .setDescription('Ten player 2 (toi da 16 ky tu)')
        .setRequired(true)
        .setMaxLength(16),
    )
    .addStringOption((option) =>
      option
        .setName('player3')
        .setDescription('Ten player 3 (toi da 16 ky tu)')
        .setRequired(true)
        .setMaxLength(16),
    )
    .addStringOption((option) =>
      option
        .setName('player4')
        .setDescription('Ten player 4 (toi da 16 ky tu)')
        .setRequired(true)
        .setMaxLength(16),
    )
    .addStringOption((option) =>
      option
        .setName('player5')
        .setDescription('Ten player 5 (toi da 16 ky tu)')
        .setRequired(true)
        .setMaxLength(16),
    ),

  async execute(interaction) {
    const teamName = interaction.options.getString('teamname');
    const players = [1, 2, 3, 4, 5].map((n) => interaction.options.getString(`player${n}`));

    await interaction.deferReply();

    try {
      console.log('[taolineup] BAT DAU xu ly anh voi thong so:', { teamName, players });

      const buffer = await composeLineup({ teamName, players });

      console.log('[taolineup] Tao buffer anh THANH CONG! Chuan bi gui ve Discord...');
      const attachment = new AttachmentBuilder(buffer, { name: 'ff-lineup.png' });

      await interaction.editReply({
        content: `Line Up Team **${teamName.trim()}**`,
        files: [attachment],
      });
    } catch (err) {
      console.error('[taolineup] PHAT HIEN LOI CRASH NGAM TAI DAY:', err);

      await interaction.editReply({
        content: `Khong tao duoc lineup do loi he thong: ${err.message}`,
      });
    }
  },
};
