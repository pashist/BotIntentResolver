const isEmpty = require('lodash/isEmpty');
const ResponsePicker = require('./Responses');

require('dotenv-extended').load({ path: '../.env' });

class ActionsBuilder {
  constructor({agent}) {
    this.agent = agent;
  }

  async build() {
    const actions = [];

    this.agent.get('intents').forEach(intent => {
      actions.push({
        intentName: intent.name,
        friendlyName: intent.name,
        confirmOnContextSwitch: true,
        schema: this.createSchemaFromParams(intent.parameters),
        fulfill: (parameters, callback) => {
          const responsePicker = new ResponsePicker({agent: this.agent, intentName: intent.name, parameters});
          const response = responsePicker.pick();
          if (response) {
            callback(response);
          } else {
            const paramStr = Object.keys(parameters).map(key => `${key}: ${parameters[key]}`).join(',');
            callback(`Intent ${intent.name} resolved with params: ${paramStr}`)
          }
        }
      })
    });

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
}

module.exports = ActionsBuilder;