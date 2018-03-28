require('dotenv-extended').load({ path: './.env' });

const builder = require('botbuilder');
const restify = require('restify');
const restifyClients = require('restify-clients');

const log = require('debug')('RESOLVER:APP');
const LuisActions = require('./core');
const ActionsBuilder = require('./core/ActionsBuilder');
const Recognizer = require('./core/Recognizer');
const BotAuth = require('./core/BotAuth');
const agent =  require('./core/Agent');

log('creating server');
const server = restify.createServer();
server.use(restify.plugins.bodyParser());
server.use(restify.plugins.queryParser());

log('starting %s server', server.name);
server.listen(process.env.port || process.env.PORT || 3978, function () {
  log('%s listening to %s', server.name, server.url);
  init().then(() => log('bot initialized')).catch(err => log(err));
});

const connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID || process.env.MicrosoftAppId,
  appPassword: process.env.MICROSOFT_APP_PASSWORD || process.env.MicrosoftAppPassword
});
server.post('/api/messages', connector.listen());

async function init() {
  log('initializing bot');
  const bot = new builder.UniversalBot(connector);
  const botAuth = new BotAuth({ server, bot });
  const actionsBuilder = new ActionsBuilder({ agent, botAuth });
  const recognizer = new Recognizer({ agent });
  await agent.load();
  const intentDialog = bot
    .dialog('/', new builder.IntentDialog({
      recognizers: [recognizer.getRecognizer([Recognizer.TYPE_MAIN, Recognizer.TYPE_HELPER])]
    })
      .onDefault(DefaultReplyHandler)
      .onBegin((session, args, next) => {
        //session.send(JSON.stringify(session.message.user));
        next();
      })
    );

  const initActions = () => {
    log('initializing actions');
    return actionsBuilder.build()
      .then(actions => {
        const num = actions.reduce((count, a) => count + Object.keys(a.schema).length, 0);
        log('actions loaded:', num);
        LuisActions.bindToBotDialog(bot, intentDialog, actions, {
          defaultReply: DefaultReplyHandler,
          fulfillReply: FulfillReplyHandler,
          onContextCreation: onContextCreationHandler,
          botAuth,
        });
        return `Loaded ${num} actions`;
      })
      .catch(err => {
        log('actions initializing failed:', err);
        return err.message;
      });
  };
  initActions();
  log('add `reloadActions` dialog')
  bot.dialog('reloadActions', (session, args, next) => {
    session.send('Loading actions...');
    agent.load(true).then(() => {
      initActions().then(msg => session.endDialog(msg));
    })
  }).triggerAction({
    matches: /^reload bot$/i,
    onSelectAction: (session, args, next) => {
      // Add the help dialog to the top of the dialog stack
      // (override the default behavior of replacing the stack)
      session.beginDialog(args.action, args);
    }
  });
  log('`reloadActions` dialog added');

  bot.on('error', err => {
    console.log(err);
    log('bot error: %s', err.message);
  })
}


function DefaultReplyHandler(session) {
  log('call DefaultReplyHandler');
  session.endDialog(
    'Sorry, I did not understand "%s".',
    session.message.text);
}

function FulfillReplyHandler(session, actionModel) {
  log('call FulfillReplyHandler');
  log('Action Binding "' + actionModel.intentName + '" completed:'/*, actionModel*/);
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
  //
  // if (action.intentName === 'FindHotels') {
  //   if (!actionModel.parameters.Checkin) {
  //     actionModel.parameters.Checkin = new Date();
  //   }
  //
  //   if (!actionModel.parameters.Checkout) {
  //     actionModel.parameters.Checkout = new Date();
  //     actionModel.parameters.Checkout.setDate(actionModel.parameters.Checkout.getDate() + 1);
  //   }
  // }

  next();
}
