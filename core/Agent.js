const { GraphQLClient } = require('graphql-request');
const get = require('lodash/get');
const log = require('debug')('RESOLVER:AGENT');
const https = require('https');
const http = require('http');

const client = process.env.API_URL.match(/^https/) ? https: http;
const agent = new client.Agent({
  rejectUnauthorized: false
});

require('dotenv-extended').load({ path: '../.env' });

class Agent {

  constructor({ agentKey } = {}) {
    log('creating Agent instance');
    log('using graphql api url %s', process.env.API_URL);
    this.client = new GraphQLClient(process.env.API_URL, { headers: {}, agent });
    this.agentKey = agentKey;
    this.data = {};
    this.isLoaded = false;
    if (!this.agentKey) {
      throw new Error('Missing required parameter \'agentKey\'');
    }
    log('Agent instance created');
  }

  async load(force = false) {
    log('loading data from graphql');
    if (force || !this.isLoaded) {
      const data = await this.client.request(`{
        agentByKey(agentKey: "${this.agentKey}") {
          model {
            id
            apiKey
            productionSlot { endpointRegion }
          }
          helperModels {
            id
            apiKey
            productionSlot { endpointRegion }
          }
          helperAgents {
            id
            model {
              id
              apiKey
              productionSlot { endpointRegion }
            }
            webhook {
              url
              basicAuth {
                username
                password
              }
              headers {
                key
                value
              }
            }
            intents {
              id
              name
              action
              useWebhook
              authRequired
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
          intents {
            id
            name
            action
            useWebhook
            authRequired
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
          webhook {
            url
            basicAuth {
              username
              password
            }
            headers {
              key
              value
            }
          }
        }
      }`);
      this.data = data.agentByKey;
      this.isLoaded = true;
      log('data loaded for agent id %s', this.data.id);
    }
  }

  get(key, def) {
    return get(this.data, key, def);
  }
}

module.exports = new Agent({ agentKey: process.env.AgentKey });