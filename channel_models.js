/**
 * 3GPP TR 38.901 v17 Channel Models — JavaScript port
 * Covers UMa, UMi, RMa scenarios with LOS/NLOS path loss.
 */
(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ChannelModels = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {

  // Standard normal via Box-Muller
  function gaussianRandom(mean, std) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z;
  }

  // LOS probability (TR 38.901 Table 7.4.2-1)
  function losProbability(scenario, d2d, hUt) {
    if (hUt === undefined) hUt = 1.5;
    if (scenario === 'umi') {
      if (d2d <= 18) return 1.0;
      return 18 / d2d + Math.exp(-d2d / 36) * (1 - 18 / d2d);
    }
    if (scenario === 'uma') {
      if (d2d <= 18) return 1.0;
      let C = 0.0;
      if (hUt > 13) C = Math.pow((hUt - 13) / 10, 1.5);
      return (18 / d2d + Math.exp(-d2d / 63) * (1 - 18 / d2d))
        * (1 + C * 1.25 * Math.pow(d2d / 100, 3) * Math.exp(-d2d / 150));
    }
    if (scenario === 'rma') {
      if (d2d <= 10) return 1.0;
      return Math.exp(-(d2d - 10) / 1000);
    }
    return 1.0;
  }

  // UMa LOS path loss (TR 38.901 eq 7.4.1-1)
  function pathLossUmaLos(d3d, fc, hBs, hUt) {
    if (hBs === undefined) hBs = 25;
    if (hUt === undefined) hUt = 1.5;
    const hE = 1.0;
    const hBsE = hBs - hE;
    const hUtE = hUt - hE;
    const dBp = 4 * hBsE * hUtE * fc * 1e9 / 3e8;
    d3d = Math.max(d3d, 10);

    let pl;
    if (d3d <= dBp) {
      pl = 28.0 + 22.0 * Math.log10(d3d) + 20.0 * Math.log10(fc);
    } else {
      pl = 28.0 + 40.0 * Math.log10(d3d) + 20.0 * Math.log10(fc)
         - 9.0 * Math.log10(dBp * dBp + (hBs - hUt) * (hBs - hUt));
    }
    return pl + gaussianRandom(0, 4.0);
  }

  // UMa NLOS path loss
  function pathLossUmaNlos(d3d, fc, hBs, hUt) {
    if (hBs === undefined) hBs = 25;
    if (hUt === undefined) hUt = 1.5;
    d3d = Math.max(d3d, 10);
    const plNlos = 13.54 + 39.08 * Math.log10(d3d) + 20.0 * Math.log10(fc) - 0.6 * (hUt - 1.5);
    const plLos = pathLossUmaLos(d3d, fc, hBs, hUt);
    return Math.max(plNlos, plLos) + gaussianRandom(0, 6.0);
  }

  // UMi-Street Canyon LOS path loss (TR 38.901 eq 7.4.1-3)
  function pathLossUmiLos(d3d, fc, hBs, hUt) {
    if (hBs === undefined) hBs = 10;
    if (hUt === undefined) hUt = 1.5;
    const hE = 1.0;
    const hBsE = hBs - hE;
    const hUtE = hUt - hE;
    const dBp = 4 * hBsE * hUtE * fc * 1e9 / 3e8;
    d3d = Math.max(d3d, 10);

    let pl;
    if (d3d <= dBp) {
      pl = 32.4 + 21.0 * Math.log10(d3d) + 20.0 * Math.log10(fc);
    } else {
      pl = 32.4 + 40.0 * Math.log10(d3d) + 20.0 * Math.log10(fc)
         - 9.5 * Math.log10(dBp * dBp + (hBs - hUt) * (hBs - hUt));
    }
    return pl + gaussianRandom(0, 4.0);
  }

  // UMi-Street Canyon NLOS path loss
  function pathLossUmiNlos(d3d, fc, hBs, hUt) {
    if (hBs === undefined) hBs = 10;
    if (hUt === undefined) hUt = 1.5;
    d3d = Math.max(d3d, 10);
    const plNlos = 22.4 + 35.3 * Math.log10(d3d) + 21.3 * Math.log10(fc) - 0.3 * (hUt - 1.5);
    const plLos = pathLossUmiLos(d3d, fc, hBs, hUt);
    return Math.max(plNlos, plLos) + gaussianRandom(0, 7.82);
  }

  // RMa LOS path loss (TR 38.901 eq 7.4.1-7/8)
  function pathLossRmaLos(d3d, fc, hBs, hUt, d2d) {
    if (hBs === undefined) hBs = 35;
    if (hUt === undefined) hUt = 1.5;
    if (d2d === undefined) d2d = d3d;
    d3d = Math.max(d3d, 10);
    const h = 5.0;
    const dBp = 2 * Math.PI * hBs * hUt * fc * 1e9 / 3e8;

    let pl;
    if (d2d <= dBp) {
      pl = 20.0 * Math.log10(40.0 * Math.PI * d3d * fc / 3.0)
         + Math.min(0.03 * Math.pow(h, 1.72), 10.0) * Math.log10(d3d)
         - Math.min(0.044 * Math.pow(h, 1.72), 14.77)
         + 0.002 * Math.log10(h) * d3d;
    } else {
      pl = 20.0 * Math.log10(40.0 * Math.PI * dBp * fc / 3.0)
         + Math.min(0.03 * Math.pow(h, 1.72), 10.0) * Math.log10(dBp)
         - Math.min(0.044 * Math.pow(h, 1.72), 14.77)
         + 0.002 * Math.log10(h) * dBp
         + 40.0 * Math.log10(d3d / dBp);
    }
    return pl + gaussianRandom(0, 4.0);
  }

  function pathLossRmaNlos(d3d, fc, hBs, hUt, d2d) {
    if (hBs === undefined) hBs = 35;
    if (hUt === undefined) hUt = 1.5;
    if (d2d === undefined) d2d = d3d;
    d3d = Math.max(d3d, 10);
    const pl = 16.90 + 35.3 * Math.log10(d3d) + 20.0 * Math.log10(fc) - 0.3 * hUt;
    return pl + gaussianRandom(0, 8.0);
  }

  function computePathLoss(scenario, isLos, d3d, fcGHz, hBs, hUt, d2d) {
    if (d2d === undefined) d2d = d3d;
    switch (scenario) {
      case 'uma':
        return isLos ? pathLossUmaLos(d3d, fcGHz, hBs, hUt) : pathLossUmaNlos(d3d, fcGHz, hBs, hUt);
      case 'umi':
        return isLos ? pathLossUmiLos(d3d, fcGHz, hBs, hUt) : pathLossUmiNlos(d3d, fcGHz, hBs, hUt);
      case 'rma':
        return isLos ? pathLossRmaLos(d3d, fcGHz, hBs, hUt, d2d) : pathLossRmaNlos(d3d, fcGHz, hBs, hUt, d2d);
      default:
        return pathLossUmaLos(d3d, fcGHz, hBs, hUt);
    }
  }

  function shadowFadingStd(scenario, isLos) {
    switch (scenario) {
      case 'uma': return isLos ? 4.0 : 6.0;
      case 'umi': return isLos ? 4.0 : 7.82;
      case 'rma': return isLos ? 4.0 : 8.0;
      default: return 6.0;
    }
  }

  function computeSinrDb(txPowerDbm, pathLossDb, txGainDb, rxGainDb, cableLossDb,
                          noiseFigureDb, bandwidthHz, interferenceMw) {
    if (interferenceMw === undefined) interferenceMw = 0;
    const k = 1.38064852e-23;
    const T = 290.0;
    const thermalMw = k * T * bandwidthHz * 1e3;
    const noiseMw = thermalMw * Math.pow(10, noiseFigureDb / 10);
    const rxPowerDbm = txPowerDbm + txGainDb + rxGainDb - cableLossDb - pathLossDb;
    const rxPowerMw = Math.pow(10, rxPowerDbm / 10);
    const sinrLin = rxPowerMw / (interferenceMw + noiseMw);
    return 10 * Math.log10(Math.max(sinrLin, 1e-9));
  }

  function sampleCondition(scenario, d2d, hUt) {
    if (hUt === undefined) hUt = 1.5;
    const pLos = losProbability(scenario, d2d, hUt);
    return Math.random() < pLos;
  }

  function computeRsrp(txPowerDbm, pathLossDb, txGainDb, cableLossDb) {
    return txPowerDbm + txGainDb - cableLossDb - pathLossDb;
  }

  return {
    losProbability,
    computePathLoss,
    shadowFadingStd,
    computeSinrDb,
    computeRsrp,
    sampleCondition,
    gaussianRandom
  };
});
