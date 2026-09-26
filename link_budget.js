/**
 * Link Budget Engine — combines channel models + numerology for full NR link analysis.
 */
(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(
      require('./channel_models.js'),
      require('./nr_numerology.js')
    );
  } else {
    root.LinkBudget = factory(root.ChannelModels, root.NRNumerology);
  }
})(typeof self !== 'undefined' ? self : this, function(ChannelModels, NRNumerology) {

  function computeLink(params) {
    var distance2d = params.distance2d;
    var distance3d = params.distance3d;
    var fcMHz = params.fcMHz;
    var hBs = params.hBs;
    var hUt = params.hUt;
    var scenario = params.scenario;
    var isLos = params.isLos;
    var txPowerDbm = params.txPowerDbm;
    var txGainDb = params.txGainDb;
    var rxGainDb = params.rxGainDb;
    var cableLossDb = params.cableLossDb;
    var noiseFigureDb = params.noiseFigureDb;
    var bandwidthHz = params.bandwidthHz;
    var nPrb = params.nPrb;
    var scsKHz = params.scsKHz;
    var interferenceMw = params.interferenceMw || 0;

    var fcGHz = fcMHz / 1000;
    var los = isLos !== undefined ? isLos : ChannelModels.sampleCondition(scenario, distance2d, hUt);
    var pathLossDb = ChannelModels.computePathLoss(scenario, los, distance3d, fcGHz, hBs, hUt, distance2d);
    var rsrpDbm = ChannelModels.computeRsrp(txPowerDbm, pathLossDb, txGainDb, cableLossDb);
    var sinrDb = ChannelModels.computeSinrDb(txPowerDbm, pathLossDb, txGainDb, rxGainDb, cableLossDb, noiseFigureDb, bandwidthHz, interferenceMw);
    var mcs = NRNumerology.sinrToMcs(sinrDb);
    var mcsInfo = NRNumerology.getMcsInfo(mcs);

    var throughputMbps;
    if (nPrb && scsKHz) {
      throughputMbps = NRNumerology.prbThroughputMbps(sinrDb, nPrb, scsKHz);
    } else {
      throughputMbps = NRNumerology.shannonCapacityMbps(sinrDb, bandwidthHz);
    }

    return {
      pathLossDb: pathLossDb,
      rsrpDbm: rsrpDbm,
      sinrDb: sinrDb,
      mcs: mcs,
      mcsModulation: mcsInfo.mod,
      mcsCodeRate: mcsInfo.codeRate,
      throughputMbps: throughputMbps,
      los: los,
      distance2d: distance2d,
      distance3d: distance3d
    };
  }

  function computeDL(params) {
    return computeLink(Object.assign({}, params, {
      txPowerDbm: params.dlTxPowerDbm,
      txGainDb: params.bsGainDb,
      rxGainDb: params.ueGainDb || 0,
      cableLossDb: params.bsCableLossDb,
      noiseFigureDb: params.ueNoiseFigureDb,
    }));
  }

  function computeUL(params) {
    return computeLink(Object.assign({}, params, {
      txPowerDbm: params.ueTxPowerDbm,
      txGainDb: params.ueGainDb || 0,
      rxGainDb: params.bsGainDb,
      cableLossDb: params.bsCableLossDb,
      noiseFigureDb: params.bsNoiseFigureDb,
    }));
  }

  function computeInterference(ue, allBs, params) {
    var totalInterferenceMw = 0;
    for (var i = 0; i < allBs.length; i++) {
      var bs = allBs[i];
      if (bs === params.servingBs) continue;
      var d2d = haversine(bs.lat, bs.lng, ue.lat, ue.lng);
      var d3d = Math.sqrt(d2d * d2d + (bs.height - ue.height) ** 2);
      var fcGHz = params.fcMHz / 1000;
      var los = ChannelModels.sampleCondition(params.scenario, d2d, ue.height);
      var pl = ChannelModels.computePathLoss(params.scenario, los, d3d, fcGHz, bs.height, ue.height, d2d);
      var rxPowerDbm = params.dlTxPowerDbm + params.bsGainDb - params.bsCableLossDb - pl;
      totalInterferenceMw += Math.pow(10, rxPowerDbm / 10);
    }
    return totalInterferenceMw;
  }

  function haversine(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  return {
    computeLink: computeLink,
    computeDL: computeDL,
    computeUL: computeUL,
    computeInterference: computeInterference,
    haversine: haversine
  };
});
