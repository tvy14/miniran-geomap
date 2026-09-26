/**
 * 5G NR Numerology — 3GPP TS 38.211 / TS 38.104
 * PRB count, MCS tables, Shannon capacity, SINR-to-MCS mapping.
 */
(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.NRNumerology = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {

  const MCS_TABLE = {
    0:  { mod: 'QPSK',  order: 2, codeRate: 120/1024,  sinThresh: -6.75 },
    1:  { mod: 'QPSK',  order: 2, codeRate: 157/1024,  sinThresh: -5.25 },
    2:  { mod: 'QPSK',  order: 2, codeRate: 193/1024,  sinThresh: -3.75 },
    3:  { mod: 'QPSK',  order: 2, codeRate: 251/1024,  sinThresh: -2.25 },
    4:  { mod: 'QPSK',  order: 2, codeRate: 308/1024,  sinThresh: -0.75 },
    5:  { mod: 'QPSK',  order: 2, codeRate: 379/1024,  sinThresh:  0.75 },
    6:  { mod: 'QPSK',  order: 2, codeRate: 449/1024,  sinThresh:  2.25 },
    7:  { mod: 'QPSK',  order: 2, codeRate: 526/1024,  sinThresh:  3.75 },
    8:  { mod: 'QPSK',  order: 2, codeRate: 602/1024,  sinThresh:  5.25 },
    9:  { mod: 'QPSK',  order: 2, codeRate: 679/1024,  sinThresh:  6.75 },
    10: { mod: '16QAM', order: 4, codeRate: 340/1024,  sinThresh:  8.25 },
    11: { mod: '16QAM', order: 4, codeRate: 378/1024,  sinThresh:  9.75 },
    12: { mod: '16QAM', order: 4, codeRate: 434/1024,  sinThresh: 11.25 },
    13: { mod: '16QAM', order: 4, codeRate: 490/1024,  sinThresh: 12.75 },
    14: { mod: '16QAM', order: 4, codeRate: 553/1024,  sinThresh: 14.25 },
    15: { mod: '16QAM', order: 4, codeRate: 616/1024,  sinThresh: 15.75 },
    16: { mod: '16QAM', order: 4, codeRate: 658/1024,  sinThresh: 17.25 },
    17: { mod: '64QAM', order: 6, codeRate: 438/1024,  sinThresh: 18.75 },
    18: { mod: '64QAM', order: 6, codeRate: 466/1024,  sinThresh: 20.25 },
    19: { mod: '64QAM', order: 6, codeRate: 517/1024,  sinThresh: 21.75 },
    20: { mod: '64QAM', order: 6, codeRate: 567/1024,  sinThresh: 23.25 },
    21: { mod: '64QAM', order: 6, codeRate: 616/1024,  sinThresh: 24.75 },
    22: { mod: '64QAM', order: 6, codeRate: 666/1024,  sinThresh: 26.25 },
    23: { mod: '64QAM', order: 6, codeRate: 719/1024,  sinThresh: 27.75 },
    24: { mod: '64QAM', order: 6, codeRate: 772/1024,  sinThresh: 29.25 },
    25: { mod: '64QAM', order: 6, codeRate: 822/1024,  sinThresh: 30.75 },
    26: { mod: '64QAM', order: 6, codeRate: 873/1024,  sinThresh: 32.25 },
    27: { mod: '64QAM', order: 6, codeRate: 910/1024,  sinThresh: 33.75 },
    28: { mod: '64QAM', order: 6, codeRate: 948/1024,  sinThresh: 35.25 },
  };

  const PRB_TABLE = {
    '15-5': 25, '15-10': 52, '15-15': 79, '15-20': 106, '15-25': 133,
    '15-30': 160, '15-40': 216, '15-50': 270,
    '30-10': 24, '30-15': 38, '30-20': 51, '30-25': 65, '30-30': 78,
    '30-40': 106, '30-50': 133, '30-60': 162, '30-80': 217, '30-100': 273,
    '60-10': 11, '60-20': 24, '60-40': 51, '60-60': 79, '60-80': 107, '60-100': 135,
    '120-50': 66, '120-100': 132, '120-200': 264,
  };

  function prbCount(scsKHz, bwMHz) {
    const key = scsKHz + '-' + bwMHz;
    if (PRB_TABLE[key]) return PRB_TABLE[key];
    return Math.floor(bwMHz * 1e6 * 0.9 / (12 * scsKHz * 1e3));
  }

  function sinrToMcs(sinrDb) {
    let bestMcs = 0;
    for (let mcs = 0; mcs <= 28; mcs++) {
      if (sinrDb >= MCS_TABLE[mcs].sinThresh) {
        bestMcs = mcs;
      } else {
        break;
      }
    }
    return bestMcs;
  }

  function getMcsInfo(mcs) {
    return MCS_TABLE[mcs] || MCS_TABLE[0];
  }

  function shannonCapacityMbps(sinrDb, bandwidthHz, efficiency) {
    if (efficiency === undefined) efficiency = 0.75;
    const sinrLin = Math.pow(10, sinrDb / 10);
    const capacity = bandwidthHz * Math.log2(1 + sinrLin);
    return efficiency * capacity / 1e6;
  }

  function prbThroughputMbps(sinrDb, nPrb, scsKHz, efficiency) {
    if (efficiency === undefined) efficiency = 0.75;
    const bwHz = nPrb * 12 * scsKHz * 1e3;
    return shannonCapacityMbps(sinrDb, bwHz, efficiency);
  }

  function spectralEfficiency(mcs) {
    const info = getMcsInfo(mcs);
    return info.order * info.codeRate;
  }

  return {
    MCS_TABLE,
    PRB_TABLE,
    prbCount,
    sinrToMcs,
    getMcsInfo,
    shannonCapacityMbps,
    prbThroughputMbps,
    spectralEfficiency
  };
});
