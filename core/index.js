const _ = require('lodash');
const util = require('util');
const log = require('debug')('RESOLVER:CORE');
const builder = require('botbuilder');
const inspector = require('schema-inspector');
const Promise = require('bluebird');
const BuiltInTypes = require('./builtin');
const EntityResolver = require('./EntityResolver');
const Recognizer = require('./Recognizer');
const agent = require('./Agent');

const entityResolver = new EntityResolver({agent});
const recognizer = new Recognizer({agent});

var Status = {
  NoActionRecognized: 'NoActionRecognized',
  Fulfilled: 'Fulfilled',
  MissingParameters: 'MissingParameters',
  ContextSwitch: 'ContextSwitch'
};

/*
 * API
 */
module.exports = {
  Status: Status,
  BuiltInTypes: BuiltInTypes,
  evaluate: evaluate,
  bindToBotDialog: bindToBotDialog
};

var EmptyActionModel = {
  status: Status.NoActionRecognized,
  intentName: null,
  result: null,
  userInput: null,
  currentParameter: null,
  parameters: {},
  parameterErrors: []
};

function evaluate(session, actions, currentActionModel, userInput, onContextCreationHandler) {
  log('evaluate action');

  actions.forEach(validateAction);

  onContextCreationHandler = validateContextCreationHandler(onContextCreationHandler);

  return new Promise(function (resolve, reject) {
    log('fill action model');
    var actionModel = _.merge({}, EmptyActionModel, currentActionModel);

    if (actionModel.status === Status.ContextSwitch) {
      // confirming switch context
      if (actionModel.confirmSwitch) {
        // re-write current model
        actionModel.intentName = actionModel.contextSwitchData.intentName;
        actionModel.parameters = actionModel.contextSwitchData.parameters;
      }

      // force continue with validation
      actionModel.contextSwitchData = null;
      actionModel.currentParameter = null;
      actionModel.userInput = null;
    }

    // normalize input
    actionModel.userInput = userInput ? userInput.trim() : null;

    // cleanup from previous runs
    delete actionModel.subcontextResult;
    log('action model is:', actionModel);
    switch (actionModel.status) {
      case Status.NoActionRecognized:
        // First time input, resolve to action
        log('recognize user input', actionModel.userInput);
        recognizer.recognize(actionModel.userInput).then(({intents, entities}) => {
          log('recognize success');
          var action = chooseBestIntentAction(intents, actions);
          if (action) {
            // Populate action parameters with LUIS entities
            log('Populate action parameters with LUIS entities');
            actionModel.intentName = action.intentName;
            // Contextual action? Populate with root action
            if (action.parentAction && !actionModel.contextModel) {
              popupateContextParent(actionModel, action, actions);
            }

            // extract parameters from entities
            actionModel.parameters = extractParametersFromEntities(action.schema, entities);

            var next = function () {
              // Run validation
              tryExecute(session, action, actionModel)
                .then(resolve)
                .catch(reject);
            };

            if (action.parentAction) {
              // Invoke custom onContextCreationHandler, may inject more parameters to contextModel (the parent's actionModel)
              // Wait for onContextCreation handler's callback to continue execution
              onContextCreationHandler(action.parentAction, actionModel.contextModel, next);
            } else {
              next();
            }

          } else {
            // No action recognized
            log('No action recognized');
            actionModel.status = Status.NoActionRecognized;
            resolve(actionModel);
          }
        }).catch(err => {
          log('recognize error %s', err);
          return reject(err);
        });
        break;

      case Status.MissingParameters:
      case Status.ContextSwitch:
        log('find action for intent from action model');
        var action = _.find(actions, function (action) { return actionModel.intentName === action.intentName; });

        if (actionModel.userInput) {
          // Filling for a missing parameter
          log('user input exists');
          log('call entity resolver');
          entityResolver.recognizeFromInput(actionModel.userInput).then(foundEntities => {
            if (!_.isEmpty(foundEntities)) {
              const parameters = extractParametersFromEntities(action.schema, foundEntities, actionModel);
              actionModel.parameters = _.merge({}, actionModel.parameters, parameters);
              tryExecute(session, action, actionModel).then(resolve).catch(reject);
            } else {
              log('no entities resolved, call main recognizer');
              recognizer.recognize(actionModel.userInput).then(({ intents, entities }) => {
                log('recognized intents:', intents);
                log('recognized entities:', entities);
                var newAction = chooseBestIntentAction(intents, actions, action);

                if (newAction && newAction.intentName !== action.intentName) {
                  log('new action is different from current');
                  if (isGetterAction(newAction)) {

                  } else if (newAction.parentAction === action) {
                    // context action (sub action), replace action & model and continue
                    actionModel = _.merge({}, EmptyActionModel, {
                      contextModel: actionModel,
                      intentName: newAction.intentName
                    });
                    actionModel.parameters = [];
                    action = newAction;

                  } else if (equalsTrue(action.confirmOnContextSwitch, true)) {
                    log('change action model to switch to new action');
                    // new context switch
                    actionModel.status = Status.ContextSwitch;
                    actionModel.contextSwitchData = {
                      intentName: newAction.intentName,
                      parameters: extractParametersFromEntities(newAction.schema, entities)
                    };

                    // prompt
                    var currentActionName = action.friendlyName || action.intentName;
                    var newActionName = newAction.friendlyName || newAction.intentName;
                    actionModel.contextSwitchPrompt = util.format('Do you want to discard the current action \'%s\' and start the with \'%s\' action?', currentActionName, newActionName);

                    // return and wait for context switch confirmation
                    log('return and wait for context switch confirmation');
                    return resolve(actionModel);

                  } else {
                    log('switch to new context and continue with evaluation');
                    // switch to new context and continue with evaluation
                    action = newAction;
                    actionModel.intentName = newAction.intentName;
                    actionModel.currentParameter = null;
                  }
                }
                const parameters = extractParametersFromEntities(action.schema, entities, actionModel);

                // merge new identified parameters from entites
                log('merge new identified parameters from entites');
                actionModel.parameters = _.merge({}, actionModel.parameters, parameters);

                // Run validation
                tryExecute(session, action, actionModel)
                  .then(resolve)
                  .catch(reject);
              }).catch(err => {
                log('recognize error %s', err);
                return reject(err);
              });
            }
          });
        } else {
          // Run validation with current model
          tryExecute(session, action, actionModel)
            .then(resolve)
            .catch(reject);
        }
        break;

      default:
        reject('Unknown action.status "' + actionModel.status + '"');
    }
  });
}

/*
 * Bot Stuff
 */
function bindToBotDialog(bot, intentDialog, actions, options) {
  log('binding actions to bot dialog');
  if (!bot) {
    throw new Error('bot is required');
  }
  if (!intentDialog) {
    throw new Error('intentDialog is required');
  }

  // if (!modelUrl) {
  //   throw new Error('ModelUrl is required');
  // }

  options = options || {};

  // enable bot persistence (used for storing actionModel in privateConversationData)
  bot.set('persistConversationData', true);

  // register dialog for handling input evaluation
  bot.library(createBotLibrary(actions, options));

  // Register each LuisActions with the intentDialog
  log('register actions');
  _.forEach(actions, function (action) {
    try {
      intentDialog.matches(action.intentName, createBotAction(action, options.botAuth));
    } catch (e) {
      //
    }

  });
}

function createBotLibrary(actions, options) {
  var defaultReplyHandler = typeof options.defaultReply === 'function' ? options.defaultReply : function (session) { session.endDialog('Sorry, I couldn\'t understart that.'); };
  var fulfillReplyHandler = typeof options.fulfillReply === 'function' ? options.fulfillReply : function (session, actionModel) { session.endDialog(actionModel.result.toString()); };
  var onContextCreationHandler = validateContextCreationHandler(options.onContextCreation);

  var lib = new builder.Library('LuisActions');
  lib.dialog('Evaluate', new builder.SimpleDialog(function (session, args) {
    log('start new conversation');
    console.log('args', args)
    console.log('session', session.user)
    var actionModel = null;
    var action = null;
    if (args && args.intents) {
      log('recognized intents:', args.intents);
      // Coming from a matched intent
      action = chooseBestIntentAction(args.intents, actions);
      if (!action) {
        log('no action found');
        return defaultReplyHandler(session);
      }
      log('initialize empty action model');
      actionModel = _.merge({}, EmptyActionModel, {
        intentName: action.intentName
      });

      // Contextual action? Populate with root action
      if (action.parentAction && !actionModel.contextModel) {
        popupateContextParent(actionModel, action, actions);
      }

      // Extract parameters from entities/luisresult
      actionModel.parameters = extractParametersFromEntities(action.schema, args.entities);

      if (action.parentAction) {
        // Invoke custom onContextCreationHandler, may inject more parameters to contextModel (the parent's actionModel)
        // Wait for onContextCreation handler's callback to continue execution
        return onContextCreationHandler(action.parentAction, actionModel.contextModel, next, session);
      }
    } else {
      actionModel = session.privateConversationData['luisaction.model'];
    }

    next();

    function next() {
      log('call dialog next function');
      if (!actionModel) {
        log('no action model exists');
        return defaultReplyHandler(session);
      }
      log('find action by intent name from action model');
      action = actions.find(a => a.intentName === actionModel.intentName);

      if (!action) {
        log('no action found');
        return defaultReplyHandler(session);
      }

      log('choosing operation');
      var operation = null;

      if (actionModel.status === Status.ContextSwitch && args.response === true) {
        // confirming context switch
        log('switch context confirmed');
        actionModel.confirmSwitch = true;
        operation = evaluate(session, actions, actionModel);
      } else if (args && args.response && actionModel.currentParameter) {
        // try evaluate new parameter
        log('try evaluate new parameter');
        operation = evaluate(session, actions, actionModel, args.response);
      } else {
        log('try validate with current parameters');
        // try validate with current parameters
        operation = tryExecute(session, action, actionModel);
      }

      log('executing async operation');
      operation.then(actionModel => {

        session.privateConversationData['luisaction.model'] = actionModel;

        if (actionModel.subcontextResult) {
          session.send(actionModel.subcontextResult.toString());
        }
        log('action model status is %s', actionModel.status);
        switch (actionModel.status) {
          case Status.MissingParameters:
            // Prompt for first missing parameter
            var errors = actionModel.parameterErrors;
            var firstError = _.first(errors);
            log('set current parameter %s', firstError.parameterName);
            // set current parameter name to help recognizer which parameter to match
            actionModel.currentParameter = firstError.parameterName;
            session.privateConversationData['luisaction.model'] = actionModel;
            log('prompt user for parameter %s', actionModel.currentParameter);
            console.log(firstError.message);
            builder.Prompts.text(session, firstError.message);
            break;

          case Status.ContextSwitch:
            // Prompt for context switch
            var prompt = actionModel.contextSwitchPrompt;
            session.privateConversationData['luisaction.model'] = actionModel;
            log('prompt user for switching to other intent: %s', prompt);
            builder.Prompts.confirm(session, prompt, { listStyle: builder.ListStyle.button });
            break;

          case Status.Fulfilled:
            // Action fulfilled
            // TODO: Allow external handler
            delete session.privateConversationData['luisaction.model'];
            log('handle action fulfilled');
            fulfillReplyHandler(session, actionModel);
            break;

        }
      }).catch((err) => {
        // error ocurred
        console.log(err);
        log('handle dialog error %s', err);
        session.endDialog('Error: %s', err);
      });
    }
  }));

  return lib;
}

function createBotAction(action, botAuth) {
  validateAction(action);

  // trigger evaluation dialog

  let initialArgs = {};
  const first = (session, dialogArgs, next) => {
    initialArgs = Object.assign({}, dialogArgs);
    next(dialogArgs);
  };
  const main = (session, dialogArgs) =>
    session.beginDialog('LuisActions:Evaluate', Object.assign(dialogArgs, initialArgs));



  if (action.authRequired) {
    return [].concat(first, botAuth.authenticate("facebook"), main);
  }
  return main;
}

/*
 * Helpers
 */
function chooseBestIntentAction(intents, actions, currentAction) {
  log('choose best intent action');
  var intent = _.maxBy(intents, function (intent) { return intent.score; });
  var action = _.find(actions, function (action) { return intent && intent.intent === action.intentName; });

  // ignore context actions that do not belong to current action
  if (action && currentAction && action.parentAction && action.parentAction !== currentAction) {
    return null;
  }

  // ignore context action that do not allow execution without context
  if (action && action.parentAction && (!equalsTrue(action.canExecuteWithoutContext, true) && action.parentAction !== currentAction)) {
    return null;
  }

  if (currentAction && intent.score < 0.5) {
    log('intent score %s - ignored', intent.score);
    return null;
  }
  if (intent.intent === 'None') {
    log('None intent - ignored');
    return null;
  }
  log('action selected:', action.intentName);
  return action;
}

function extractParametersFromEntities(schema, entities, actionModel) {
  log('extracting parameters from entities', entities);
  // when evaluating a specific parameter, try matching it by its custom type, then name and finally builin type
  if (actionModel && actionModel.currentParameter && schema[actionModel.currentParameter]) {
    var currentParameterSchema = schema[actionModel.currentParameter];
    var entity = null;

    // find by custom attrib
    if (currentParameterSchema.customType) {
      entity = entities.find(e => e.type === currentParameterSchema.customType);
    }

    // find by name
    if (!entity) {
      entity = entities.find(e => e.type === actionModel.currentParameter);
    }

    // find by builtin
    if (!entity && currentParameterSchema.builtInType) {
      entity = entities.find(e => e.type === currentParameterSchema.builtInType);
    }

    // if no entity recognized then try to assign user's input
    if (!entity) {
      log('no entity recognized - assign user\'s input:', actionModel.userInput);
      entity = { entity: actionModel.userInput };
    }

    entity = _.merge({}, entity, { type: actionModel.currentParameter });
    entities = entities.concat([entity]);
  }

  // resolve complete parameters from entities
  entities = crossMatchEntities(entities);

  // merge entities into parameters obj
  var parameters = _.reduce(entities, function (merged, entity) {
    merged[entity.type] = entity.entity;
    return merged;
  }, {});

  // validate and remove those parameters marked as invalid
  var schemaObject = wrap(schema);
  inspector.sanitize(schemaObject, parameters);
  var result = inspector.validate(schemaObject, parameters);
  if (!result.valid) {
    var invalidParameterNames = result.error.map(getParameterName);
    parameters = _.omit(parameters, invalidParameterNames);
  }
  log('resolved params:', parameters);
  return parameters;
}

function tryExecute(session, action, actionModel) {
  log('trying to validate and execute action');
  return new Promise(function (resolve, reject) {
    try {
      validate(action.schema, actionModel.parameters,
        (parameters, errors) => {
          log('params missing or invalid:', actionModel.parameters);
          actionModel.status = Status.MissingParameters;
          actionModel.parameters = parameters;
          actionModel.parameterErrors = errors;
          resolve(actionModel);
        },
        (completeParameters) => {
          log('all params resolved');
          // fulfill and return response to callback
          var parentContext = actionModel.contextModel;
          action.fulfill(completeParameters, session, (fulfillResult) => {
            actionModel.status = Status.Fulfilled;
            actionModel.result = fulfillResult;
            actionModel.parameters = completeParameters;
            actionModel.parameterErrors = [];

            if (actionModel.contextModel) {
              // switch back to context dialog
              actionModel.contextModel.subcontextResult = actionModel.result;
              actionModel = actionModel.contextModel;

              tryExecute(session, action.parentAction, actionModel)
                .then(resolve)
                .catch(reject);
            } else {
              resolve(actionModel);
            }

          }, parentContext ? parentContext.parameters : {});
        });
    } catch (err) {
      reject(err);
    }
  });
}

function validate(schema, parameters, onValidationErrors, onValidationPass) {
  log('validate action schema');
  var schemaObject = wrap(schema);
  inspector.sanitize(schemaObject, parameters);
  var result = inspector.validate(schemaObject, parameters);
  if (result.valid) {
    onValidationPass(parameters);
  } else {
    var errors = result.error.map(function (fieldError) {
      var parameterName = getParameterName(fieldError);
      var errorMessage = schema[parameterName].message;

      return {
        parameterName: parameterName,
        message: errorMessage
      };
    });

    onValidationErrors(parameters, errors);
  }
}

function popupateContextParent(actionModel, currentAction) {
  if (!currentAction.parentAction) {
    return actionModel;
  }

  actionModel.contextModel = _.merge({}, EmptyActionModel, {
    intentName: currentAction.parentAction.intentName,
    status: Status.MissingParameters
  });

  actionModel.parameters = {};
  actionModel.parameterErrors = [];
  actionModel.result = null;

  return actionModel;
}

function crossMatchEntities(entities) {
  // Group detected entities by origin input
  var groups = _.groupBy(entities, function (entity) {
    return entity.entity;
  });

  var result = [];
  _.forOwn(groups, function (matches, entity) {
    if (matches.length > 1) {
      var entityTarget = matches.find((e) => e.type.indexOf('builtin.') === -1);
      var entityWithValue = matches.find((e) => e.resolution);
      if (entityWithValue) {
        var resolution = entityWithValue.resolution;
        entityTarget.entity = resolution[_.keys(resolution)[0]];
      }

      if (entityTarget) {
        result.push(entityTarget);
      }
    } else {
      result.push(matches[0]);
    }
  });

  return result;
}

function getParameterName(fieldError) {
  return fieldError.property.replace(/[\[\]"@]/g, '').replace(/^\./, '');
  //return _.last(fieldError.property.split('.'));
}

function wrap(propertiesSchema) {
  return {
    type: 'object',
    properties: propertiesSchema
  };
}

function equalsTrue(value, valueForUndefined) {
  if (value === undefined || value === null) {
    return valueForUndefined === true;
  }

  return value === true;
}

function validateContextCreationHandler(callback) {
  return typeof callback === 'function'
    ? callback
    : function (action, actionModel, next) { next(); };
}

function validateAction(action) {
  log('validate action %s', action.intentName);
  if (typeof action.intentName !== 'string') {
    throw new Error('actionModel.intentName requires a string');
  }

  if (typeof action.friendlyName !== 'string') {
    throw new Error('actionModel.friendlyName requires a string');
  }

  if (typeof action.schema !== 'object') {
    throw new Error('actionModel.schema requires a schema of properties');
  }

  if (typeof action.fulfill !== 'function') {
    throw new Error('actionModel.fulfill should be a function');
  }
}

function isGetterAction(action) {
  return !!_.get(action, 'intentName', '').match(/^get/);
}