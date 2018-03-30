const log = require('debug')('RESOLVER:BOTAUTH');
const botauth = require('botauth');
const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;
const AzureAdStrategy = require('passport-azure-ad-oauth2');
const OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
const jwt = require('jsonwebtoken');

function composeProfile(id_token, profile) {
  const decoded = jwt.decode(id_token);
  return Object.assign({
    provider: 'azure_ad_oauth2',
    id: decoded.upn,
    name: {
      givenName: decoded.given_name,
      familyName: decoded.family_name,
      middleName: null,
    },
    displayName: decoded.name,
  }, profile)
}

require('dotenv-extended').load({ path: '../.env' });

class BotAuth {
  constructor({ server, bot }) {
    log('create instance');
    this.ba = new botauth.BotAuthenticator(server, bot, {
      baseUrl: process.env.WEBSITE_URL || `https://${process.env.WEBSITE_HOSTNAME}`,
      secret: process.env.BOTAUTH_SECRET
    });
    this.init();
  }

  init() {
    // this.addFacebookAuth();
    // this.addAADAuth();
    this.addAADV2();
  }

  addFacebookAuth() {
    log('add facebook strategy');
    this.ba.provider("facebook", (options) => {
      return new FacebookStrategy({
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: options.callbackURL
      }, (accessToken, refreshToken, profile, done) => {
        profile = profile || {};
        profile.accessToken = accessToken;
        profile.refreshToken = refreshToken;
        return done(null, profile);
      });
    });
  }

  addAADAuth() {
    log('add azure ad strategy');
    this.ba.provider("azure_ad_oauth2", (options) => {
      return new AzureAdStrategy({
          clientID: process.env.AAD_APP_ID,
          clientSecret: process.env.AAD_SECRET,
          callbackURL: options.callbackURL,
          resource: '00000003-0000-0000-c000-000000000000',
          useCommonEndpoint: true,
          authorizationURL: 'https://login.windows.net/common/oauth2/authorize'
          //passReqToCallback: true,
        },
        (accessToken, refreshToken, params, profile, done) => {
          profile.accessToken = accessToken;
          profile.refreshToken = refreshToken;
          done(null, composeProfile(params.id_token, profile));
        });
    });
  }

  addAADV2() {
    this.ba.provider("aadv2", (options) => {
      // Use the v2 endpoint (applications configured by apps.dev.microsoft.com)
      // For passport-azure-ad v2.0.0, had to set realm = 'common' to ensure authbot works on azure app service
      const oauthConfig = {
        redirectUrl: options.callbackURL, //  redirect: /botauth/aadv2/callback
        realm: 'common',
        clientID: process.env.AADV2_APP_ID,
        clientSecret: process.env.AADV2_APP_PASSWORD,
        identityMetadata: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
        skipUserProfile: false,
        validateIssuer: false,
        //allowHttpForRedirectUrl: true,
        responseType: 'code',
        responseMode: 'query',
        scope: ['email', 'profile', 'offline_access', 'https://outlook.office.com/Calendars.ReadWrite'],
        passReqToCallback: true
      };

      return new OIDCStrategy(oauthConfig,
        (req, iss, sub, profile, accessToken, refreshToken, done) => {
          if (!profile.displayName) {
            return done(new Error("No oid found"), null);
          }
          profile.accessToken = accessToken;
          profile.refreshToken = refreshToken;
          done(null, profile);
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