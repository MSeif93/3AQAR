import express from "express";
import session from "express-session";
import env from "dotenv";
import path from "path";
import flash from "connect-flash";
import connectPgSimple from "connect-pg-simple";
import methodOverride from "method-override";
import helmet from "helmet";
import csurf from "csurf";
import passport from "./config/passport.js";
import db from "./db/index.js";
import homeRoute from "./routes/home.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import categoryRoutes from "./routes/categories.js";
import productRoutes from "./routes/products.js";
import multer from "multer";
import morgan from "morgan";

env.config();
const app = express();
const pgSession = connectPgSimple(session);

app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

db.connect();

// app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(helmet());
app.use(express.static(path.join(process.cwd(), "public")));
app.use(
  methodOverride((req, res) => {
    if (req.body && typeof req.body === "object" && "_method" in req.body) {
      return req.body._method;
    }
    if (req.query && "_method" in req.query) {
      return req.query._method;
    }
  })
);
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    },
    store: new pgSession({
      pool: db,
      createTableIfMissing: true,
    }),
  })
);
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use(csurf());
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  })
);

const port = 3000;

// Routes

app.use("/", [
  homeRoute,
  authRoutes,
  userRoutes,
  categoryRoutes,
  productRoutes,
]);

// Error Handling

app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    return res.status(403).send("Invalid CSRF token");
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).send(`Upload Error: ${err.message}`);
  }

  if (err.message === "Only image files are allowed!") {
    return res
      .status(400)
      .send("Invalid file type. Only image files are allowed.");
  }
  if (err.status === 404) {
    return res.status(404).send("Not Found");
  }
  console.error(err);
  res.status(500).send("Something went wrong");
});

// Running Port

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
