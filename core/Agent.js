const { GraphQLClient } = require('graphql-request');
const get = require('lodash/get');
const log = require('debug')('RESOLVER:AGENT');

require('dotenv-extended').load({ path: '../.env' });

class Agent {

  constructor({ id } = {}) {
    log('creating Agent instance');
    log('using graphql api url %s', process.env.API_URL);
    this.client = new GraphQLClient(process.env.API_URL, { headers: {} });
    this.agentId = id;
    this.data = {};
    this.isLoaded = false;
    this.isHelper = false;
    log('Agent instance created [%s]', this.agentId);
  }

  async load(force = false) {
    log('loading data from graphql');
    if (force || !this.isLoaded) {
      const reqHead = this.agentId ?
        `agent(agentId: "${this.agentId}")` :
        `agentByAppName(appName: "${process.env.WEBSITE_SITE_NAME}")`;
      const data = await this.client.request(`{
        ${reqHead} {
          model {
            id
            apiKey
            productionSlot { uri endpointRegion }
          }
          helperModels {
            id
            apiKey
            productionSlot { uri endpointRegion }
          }
          helperAgents { id }
          intents {
            id
            name
            parameters {
              name
              value
              required
              prompts
              dataType
            }
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
      this.data = this.agentId ? data.agent : data.agentByAppName;
      await this.loadHelperAgents();
      this.isLoaded = true;
      log('data loaded for agent id %s', this.data.id);
    }
  }

  get(key, def) {
    return get(this.data, key, def);
  }

  async loadHelperAgents() {
    if (this.isHelper) {
      return;
    }
    log('loading helper agents: ', this.get('helperAgents'));
    const agents = (this.get('helperAgents') || [])
      .map(({ id }) => new Agent({id}))
      .map(agent => Object.assign(agent, { isHelper: true }));
    await Promise.all(agents.map(agent => agent.load()));
    this.data.helperAgents = agents;
  }

  getModelUrl() {
    const modelUrl = `${this.data.model.productionSlot.uri}?subscription-key=${this.data.model.apiKey}&timezoneOffset=0&verbose=true&q=`;
    log('main model url: %s', modelUrl);
    return modelUrl;
  }
}

module.exports = new Agent();