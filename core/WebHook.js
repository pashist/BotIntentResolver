const log = require('debug')('RESOLVER:WEBHOOK');
const get = require('lodash/get');
const maxBy = require('lodash/maxBy');
const minBy = require('lodash/maxBy');
const sample = require('lodash/sample');
const isEmpty = require('lodash/isEmpty');
const rp = require('request-promise');

require('dotenv-extended').load({ path: '../.env' });

class WebHook {
  constructor({agent}) {
    log('create instance');
    this.agent = agent;
  }

  isExists() {
    return !!this.agent.get('webhook.url');
  }

  async call({ intent, parameters }) {
    if (!this.isExists()) {
      log('webhook url not defined');
      return false;
    }
    log('send request to webhook url', this.agent.get('webhook.url') );
    const webhook = this.agent.get('webhook');
    const opts = {
      method: 'POST',
      uri: webhook.url,
      body: {
        intent: intent,
        parameters: parameters,
      },
      json: true,
    };
    if (webhook.basicAuth && webhook.basicAuth.username) {
      opts.auth = {
        user: webhook.basicAuth.username,
          pass: webhook.basicAuth.password,
          sendImmediately: false
      }
    }
    if (!isEmpty(webhook.headers)) {
      opts.headers = webhook.headers.reduce((acc, v) => ({ ...acc, [v.key]: v.value }), {});
    }
    return rp(opts);
  }
}

module.exports = WebHook;