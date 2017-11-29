const { GraphQLClient } = require('graphql-request');
const get = require('lodash/get');
const log = require('debug')('RESOLVER:AGENT');

require('dotenv-extended').load({ path: '../.env' });

class Agent {

  constructor({ id } = {}) {
    log('creating Agent instance');
    this.client = new GraphQLClient(process.env.API_URL, { headers: {} });
    this.agentId = id || process.env.AGENT_ID;
    this.data = {};
    this.isLoaded = false;
    this.isHelper = false;
    log('Agent instance created [%s]', this.agentId);
  }

  async load(force = false) {
    log('loading data from graphql');
    if (force || !this.isLoaded) {
      const data = await this.client.request(`{
        agent(id: "${this.agentId}") {
          modelId
          deployKey
          helperModelIds
          helperAgentIds
          intents {
            id name parameters { name value required prompts dataType }
            responses { 
              ... on TextResponse {
                speech  
              }
              ... on JsonResponse {
                value
              }
              ... on CardResponse {
                imageUrl
                title
                subtitle
                buttons {
                  text
                  postback
                }
              }
              ... on ImageResponse {
                imageUrl
              }
            }
          }
        }
      }`);
      this.data = data.agent;
      await this.loadHelperAgents();
      this.isLoaded = true;
      log('data loaded');
    }
  }

  get(key, def) {
    return get(this.data, key, def);
  }

  async loadHelperAgents() {
    if (this.isHelper) {
      return;
    }
    const agents = (this.get('helperAgentIds') || [])
      .map(id => new Agent({id}))
      .map(agent => {agent.isHelper = true; return agent});
    await Promise.all(agents.map(agent => agent.load()));
    this.data.helperAgents = agents;
  }

  getModelUrl() {
    return `https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/${this.data.modelId}?subscription-key=${this.data.deployKey}&timezoneOffset=0&verbose=true&q=`;
  }
}

module.exports = new Agent();