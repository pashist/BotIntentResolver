const builder = require('botbuilder');
const isEmpty = require('lodash/isEmpty');
const get = require('lodash/get');
const maxBy = require('lodash/maxBy');
const minBy = require('lodash/maxBy');
const sample = require('lodash/sample');

require('dotenv-extended').load({ path: '../.env' });

class ResponsePicker {
  constructor({agent, intentName, parameters}) {
    this.agent = agent;
    this.intentName = intentName || '';
    this.parameters = parameters || {};
  }

  pick() {
    const responses = this.getResponses()
      .map(response => this.fillParameters(response));
    console.log('ResponsePicker.pick', responses);
    const bestMatches = this.findBestMatch(responses);

    return get(sample(bestMatches), 'result');
  }

  findBestMatch(responses) {
    const minMissCount = get(minBy(responses, r => r.missCount), 'missCount', 0);
    let result = responses.filter(response => response.missCount === minMissCount);
    const maxFillCount = get(maxBy(result, r => r.fillCount), 'fillCount', 0);
    return result.filter(response => response.fillCount === maxFillCount);
  }

  fillParameters(response = '') {
    const params = this.composeParameters();
    let result = response;
    let count = 0;
    Object.keys(params).forEach(key => {
      const re = new RegExp(`\\$${key}\\b`);
      result = result.replace(re, () => {
        count++;
        return params[key]
      });
    });
    return {
      result,
      fillCount: count,
      missCount: get(result.match(/\$\S+/g), 'length', 0),
    }
  }

  getParamNameByEntity(entity, def) {
    const param = this.getIntentParameters().find(param => param.dataType === entity);
    return param ? param.name : def;
  }

  getResponses() {
    return get(this.getIntent(), ['responses'], [])
      .reduce((acc, curr) => acc.concat(curr.speech), []);
  }

  getIntent() {
    return this.agent.get('intents').find(item => item.name === this.intentName);
  }

  getIntentParameters() {
    return get(this.getIntent(), 'parameters', []);
  }

  composeParameters() {
    const result = {};
    const params = this.getIntentParameters();
    params.forEach(param => {
      result[param.name] = param.value;
    });
    Object.keys(this.parameters).forEach(key => {
      const paramName = this.getParamNameByEntity(key);
      if (paramName) {
        result[paramName] = this.parameters[key];
      }
    });
    return result;
  }
}

module.exports = ResponsePicker;