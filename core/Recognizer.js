const builder = require('botbuilder');
const { isEmpty, get } = require('lodash');
const log = require('debug')('RESOLVER:RECOGNIZER'); //todo all logging

require('dotenv-extended').load({ path: '../.env' });

class Recognizer {

  constructor({agent}) {
    this.agent = agent;
  }

  buildModelUrl(model) {
    log('build url for model', model);
    const id = model.id;
    const key = model.apiKey;
    const endpointRegion = get(model, 'productionSlot.endpointRegion');
    if (!id) {
      log('Build model url failed. Missing model id');
      return false;
    }
    if (!key) {
      log('Build model url failed. Missing apiKey for model id', model.id);
      return false;
    }
    if (!endpointRegion) {
      log('Build model url failed. Missing endpointRegion for model id', model.id);
      return false;
    }
    const modelUrl = `https://${endpointRegion}.api.cognitive.microsoft.com/luis/v2.0/apps/${id}?subscription-key=${key}&timezoneOffset=0&verbose=true&q=`;;
    log('build url for model id %s: %s', model.id, modelUrl);
    return modelUrl;
  }

  getModelUrls(type) {
    if (type === Recognizer.TYPE_MAIN) {
      return [this.buildModelUrl(this.agent.get('model'))];
    }
    if (type === Recognizer.TYPE_ENTITY) {
      const modelIds = this.agent.get('helperModels');
      if (!isEmpty(modelIds)) {
        return modelIds.map(model => this.buildModelUrl(model));
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
    console.log(`Recognizer type ${type} recognize input:`, text);
    const context = { message: { text } };
    return new Promise((resolve, reject) => {
      const recognizer = this.getRecognizer(type);
      if (!recognizer) {
        return reject(new Error(`No recognizer found for type ${type}`));
      }
      recognizer.recognize(context, (err, result) => {
        console.log(`Recognizer type ${type} recognize result:`, err, result);
        if (!err) {
          return resolve(result);
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