import passport from "passport";
import Google from "passport-google-oauth20";
import Facebook from "passport-facebook";
import { verifyOrCreateUser } from "../services/Oauth.service.js";
const GoogleStrategy = Google.Strategy;
const FacebookStrategy = Facebook.Strategy;

// config Google
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log(profile);
        const user = await verifyOrCreateUser(profile, "google", accessToken);
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    },
  ),
);

// config Facebook
passport.use(new FacebookStrategy({}));
