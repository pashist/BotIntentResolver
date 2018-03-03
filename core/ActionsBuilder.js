const isEmpty = require('lodash/isEmpty');
const log = require('debug')('RESOLVER:ACTION_BUILDER');
const ResponsePicker = require('./Responses');
const Webhook = require('./WebHook');

require('dotenv-extended').load({ path: '../.env' });

class ActionsBuilder {
  constructor({agent}) {
    this.agent = agent;
  }

  async build() {
    log('building actions');
    const actions = [];

    this.getIntents().forEach(intent => {
      actions.push({
        intentName: intent.name,
        friendlyName: intent.name,
        confirmOnContextSwitch: true,
        schema: this.createSchemaFromParams(intent.parameters),
        fulfill: (parameters, callback) => {
          log('handle fulfill callback');
          const responsePicker = new ResponsePicker({
            agent: intent.agent || this.agent,
            intentName: intent.name,
            parameters
          });
          const webhook = new Webhook({
            agent: intent.agent || this.agent,
          });
          if (intent.useWebhook && webhook.isExists()) {
            log('using webhook');
            webhook.call({ intent, parameters })
              .then(response => {
                log('received response from webhook url', response);
                callback(response.fulfillText);
              })
              .catch(err => {
                log('webhook call error', err);
                callback(`Webhook call error: ${err.message}`)
              })
          } else {
            log('pick response');
            const response = responsePicker.pick();
            if (response) {
              log('response found');
              callback(response);
            } else {
              log('response not found, using default');
              const paramStr = Object.keys(parameters).map(key => `${key}: ${parameters[key]}`).join(',');
              callback(`Intent ${intent.name} resolved with params: ${paramStr}`)
            }
          }
        }
      })
    });
    log('actions build success');
    return actions;
  }

  createSchemaFromParams(params = []) {
    const schema = {};

    params.forEach(param => {
      const entityName = param.dataType;
      if (!entityName || !param.required) {
        return;
      }
      const message = isEmpty(param.prompts) ? [`Please provide the ${param.name}`] : param.prompts;
      schema[entityName] = {
        type: 'string',
        message
      }
    });

    return schema;
  }

  getIntents() {
    const intents = this.agent.get('intents');
    this.agent.get('helperAgents').forEach(agent => {
      agent.get('intents').forEach(intent => {
        if (!intents.find(it => it.name === intent.name)) {
          intents.push(Object.assign({}, intent, { agent }));
        }
      });
    });
    return intents;
  }
}

module.exports = ActionsBuilder;