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
const http = require('http');
const https = require('https');
const util = require('util');

const fse = require('fs-extra');
const pem = require('pem');
const _ = require('lodash');

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

/**
 * Current state of the server
 */
const serverState = {
  httpSrv: null,
  httpsSrv: null,
};

function applyDefaults(options) {
  const opts = options || {};
  opts.repoRoot = opts.repoRoot || DEFAULT_REPO_ROOT;
  opts.virtualRepos = opts.virtualRepos || {};

  opts.listen = opts.listen || {};
  opts.listen.http = _.defaults(opts.listen.http, {
    port: DEFAULT_HTTP_PORT,
    host: DEFAULT_HOST,
  });
  if (opts.listen.https) {
    opts.listen.https = _.defaults(opts.listen.https, {
      port: DEFAULT_HTTPS_PORT,
      host: DEFAULT_HOST,
    });
  }
  return opts;
}

async function initConfiguration(rawConfig) {
  try {
    const config = applyDefaults(rawConfig);

    // root dir of repositories
    config.repoRoot = path.resolve(config.repoRoot);
    await fse.ensureDir(config.repoRoot);

    // configure logger
    config.logs = config.logs || {};
    config.logs.logsDir = path.normalize(config.logs.logsDir || 'logs');
    await fse.ensureDir(config.logs.logsDir);

    logger.configure(config.logs);
    config.logger = logger;

    logger.info('configuration successfully read: %s', config.configPath);

    return config;
  } catch (e) {
    throw new Error(`unable to initialize the configuration: ${e.message}`);
  }
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
    const config = require(configPath);
    config.configPath = configPath;
    return config;
  } catch (e) {
    throw new Error(`unable to read the configuration: ${e.message}`);
  }
}

async function startHttpServer(config) {
  const { host, port } = config.listen.http;

  return new Promise((resolve, reject) => {
    const srv = http.createServer(app(config)).listen(port, host, (err) => {
      if (err) {
        reject(new Error(`unable to start start http server: ${err.message}`));
      }
      logger.info(`[${process.pid}] HTTP: listening on port ${srv.address().port}`);
      resolve(srv);
    });
  });
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

    return new Promise((resolve, reject) => {
      const srv = https.createServer(options, app(config)).listen(port, host, (err) => {
        if (err) {
          reject(new Error(`unable to start start https server: ${err.message}`));
        }
        logger.info(`[${process.pid}] HTTPS: listening on port ${srv.address().port}`);
        resolve(srv);
      });
    });
  } catch (e) {
    throw new Error(`unable to start start https server: ${e.message}`);
  }
}

async function stopHttpServer() {
  if (!serverState.httpSrv) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    serverState.httpSrv.close((err) => {
      if (err) {
        reject(new Error(`Error while stopping http server: ${err}`));
      }
      logger.info('HTTP: server stopped.');
      serverState.httpSrv = null;
      resolve();
    });
  });
}

async function stopHttpsServer() {
  if (!serverState.httpsSrv) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    serverState.httpsSrv.close((err) => {
      if (err) {
        reject(new Error(`Error while stopping https server: ${err}`));
      }
      logger.info('HTTPS: server stopped.');
      serverState.httpsSrv = null;
      resolve();
    });
  });
}

async function start(rawConfig) {
  const cfg = rawConfig || await readConfiguration();
  return initConfiguration(cfg)
    // setup and start the server
    .then(async (config) => {
      serverState.httpSrv = await startHttpServer(config);
      // issue #218: https is optional
      if (config.listen.https) {
        serverState.httpsSrv = await startHttpsServer(config);
      }
      return {
        httpPort: serverState.httpSrv.address().port,
        httpsPort: serverState.httpsSrv ? serverState.httpsSrv.address().port : -1,
      };
    })
    // handle errors during initialization
    .catch((err) => {
      const msg = `error during startup, exiting... : ${err.message}`;
      logger.error(msg);
      throw Error(msg);
    });
}

async function stop() {
  await stopHttpServer();
  await stopHttpsServer();
}

module.exports = {
  start,
  stop,
};
