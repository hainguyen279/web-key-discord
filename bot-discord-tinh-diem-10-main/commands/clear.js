const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Xoa hang loat tin nhan gan day trong kenh')
    .addIntegerOption((option) =>
      option
        .setName('so_luong')
        .setDescription('So tin nhan muon xoa (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    // An lenh nay voi thanh vien KHONG co quyen "Quan ly tin nhan" ngay
    // tren giao dien Discord (khong hien trong danh sach lenh cua ho).
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const amount = interaction.options.getInteger('so_luong');

    // KIEM TRA LAI QUYEN o phia server (setDefaultMemberPermissions chi an
    // lenh tren UI, KHONG chan duoc neu admin server tu chinh lai quyen
    // hien thi lenh) - tranh nguoi khong co quyen van goi duoc qua cach khac.
    if (
      interaction.inGuild() &&
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
    ) {
      await interaction.reply({
        content: 'Ban can quyen "Quan ly tin nhan" (Manage Messages) de dung lenh nay.',
        ephemeral: true,
      });
      return;
    }

    if (!interaction.channel || !interaction.channel.bulkDelete) {
      await interaction.reply({
        content: 'Khong the xoa tin nhan trong kenh nay.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // bulkDelete(amount, true): true = tu dong loc bo tin nhan cu qua
      // 14 ngay (Discord KHONG cho bulk-delete tin > 14 ngay, se bao loi
      // neu khong loc truoc) - tranh crash lenh khi trong so tin can xoa
      // co lan ca tin cu.
      const deleted = await interaction.channel.bulkDelete(amount, true);

      const skippedOld = amount - deleted.size;
      const oldNote =
        skippedOld > 0
          ? ` (${skippedOld} tin nhan cu hon 14 ngay khong the xoa hang loat, Discord khong cho phep - phai xoa thu cong tung tin.)`
          : '';

      await interaction.editReply({
        content: `Da xoa ${deleted.size} tin nhan.${oldNote}`,
      });
    } catch (err) {
      console.error('[clear] Loi khi xoa tin nhan:', err);
      await interaction.editReply({
        content: `Khong xoa duoc tin nhan do loi he thong: ${err.message}`,
      });
    }
  },
};
