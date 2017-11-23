const { GraphQLClient } = require('graphql-request');
const get = require('lodash/get');
const log = require('debug')('RESOLVER:AGENT');

require('dotenv-extended').load({ path: '../.env' });

class Agent {
  constructor() {
    log('creating Agent instance');
    this.client = new GraphQLClient(process.env.API_URL, { headers: {} });
    this.agentId = process.env.AGENT_ID;
    this.data = {};
    this.isLoaded = false;
    log('Agent instance created');
  }
  async load(force = false) {
    log('loading data from graphql');
    if (force || !this.isLoaded) {
      const data = await this.client.request(`{
        agent(id: "${this.agentId}") {
          modelId
          deployKey
          helperModelIds
          intents {
            id name parameters { name value required prompts dataType }
            responses { speech }
          }
        }
      }`);
      this.data = data.agent;
      this.isLoaded = true;
      log('data loaded');
    }
  }
  get(key, def) {
    return get(this.data, key, def);
  }
}

module.exports = new Agent();