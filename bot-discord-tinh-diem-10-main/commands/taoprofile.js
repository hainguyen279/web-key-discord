const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { composeProfile } = require('../imageComposer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('taoprofile')
    .setDescription('Tao anh profile Free Fire theo role, mau va ten nhan vat')
    .addStringOption((option) =>
      option
        .setName('role')
        .setDescription('Chon vai tro')
        .setRequired(true)
        .addChoices(
          { name: 'Tank', value: 'tank' },
          { name: 'Support', value: 'support' },
          { name: 'Sniper', value: 'sniper' },
          { name: 'Bomber', value: 'bomber' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('mau')
        .setDescription('Chon mau khung')
        .setRequired(true)
        .addChoices(
          { name: 'Tim', value: 'purple' },
          { name: 'Xanh Duong', value: 'blue' },
          { name: 'Bac', value: 'silver' },
          { name: 'Do', value: 'red' },
          { name: 'Vang', value: 'gold' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('ten')
        .setDescription('Ten hien thi tren profile (toi da 16 ky tu)')
        .setRequired(true)
        .setMaxLength(16),
    ),

  async execute(interaction) {
    const role = interaction.options.getString('role');
    const color = interaction.options.getString('mau');
    const name = interaction.options.getString('ten');

    // 1. Xin thêm thời gian xử lý từ Discord
    await interaction.deferReply();

    try {
      console.log('[taoprofile] BAT DAU xu ly anh voi thong so:', { role, color, name });
      
      // 2. Chạy hàm xử lý ảnh đồ họa
      const buffer = await composeProfile({ role, color, name });
      
      console.log('[taoprofile] Tao buffer anh THANH CONG! Chuan bi gui ve Discord...');
      const attachment = new AttachmentBuilder(buffer, { name: 'ff-profile.png' });
      
      await interaction.editReply({
        content: `Profile cua **${name.trim()}** — ${role.toUpperCase()} / ${color.toUpperCase()}`,
        files: [attachment],
      });
    } catch (err) {
      // 3. Ép hệ thống hiển thị chi tiết nguyên nhân sập đồ họa ngầm (lệch file, thiếu canvas...) lên Render Logs
      console.error('[taoprofile] PHAT HIEN LOI CRASH NGAM TAI DAY:', err);
      
      await interaction.editReply({
        content: `Khong tao duoc profile do loi he thong: ${err.message}`,
      });
    }
  },
};
