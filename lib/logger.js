/*
 *  Copyright 2018 Adobe Systems Incorporated. All rights reserved.
 *  This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License. You may obtain a copy
 *  of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software distributed under
 *  the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *  OF ANY KIND, either express or implied. See the License for the specific language
 *  governing permissions and limitations under the License.
 */

'use strict';

const path = require('path');

const winston = require('winston');

// module-global winston logger instance
let logger;

function configure(config) {
  const level = config && config.level || 'info';

  const logsDir = path.normalize(config && config.logsDir || 'logs');
  const logsFile = path.join(logsDir, 'error.log');

  logger = new winston.Logger({
    levels: {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    },

    colors: {
      debug: 'grey',
      info: 'black',
      warn: 'yellow',
      error: 'red'
    },

    transports: [
      new winston.transports.Console({
        level: level,
        colorize: true
      }),
      new winston.transports.File({
        level: level,
        filename: logsFile,
        json: false
      })
    ]
  });
  // export configured (module-global) log level
  exports.level = level;
}

// configure with defaults
configure();

// export configure function to allow overriding defaults
exports.configure = configure;

exports.log = function () {
  return logger.log.apply(logger, arguments);
};

exports.debug = function () {
  return logger.debug.apply(logger, arguments);
};

exports.info = function () {
  return logger.info.apply(logger, arguments);
};

exports.warn = function () {
  return logger.warn.apply(logger, arguments);
};

exports.error = function () {
  return logger.error.apply(logger, arguments);
};
