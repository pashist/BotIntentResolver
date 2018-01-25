const builder = require('botbuilder');
const isEmpty = require('lodash/isEmpty');
const get = require('lodash/get');
const log = require('debug')('RESOLVER:ENTITY_RESOLVER');

require('dotenv-extended').load({ path: '../.env' });

class EntityResolver {

  constructor({agent}) {
    this.agent = agent;
  }

  async recognizeFromInput(input) {
    log('recognize user input:', input);
    const models = this.agent.get('helperModels');
    log('using model ids:', models.map(m => m.id));
    if (!isEmpty(models)) {
      const promises = models.map(model => {
        const modelUrl = this.buildModelUrl(model);
        return new Promise(resolve => {
          if (!modelUrl) {
            return resolve({error: 'modelUrl is empty'})
          }
          builder.LuisRecognizer.recognize(input, modelUrl, (error, intents, entities) => {
            if (error) {
              log('recognize error:', error);
              resolve({error});
            }
            resolve({entities})
          });
        });
      });
      const results = await Promise.all(promises);
      const entities = results.reduce((acc, result) => result.error ? acc : acc.concat(result.entities), []);
      const result = this.getTopScoredEntities(entities);
      log('result:', result);
      return result;
    }
    return null;
  }

  getTopScoredEntities(entities = []) {
    return entities.reduce((acc, it) => {
      const curr = acc.find(({type}) => type === it.type);
      if (!curr ||
        (it.resolution && !isEmpty(it.resolution.values)) ||
        (it.score && curr.score && it.score > curr.score)
      ) {
        return acc.concat(it);
      }
    }, []);
  }

  buildModelUrl(model) {
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

  createRecognizer() {
    const recognizers = this.getHelperModelUrls().map(modelUrl => new builder.LuisRecognizer(modelUrl));
    console.log('EntityRecognizer.createRecognizer', recognizers);
    const recognizerSet = new builder.IntentRecognizerSet({
      recognizers
    });
    return recognizerSet;
  }

  getHelperModelUrls() {
    const modelIds = this.agent.get('helperModels');
    if (!isEmpty(modelIds)) {
      return modelIds.map(modelId => this.buildModelUrl(model));
    }
    return [];
  }

  recognize(text) {
    const context = { message: { text } };
    this.createRecognizer().recognize(context, (err, result) => {
      console.log('EntityRecognizer.recognize', err, result);
    })
  }
}

module.exports = EntityResolver;