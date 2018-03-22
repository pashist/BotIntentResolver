const log = require('debug')('RESOLVER:BOTAUTH');
const botauth = require('botauth');
const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;

require('dotenv-extended').load({ path: '../.env' });

class BotAuth {
  constructor({ server, bot }) {
    log('create instance');
    this.ba = new botauth.BotAuthenticator(server, bot, {
      baseUrl : process.env.WEBSITE_HOSTNAME || `https://${process.env.BotId}.azurewebsites.net`,
      secret : 'some@sec'
    });
    this.init();
  }

  init() {
    this.addFacebookAuth();
  }

  addFacebookAuth() {
    log('add facebook strategy');
    this.ba.provider("facebook", (options) => {
      return new FacebookStrategy({
        clientID : process.env.FACEBOOK_APP_ID,
        clientSecret : process.env.FACEBOOK_APP_SECRET,
        callbackURL : options.callbackURL
      }, (accessToken, refreshToken, profile, done) => {
        profile = profile || {};
        profile.accessToken = accessToken;
        profile.refreshToken = refreshToken;
        return done(null, profile);
      });
    });
  }

  authenticate(provider) {
    return this.ba.authenticate(provider);
  }

  profile(session, provider) {
    return this.ba.profile(session, provider);
  }
}

module.exports = BotAuth;