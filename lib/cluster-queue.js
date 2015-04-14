var async = require('async'),
    crypto = require('crypto'),
    EventEmitter = require('events').EventEmitter,
    childProcess = require('child_process'),
    stripComments = require('strip-comments'),
    fs = require('fs');

module.exports = function (options, next) {
  var _this = this;

  if (typeof options === 'function') { next = options; options = null; }
  options = options || {};
  options.dir = options.dir || 'queue';
  options.id  = options.id || Date.now();
  options.concurrency = options.concurrency || require('os').cpus().length;
  options.clear = typeof options.clear === 'undefined' ? true : options.clear;
  options.reset = typeof options.reset === 'undefined' ? true : options.reset;
  options.data  = typeof options.data === 'undefined' ? true : options.data;

  _this.data = [];
  _this.total = 0;
  _this.queue = null;
  _this.workers = [];
  _this.events = new EventEmitter();
  _this.queueDir = options.dir + '/' + options.id;

  _this.workersTimes = [];
  _this.lastWorkerTime = [];
  _this.startTime = null;

  _this.getProgress = function () {
    var getAvg = function (array) {
      var avg = 0;

      array.forEach(function (time) {
        avg += time;
      });

      return Math.floor(avg / array.length);
    };

    var now = Date.now(),
        i = _this.total - (_this.queue.length() + _this.queue.running()) + 1,
        workerTimeAvg = getAvg(_this.workersTimes),
        endTime = _this.startTime + ((_this.total / options.concurrency) * workerTimeAvg),
        endDate = new Date(endTime),
        duration = now - _this.startTime,
        remainingTime = endTime - now;

    return {
      total: _this.total,
      i: i,
      string: i + '/' + _this.total,
      percent: Math.floor(i * 100 / _this.total),
      waiting: _this.queue.length(),
      running: _this.queue.running() - 1,
      start: new Date(_this.startTime),
      end: endDate,
      times: {
        duration: duration,
        end: remainingTime > 0 ? remainingTime : 0,
        lastWorker: _this.lastWorkerTime,
        avgWorker: workerTimeAvg
      }
    };
  };

  _this.queue = async.queue(function (task, next) {
    var total = _this.queue.running() + _this.queue.length(),
        time = Date.now(),
        code, context = {};

    if (total > _this.total) _this.total = total;
    if (!_this.startTime) _this.startTime = Date.now();

    if (typeof task === 'object') {
      if (!task.action) throw new Error('Task.action is required');
      else if (typeof task.action !== 'function') throw new Error('Task.action must be a function');

      if (task.context) context = task.context;
      code = task.action.toString();
    } else if (typeof task === 'function') code = task.toString();
    else throw new Error('Task must be a function or an object with task.action');

    var hash = crypto.createHash('md5').update(code).digest('hex'),
        filePath = _this.queueDir + '/' + hash + '.js';

    fs.exists(filePath, function (exists) {
      var fork = function () {
        var worker = childProcess.fork(filePath);

        worker.send(context);

        worker.on('message', function (msg) {
          _this.lastWorkerTime = Date.now() - time;
          _this.workersTimes.push(_this.lastWorkerTime);
          _this.events.emit('progress', _this.getProgress());

          if (msg) {
            _this.events.emit('data', msg);
            if (options.data) {
              if (!options.flat) _this.data.push(msg);
              else _this.data = _this.data.concat(msg);
            }
          }

          return next();
        });
      };

      if (!exists) {
        if (_this.workers.indexOf(filePath) >= 0) return setTimeout(fork, options.timeout || 20);

        _this.workers.push(filePath);

        var cleanCode = stripComments(code).replace(/(\r\n|\n|\r)/gm, '');
        if (!options.extraSpaces) cleanCode = cleanCode.replace(/\s+/g, ' ');

        var matches     = cleanCode.match(/{(.+)}/),
            innerCode   = matches[1],
            matchesArgs = cleanCode.match(/^[\w\s]+\(([\d\w\s,]+)\)/),
            contextArg  = 'context';

        if (matchesArgs) {
          var funcArgs       = matchesArgs[1].split(',').map(function (arg) { return arg.replace(/\s/g, ''); }),
              callbackArg    = funcArgs[funcArgs.length - 1],
              regExpCallback = new RegExp('(return\\s)?' + callbackArg + '\\(([^\\)]*)\\);?'),
              callbackData   = innerCode.match(regExpCallback);

          contextArg   = funcArgs[0];
          callbackData = callbackData[2] || null;
          innerCode    = innerCode.replace(regExpCallback, 'process.send(' + callbackData + ');process.exit();');
        }

        fs.mkdir(options.dir, function () {
          fs.mkdir(_this.queueDir, function () {
            innerCode = 'process.on(\'message\', function (' + contextArg + ') {' + innerCode + '});';

            fs.writeFile(filePath, innerCode, fork);
          });
        });
      } else return fork();
    });
  }, options.concurrency);

  _this.queue.events = _this.events;

  _this.queue.resetTotal = function () {
    _this.total = 0;
  };

  _this.queue.resetData = function () {
    _this.data = [];
  };

  _this.queue.resetTimes = function () {
    _this.workersTimes = [];
    _this.lastWorkerTime = [];
    _this.startTime = null;
  };

  _this.queue.reset = function () {
    _this.queue.resetTotal();
    _this.queue.resetData();
    _this.queue.resetTimes();
  };

  _this.queue.clear = function (next) {
    _this.workers.forEach(function (worker) {
      fs.unlinkSync(worker);
    });
    fs.rmdirSync(_this.queueDir);

    if (typeof next === 'function') return next(_this.data);
  };

  _this.queue.drain = function () {
    _this.events.emit('drain', _this.data);
    if (options.reset) _this.queue.reset();

    if (options.clear) return _this.queue.clear(next);
    else if (typeof next === 'function') return next(_this.data);
  };

  _this.queue.on = function (event, next) {
    return _this.events.on(event, next);
  };

  return _this.queue;
};