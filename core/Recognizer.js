const builder = require('botbuilder');
const isEmpty = require('lodash/isEmpty');
const log = require('debug')('RESOLVER:RECOGNIZER'); //todo all logging

require('dotenv-extended').load({ path: '../.env' });

class Recognizer {

  constructor({agent}) {
    this.agent = agent;
  }

  buildModelUrl(modelId, subscriptionKey) {
    const key = subscriptionKey || this.agent.get('deployKey');
    const id = modelId || this.agent.get('modelId');
    return `https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/${id}?subscription-key=${key}&timezoneOffset=0&verbose=true&q=`;
  }

  getModelUrls(type) {
    if (type === Recognizer.TYPE_MAIN) {
      return [this.buildModelUrl()];
    }
    if (type === Recognizer.TYPE_ENTITY) {
      const modelIds = this.agent.get('helperModelIds');
      if (!isEmpty(modelIds)) {
        return modelIds.map(modelId => this.buildModelUrl(modelId, key));
      }
    } else if (type === Recognizer.TYPE_HELPER) {
      return this.agent.get('helperAgents').map(agent => agent.getModelUrl());
    }

    return [];
  }

  getMainRecoginzer() {
    return this.getRecognizer();
  }

  getHelperRecoginzer() {
    return this.getRecognizer(Recognizer.TYPE_HELPER);
  }

  getEntityRecoginzer() {
    return this.getRecognizer(Recognizer.TYPE_ENTITY);
  }

  getRecognizer(type = Recognizer.TYPE_MAIN) {
    const recognizers = [];
    const types = [].concat(type);
    types.forEach(type => {
      this.getModelUrls(type).forEach(modelUrl => recognizers.push(new builder.LuisRecognizer(modelUrl)));
    });
    if (recognizers.length > 1) {
      return new builder.IntentRecognizerSet({ recognizers });
    }
    return recognizers[0];
  }

  recognize(text, type = Recognizer.TYPE_MAIN) {
    const context = { message: { text } };
    return new Promise((resolve, reject) => {
      const recognizer = this.getRecognizer(type);
      if (!recognizer) {
        return reject(new Error(`No recognizer found for type ${type}`));
      }
      this.getRecognizer(type).recognize(context, (err, result) => {
        console.log('EntityRecognizer.recognize', err, result);
        if (!err) {
          resolve(result);
        } else {
          reject(err);
        }
      })
    });

  }
}

Recognizer.TYPE_MAIN = 'TYPE_MAIN';
Recognizer.TYPE_HELPER = 'TYPE_HELPER';
Recognizer.TYPE_ENTITY = 'TYPE_ENTITY';

module.exports = Recognizer;