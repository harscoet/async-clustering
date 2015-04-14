var ClusterQueue = require('./cluster-queue');

module.exports = function (data, options, action, next) {
  var _this = this;

  if (typeof options === 'function') {
    next    = action;
    action  = options;
    options = null;
  }
  options = options || {};
  if (!options.packet) options.packet = 1000;

  var isNumber = typeof data === 'number',
      count = isNumber ? data : data.length;

  _this.queue = new ClusterQueue(options, next);

  for (var i = 0; i < count; i = i + options.packet) {
    var start = i, end = i + options.packet;

    var context = {
      meta: {
        packet: options.packet,
        start: start,
        end: end
      }
    };

    if (!isNumber) context.data = data.slice(start, end);

    _this.queue.push({
      context: context,
      action: action
    });
  }

  return _this.queue;
};