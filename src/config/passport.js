import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { verifyOrCreateUser } from "../services/Oauth.service.js";

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
        const user = await verifyOrCreateUser(profile, "google", accessToken);
        return done(null, user);
      } catch (error) {
        console.error("Error verify: ", error);
        return done(error, null);
      }
    },
  ),
);
