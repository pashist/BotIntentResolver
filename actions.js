const { GraphQLClient } = require('graphql-request');

require('dotenv-extended').load({ path: './.env' });

const client = new GraphQLClient(process.env.API_URL, { headers: {} });
const agentId = process.env.AGENT_ID;

async function fetchIntentsAndEntities() {
  return client.request(`{
    intents(agentId: "${agentId}") {
      id name parameters { name value required prompts dataType }
    }
  }`);
}
async function buildActions() {
  const actions = [];
  const { intents, entities } = await fetchIntentsAndEntities();

  intents.forEach(intent => {
    actions.push({
      intentName: intent.name,
      friendlyName: intent.name,
      confirmOnContextSwitch: true,
      schema: createSchemaFromParams(intent.parameters, entities),
      fulfill: (parameters, callback) => {
        const paramStr = Object.keys(parameters).map(key => `${key}: ${parameters[key]}`).join(',');
        callback(`Intent ${intent.name} resolved with params: ${paramStr}`)
      }
    })
  });

  return actions;
}

function createSchemaFromParams(params = []) {
  const schema = {};

  params.forEach(param => {
    const entityName = param.dataType;
    if (!entityName || !param.required) {
      return;
    }
    schema[entityName] = {
      type: 'string',
      message: param.prompts[0] || `Please provide the ${param.name}`
    }
  });

  return schema;
}
module.exports = {
  buildActions,
};