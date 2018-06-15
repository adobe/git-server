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
const http = require('http');
const https = require('https');
const util = require('util');

const fse = require('fs-extra');
const pem = require('pem');

const logger = require('./logger');
const app = require('./app');

const DEFAULT_REPO_ROOT = './repos';
const DEFAULT_HTTP_PORT = 5000;
const DEFAULT_HTTPS_PORT = 5443;
const DEFAULT_HOST = '0.0.0.0';

process.on('uncaughtException', (err) => {
  logger.error('encountered uncaught exception at process level', err);
  // in case of fatal errors which cause process termination errors sometimes don't get logged:
  // => print error directly to console
  /* eslint no-console: off */
  console.log('encountered uncaught exception at process level', err);
});

process.on('unhandledRejection', (err) => {
  logger.error('encountered unhandled promise rejection at process level', err);
});

function applyDefaults(options) {
  const opts = options || {};
  opts.repoRoot = opts.repoRoot || DEFAULT_REPO_ROOT;

  opts.listen = opts.listen || {};
  opts.listen.http = opts.listen.http || {};
  opts.listen.http.port = opts.listen.http.port || DEFAULT_HTTP_PORT;
  opts.listen.http.host = opts.listen.http.host || DEFAULT_HOST;
  opts.listen.https = opts.listen.https || {};
  opts.listen.https.port = opts.listen.https.port || DEFAULT_HTTPS_PORT;
  opts.listen.https.host = opts.listen.https.host || DEFAULT_HOST;
  return opts;
}

async function readConfiguration() {
  try {
    let configPath = path.join(__dirname, 'config.js');

    const exists = await fse.exists(configPath);
    if (!exists) {
      configPath = path.join(process.cwd(), 'config.js');
    }

    /* eslint-disable global-require */
    /* eslint-disable import/no-dynamic-require */
    const config = applyDefaults(require(configPath));

    // root dir of repositories
    config.repoRoot = path.resolve(config.repoRoot);
    await fse.ensureDir(config.repoRoot);

    // configure logger
    config.logs = config.logs || {};
    config.logs.logsDir = path.normalize(config.logs.logsDir || 'logs');
    await fse.ensureDir(config.logs.logsDir);

    logger.configure(config.logs);

    logger.info('configuration successfully read: %s', configPath);

    return config;
  } catch (e) {
    throw new Error(`unable to read the configuration: ${e.message}`);
  }
}

async function startHttpServer(config) {
  const { host, port } = config.listen.http;

  try {
    await http.createServer(app(config)).listen(port, host);
    logger.info(`[${process.pid}] HTTP: listening on port ${port}`);
  } catch (e) {
    throw new Error(`unable to start start http server: ${e.message}`);
  }
}

async function startHttpsServer(config) {
  const {
    host, port, key, cert,
  } = config.listen.https;

  const createCertificate = util.promisify(pem.createCertificate);

  try {
    let options;
    if (key && cert) {
      options = {
        key: await fse.readFile(key, 'utf8'),
        cert: await fse.readFile(cert, 'utf8'),
      };
    } else {
      const keys = await createCertificate({ selfSigned: true });
      options = {
        key: keys.serviceKey,
        cert: keys.certificate,
      };
    }
    await https.createServer(options, app(config)).listen(port, host);
    logger.info(`[${process.pid}] HTTPS: listening on port ${port}`);
  } catch (e) {
    throw new Error(`unable to start start https server: ${e.message}`);
  }
}

// read a config.json file from the file system and parse it
readConfiguration()
  // setup and start the server
  .then(async (config) => {
    await startHttpServer(config);
    await startHttpsServer(config);
  })
  // handle errors during initialization
  .catch((err) => {
    logger.error('error during startup, exiting... : %s', err.message);
    process.exit(1);
  });
