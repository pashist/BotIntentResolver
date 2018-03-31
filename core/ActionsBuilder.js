const isEmpty = require('lodash/isEmpty');
const log = require('debug')('RESOLVER:ACTION_BUILDER');
const ResponsePicker = require('./Responses');
const Webhook = require('./WebHook');

require('dotenv-extended').load({ path: '../.env' });

class ActionsBuilder {
  constructor({ agent, botAuth }) {
    this.agent = agent;
    this.botAuth = botAuth;
  }

  async build() {
    log('building actions');
    const actions = [];

    this.getIntents().forEach(intent => {
      actions.push({
        intentName: intent.name,
        friendlyName: intent.name,
        authRequired: intent.authRequired,
        confirmOnContextSwitch: true,
        schema: this.createSchemaFromParams(intent.parameters),
        fulfill: (parameters, session, callback) => {
          log('handle fulfill callback');
          const responsePicker = new ResponsePicker({
            agent: intent.agent || this.agent,
            intentName: intent.name,
            parameters
          });
          const webhook = new Webhook({
            agent: intent.agent || this.agent,
          });
          const user = intent.authRequired ? this.botAuth.profile(session, process.env.BOTAUTH_PROVIDER) : {};

          if (intent.useWebhook && webhook.isExists()) {
            log('using webhook');
            webhook.call({ intent, parameters, user })
              .then(response => {
                log('received response from webhook url', response);
                callback(response.message);
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
        type: this.getEntityType(entityName),
        message
      }
    });

    return schema;
  }

  getEntityType(name) {
    const entities = this.agent.get('entities') || [];
    const entity = entities.find(e => e.name === name);
    if (entity) {
      switch (+entity.typeId) {
        case 2:
          return this.getBuiltInEntityType(entity.name);
        default:
          return 'string';
      }
    }
    return 'string';
  }

  getBuiltInEntityType(name) {
    switch (name) {
      case 'datetimeV2':
        return 'array';
      case 'datetime':
        return 'object';
      default:
        return 'string';
    }
  }

  getIntents() {
    const intents = this.agent.get('intents');
    const helperAgents = this.agent.get('helperAgents');

    if (!isEmpty(helperAgents)) {
      helperAgents.forEach(agent => {
        if (!isEmpty(agent.intents)) {
          agent.intent.forEach(intent => {
            if (!intents.find(it => it.name === intent.name)) {
              intents.push(Object.assign({}, intent, { agent }));
            }
          })
        }
      });
    }
    return intents;
  }
}

module.exports = ActionsBuilder;