const builder = require('botbuilder');
const { GraphQLClient } = require('graphql-request');
const get = require('lodash/get');

require('dotenv-extended').load({ path: '../.env' });

class Agent {
  constructor() {
    this.client = new GraphQLClient(process.env.API_URL, { headers: {} });
    this.agentId = process.env.AGENT_ID;
    this.data = {};
    this.isLoaded = false;
  }
  async load(force = false) {
    if (force || !this.isLoaded) {
      const data = await this.client.request(`{
        agent(id: "${this.agentId}") {
          modelId
          deployKey
          helperModelIds
          intents {
            id name parameters { name value required prompts dataType }
          }
        }
      }`);
      this.data = data.agent;
      this.isLoaded = true;
    }
  }
  get(key, def) {
    return get(this.data, key, def);
  }
}

module.exports = new Agent();