require('dotenv-extended').load({ path: './.env' });

const builder = require('botbuilder');
const restify = require('restify');

const LuisActions = require('./core');
const { buildActions } = require('./actions');

const LuisModelUrl = process.env.LUIS_MODEL_URL;

const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
  console.log('%s listening to %s', server.name, server.url);
});

const connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});
server.post('/api/messages', connector.listen());

const bot = new builder.UniversalBot(connector);
const recognizer = new builder.LuisRecognizer(LuisModelUrl);
const intentDialog = bot
  .dialog('/', new builder.IntentDialog({ recognizers: [recognizer] })
  .onDefault(DefaultReplyHandler));

bot.dialog('reloadActions', (session, args, next) => {
  session.send('Loading actions...');
  initActions().then(msg => session.endDialog(msg));
}).triggerAction({
  matches: /^reload actions$/i,
  onSelectAction: (session, args, next) => {
    // Add the help dialog to the top of the dialog stack
    // (override the default behavior of replacing the stack)
    session.beginDialog(args.action, args);
  }
});

function initActions() {
  console.log('loading actions...');
  return buildActions()
    .then(actions => {
      const num = actions.reduce((count, a) => count + Object.keys(a.schema).length, 0);
      console.log('actions loaded:', num);
      LuisActions.bindToBotDialog(bot, intentDialog, LuisModelUrl, actions, {
        defaultReply: DefaultReplyHandler,
        fulfillReply: FulfillReplyHandler,
        onContextCreation: onContextCreationHandler
      });
      return `Loaded ${num} actions`;
    })
    .catch(err => {
      console.log('actions loading failed:', err.message);
      return err.message;
    });
}

function DefaultReplyHandler(session) {
  session.endDialog(
    'Sorry, I did not understand "%s".',
    session.message.text);
}

function FulfillReplyHandler(session, actionModel) {
  console.log('Action Binding "' + actionModel.intentName + '" completed:', actionModel);
  session.endDialog(actionModel.result.toString());
}

function onContextCreationHandler(action, actionModel, next, session) {

  // Here you can implement a callback to hydrate the actionModel as per request

  // For example:
  // If your action is related with a 'Booking' intent, then you could do something like:
  // BookingSystem.Hydrate(action) - hydrate action context already stored within some repository
  // (ex. using a booking ref that you can get from the context somehow)

  // To simply showcase the idea, here we are setting the checkin/checkout dates for 1 night
  // when the user starts a contextual intent related with the 'FindHotelsAction'

  // So if you simply write 'Change location to Madrid' the main action will have required parameters already set up
  // and you can get the user information for any purpose

  // The session object is available to read from conversationData or
  // you could identify the user if the session.message.user.id is somehow mapped to a userId in your domain

  // NOTE: Remember to call next() to continue executing the action binding's logic

  if (action.intentName === 'FindHotels') {
    if (!actionModel.parameters.Checkin) {
      actionModel.parameters.Checkin = new Date();
    }

    if (!actionModel.parameters.Checkout) {
      actionModel.parameters.Checkout = new Date();
      actionModel.parameters.Checkout.setDate(actionModel.parameters.Checkout.getDate() + 1);
    }
  }

  next();
}

initActions();