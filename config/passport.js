import passport from "passport";
import { Strategy } from "passport-local";
import bcrypt from "bcrypt";
import db from "../db/index.js";

passport.use(
  new Strategy({ usernameField: "email" }, async function verify(
    email,
    password,
    cb
  ) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [
        email,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        bcrypt.compare(password, user.password, (err, valid) => {
          if (err) return cb(err);
          if (valid) {
            return cb(null, user);
          } else {
            return cb(null, false, { message: "Incorrect email or password" });
          }
        });
      } else {
        return cb(null, false, { message: "Incorrect email or password" });
      }
    } catch (err) {
      return cb(err);
    }
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user.id);
});

passport.deserializeUser(async (id, cb) => {
  try {
    const user = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    if (!user.rows[0]) return cb(null, false);
    cb(null, user.rows[0]);
  } catch (err) {
    cb(err);
  }
});

export default passport;
