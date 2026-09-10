/**
 * LAYOUT TOẠ ĐỘ GỐC
 *
 * Kích thước ảnh nền gốc: 1672x941
 *
 * DÙNG ĐÚNG TỌA ĐỘ ĐÃ ĐO.
 * KHÔNG QUY ĐỔI SANG 1280x720 TẠI FILE NÀY.
 */

const BASE_LAYOUT = {
  rowY: [
    304, 352, 397, 445,
    493, 539, 586, 633,
    678, 723, 769, 811
  ],

  colX: {
    teamName: 771,
    elim: 1086,
    booyah: 1197,
    points: 1286,
  },

  topPanel: {
    elimX: 364,
    ptsX: 733,
    y: 770,

    logo: {
      centerX: 76,
      centerY: 782,
      size: 100,
    },
  },

  gameBooyah: {
    centerX: 1458,
    maxWidth: 226,

    rowsY: [
      358,
      441,
      526,
      608,
      689,
      776,
      859
    ],

    logoSize: 40,
    logoGap: 10,
  },
};


const LAYOUT_OVERRIDES = {

  // =========================================================
  // DEFAULT
  // =========================================================

  default: {},


  // =========================================================
  // 1. ITACHI
  // =========================================================

  itachi: {

    rowY: [
      324,
      367,
      412,
      457,
      502,
      546,
      591,
      636,
      681,
      723,
      769,
      813
    ],

    colX: {
      teamName: 735,
      elim: 1018,
      booyah: 1106,
      points: 1180,
    },

    topPanel: {
      elimX: 348,
      ptsX: 504,
      y: 807,

      logo: {
        centerX: 130,
        centerY: 802,
        size: 150,
      },
    },

    gameBooyah: {
      centerX: 1465,
      maxWidth: 220,

      // ĐÚNG tọa độ bạn đã đo
      rowsY: [
        365,
        439,
        515,
        588,
        665,
        740,
        815,
        890
      ],

      logoSize: 40,
      logoGap: 5,
    },
  },


  // =========================================================
  // 2. KIMETSU
  // =========================================================

  kimetsu: {

    rowY: [
      314,
      358,
      401,
      445,
      490,
      533,
      579,
      622,
      665,
      710,
      753,
      797
    ],

    colX: {
      teamName: 761,
      elim: 1086,
      booyah: 1189,
      points: 1281,
    },

    topPanel: {
      elimX: 378,
      ptsX: 566,
      y: 755,

      logo: {
        centerX: 134,
        centerY: 718,
        size: 150,
      },
    },

    gameBooyah: {
      centerX: 1475,
      maxWidth: 220,

      rowsY: [
        387,
        466,
        544,
        625,
        705,
        781,
        860
      ],

      logoSize: 40,
      logoGap: 10,
    },
  },


  // =========================================================
  // 3. NARUTO
  // =========================================================

  naruto: {

    rowY: [
      314,
      357,
      401,
      446,
      489,
      533,
      577,
      620,
      664,
      705,
      749,
      790
    ],

    colX: {
      teamName: 772,
      elim: 1087,
      booyah: 1185,
      points: 1273,
    },

    topPanel: {
      elimX: 384,
      ptsX: 583,
      y: 758,

      logo: {
        centerX: 149,
        centerY: 730,
        size: 140,
      },
    },

    gameBooyah: {
      centerX: 1487,
      maxWidth: 220,

      // ĐÚNG tọa độ bạn đã đo
      rowsY: [
        378,
        454,
        533,
        609,
        684,
        760,
        836
      ],

      logoSize: 40,
      logoGap: 10,
    },
  },


  // =========================================================
  // 4. CHAINSAW MAN
  // =========================================================

  chainsawman: {

    rowY: [
      304,
      352,
      399,
      446,
      495,
      541,
      585,
      634,
      679,
      725,
      767,
      812
    ],

    colX: {
      teamName: 789,
      elim: 1093,
      booyah: 1197,
      points: 1287,
    },

    topPanel: {
      elimX: 368,
      ptsX: 573,
      y: 770,

      logo: {
        centerX: 130,
        centerY: 730,
        size: 145,
      },
    },

    gameBooyah: {
      centerX: 1497,
      maxWidth: 220,

      rowsY: [
        381,
        464,
        548,
        630,
        712,
        794,
        877
      ],

      logoSize: 40,
      logoGap: 10,
    },
  },


  // =========================================================
  // 5. ONE PIECE
  // =========================================================

  onepiece: {

    rowY: [
      295,
      342,
      390,
      437,
      486,
      534,
      579,
      628,
      675,
      721,
      767,
      811
    ],

    colX: {
      teamName: 770,
      elim: 1074,
      booyah: 1183,
      points: 1275,
    },

    topPanel: {
      elimX: 323,
      ptsX: 560,
      y: 774,

      logo: {
        centerX: 99,
        centerY: 722,
        size: 145,
      },
    },

    gameBooyah: {
      centerX: 1501,
      maxWidth: 220,

      rowsY: [
        368,
        453,
        538,
        624,
        709,
        799,
        885
      ],

      logoSize: 40,
      logoGap: 10,
    },
  },


  // =========================================================
  // 6. JUJUTSU KAISEN
  // =========================================================

  jjk: {

    rowY: [
      295,
      344,
      394,
      442,
      492,
      541,
      589,
      636,
      679,
      724,
      768,
      811
    ],

    colX: {
      teamName: 770,
      elim: 1081,
      booyah: 1187,
      points: 1273,
    },

    topPanel: {
      elimX: 370,
      ptsX: 580,
      y: 767,

      logo: {
        centerX: 132,
        centerY: 729,
        size: 145,
      },
    },

    gameBooyah: {
      centerX: 1500,
      maxWidth: 220,

      rowsY: [
        371,
        454,
        539,
        623,
        705,
        787,
        870
      ],

      logoSize: 40,
      logoGap: 10,
    },
  },

};


// =========================================================
// DEEP CLONE
// =========================================================

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}


// =========================================================
// GET LAYOUT
// =========================================================

function getLayout(key) {

  const override = LAYOUT_OVERRIDES[key] || {};

  const base = deepClone(BASE_LAYOUT);


  // ---------------------------------------------------------
  // TOP PANEL
  // ---------------------------------------------------------

  const overrideTopPanel = override.topPanel || {};

  const mergedTopPanel = {
    ...base.topPanel,
    ...overrideTopPanel,
  };

  mergedTopPanel.logo = {
    ...base.topPanel.logo,
    ...(overrideTopPanel.logo || {}),
  };


  // ---------------------------------------------------------
  // GAME BOOYAH
  // ---------------------------------------------------------

  const overrideGB = override.gameBooyah || {};

  const mergedGB = {
    ...base.gameBooyah,
    ...overrideGB,

    rowsY:
      overrideGB.rowsY ||
      base.gameBooyah.rowsY,

    logoSize:
      overrideGB.logoSize !== undefined
        ? overrideGB.logoSize
        : base.gameBooyah.logoSize,

    logoGap:
      overrideGB.logoGap !== undefined
        ? overrideGB.logoGap
        : base.gameBooyah.logoGap,
  };


  // ---------------------------------------------------------
  // RETURN
  // ---------------------------------------------------------

  return {

    rowY:
      override.rowY ||
      base.rowY,

    colX: {
      ...base.colX,
      ...(override.colX || {}),
    },

    topPanel: mergedTopPanel,

    gameBooyah: mergedGB,
  };
}


// =========================================================
// EXPORT
// =========================================================

module.exports = {
  BASE_LAYOUT,
  LAYOUT_OVERRIDES,
  getLayout,
};
