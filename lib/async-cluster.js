var async = require('async'),
    ClusterQueue = require('./cluster-queue'),
    ClusterBatch = require('./cluster-batch');

async.clusterQueue = function (options, next) {
  return new ClusterQueue(options, next);
};

async.clusterBatch = function (data, options, action, next) {
  return new ClusterBatch(data, options, action, next);
};

module.exports = async;