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

const _ = require('lodash');

const logger = require('./logger');

/**
 * Export the subdomain handler (express middleware) through a parameterizable function
 *
 * @param {object} options configuration hash
 * @returns {function(*, *, *)} handler function
 */
module.exports = function (options) {
  const conf = options && options.subdomainMapping || {};
  const enabled = conf.enable && conf.baseDomains && conf.baseDomains.length;
  return (req, res, next) => {
    if (!enabled) {
      return next();
    }

    let host = req.headers.host;
    const origUrl = host + req.url;

    // trim :<port>
    host = host.split(':')[0];

    // match & remove base domain
    let i = _.findIndex(conf.baseDomains, dom => _.endsWith(host, dom));
    if (i === -1) {
      return next();
    }
    host = _.trimEnd(host.slice(0, -conf.baseDomains[i].length), '.');
    if (!host.length) {
      // no subdomains
      return next();
    }

    req.url = '/' + host.split('.').join('/') + req.url;
    req.mappedSubDomain = true;

    logger.debug(`${origUrl} => ${req.url}`);

    // pass on to next middleware
    next();
  };
};
