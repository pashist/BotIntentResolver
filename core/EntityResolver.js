const builder = require('botbuilder');
const isEmpty = require('lodash/isEmpty');

require('dotenv-extended').load({ path: '../.env' });

class EntityResolver {
  constructor({agent}) {
    this.agent = agent;
  }
  async recognizeFromInput(input) {
    const modelIds = this.agent.get('helperModelIds');
    if (!isEmpty(modelIds)) {
      const promises = modelIds.map(modelId => {
        const modelUrl = this.buildModelUrl(modelId);
        return new Promise(resolve => {
          console.log('EntityRecognizer.recognizeFromInput.....................', input, modelUrl);
          builder.LuisRecognizer.recognize(input, modelUrl, (error, intents, entities) => {
            if (error) {
              resolve({error});
            }
            resolve({entities})
          });
        });
      });
      const results = await Promise.all(promises);
      console.log('EntityRecognizer.recognizeFromInput......................', results);
      const entities = results.reduce((acc, result) => result.error ? acc : acc.concat(result.entities), []);
      return this.getTopScoredEntities(entities);
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
  buildModelUrl(modelId) {
    const key = this.agent.get('deployKey');
    return `https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/${modelId}?subscription-key=${key}&timezoneOffset=0&verbose=true&q=`;
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
    const modelIds = this.agent.get('helperModelIds');
    if (!isEmpty(modelIds)) {
      return modelIds.map(modelId => this.buildModelUrl(modelId));
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