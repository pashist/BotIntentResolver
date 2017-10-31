const rp = require('request-promise');
const isEmpty = require('lodash/isEmpty');
const { GraphQLClient } = require('graphql-request');

require('dotenv-extended').load({ path: './.env' });

const client = new GraphQLClient(process.env.API_URL, { headers: {} });
const agentId = process.env.AGENT_ID;

async function fetchIntentsAndEntities() {
  return client.request(`{
    intents(agentId: "${agentId}") {
      id name parameters { name value required prompts dataType }
    }
    entities(agentId: "${agentId}") {
      id name
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

function createSchemaFromParams(params = [], entities = []) {
  const schema = {};
  const getEntityName = id => (entities.find(it => it.id === id) || {}).name;

  params.forEach(param => {
    const entityName = getEntityName(param.dataType);
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
//
// async function exportApp() {
//   const options = {
//     uri: `${process.env.LUIS_APP_URL}/${process.env.LUIS_APP_ID}/versions/${process.env.LUIS_APP_VERSION}/export`,
//     headers: {
//       'Ocp-Apim-Subscription-Key': process.env.LUIS_APP_KEY
//     },
//     json: true
//   };
//   return await rp(options);
// }
//
// function parseActions(app) {
//   const actions = [];
//   if (!app.utterances) {
//     return actions;
//   }
//   app.utterances.forEach(utterance => {
//     if (!isEmpty(utterance.entities) && utterance.intent) {
//       let action = actions.find(act => act.intentName === utterance.intent);
//       if (!action) {
//         action = {
//           intentName: utterance.intent,
//           friendlyName: utterance.intent,
//           confirmOnContextSwitch: true,
//           schema: {},
//           fulfill: (parameters, callback) => {
//             const paramStr = Object.keys(parameters).map(key => `${key}: ${parameters[key]}`).join(',');
//             callback(`Intent ${utterance.intent} resolved with params: ${paramStr}`)
//           }
//         };
//         actions.push(action);
//       }
//       utterance.entities.forEach(entity => {
//         if (!action.schema[entity.entity]) {
//           action.schema[entity.entity] = {
//             type: 'string',
//             message: `Please provide the ${entity.entity}`
//           }
//         }
//       });
//     }
//   });
//   return actions;
// }

// async function loadActions() {
//   return await parseActions(await exportApp());
// }

module.exports = {
  // loadActions,
  buildActions,
};