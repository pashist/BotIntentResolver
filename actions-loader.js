const rp = require('request-promise');
const isEmpty = require('lodash/isEmpty');
require('dotenv-extended').load({ path: './.env' });

async function exportApp() {
  const options = {
    uri: `${process.env.LUIS_APP_URL}/${process.env.LUIS_APP_ID}/versions/${process.env.LUIS_APP_VERSION}/export`,
    headers: {
      'Ocp-Apim-Subscription-Key': process.env.LUIS_APP_KEY
    },
    json: true
  };
  return await rp(options);
}

function parseActions(app) {
  const actions = [];
  if (!app.utterances) {
    return actions;
  }
  app.utterances.forEach(utterance => {
    if (!isEmpty(utterance.entities) && utterance.intent) {
      let action = actions.find(act => act.intentName === utterance.intent);
      if (!action) {
        action = {
          intentName: utterance.intent,
          friendlyName: utterance.intent,
          confirmOnContextSwitch: true,
          schema: {},
          fulfill: (parameters, callback) => {
            const paramStr = Object.keys(parameters).map(key => `${key}: ${parameters[key]}`).join(',');
            callback(`Intent ${utterance.intent} resolved with params: ${paramStr}`)
          }
        };
        actions.push(action);
      }
      utterance.entities.forEach(entity => {
        if (!action.schema[entity.entity]) {
          action.schema[entity.entity] = {
            type: 'string',
            message: `Please provide the ${entity.entity}`
          }
        }
      });
    }
  });
  return actions;
}

async function loadActions() {
  return await parseActions(await exportApp());
}

module.exports = loadActions;