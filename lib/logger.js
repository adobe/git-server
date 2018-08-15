/*
 * Copyright 2018 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

'use strict';

const path = require('path');

const winston = require('winston');

// module-global winston logger instance
let logger;

function configure(config) {
  const level = (config && config.level) || 'info';

  const logsDir = path.normalize((config && config.logsDir) || 'logs');
  const logsFile = path.join(logsDir, 'error.log');

  const levels = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  logger = winston.createLogger({
    levels,
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS',
      }),
      winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
    ),
    transports: [
      new winston.transports.Console({
        level,
      }),
      new winston.transports.File({
        level,
        filename: logsFile,
        json: false,
      }),
    ],
  });
  // export configured (module-global) log level
  exports.level = level;
}

// configure with defaults
configure();

// export configure function to allow overriding defaults
exports.configure = configure;

exports.log = (...args) => logger.log(...args);
exports.debug = (...args) => logger.debug(...args);
exports.info = (...args) => logger.info(...args);
exports.warn = (...args) => logger.warn(...args);
exports.error = (...args) => logger.error(...args);
