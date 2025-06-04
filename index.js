import express from "express";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";
import flash from "connect-flash";
import sharp from "sharp";
import connectPgSimple from 'connect-pg-simple';

const pgSession = connectPgSimple(session);
const app = express();
const port = 3000;
const saltRounds = 10;
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});
env.config();

// Database connection
const db = new pg.Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

// Middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true
    },
    store: new pgSession({
      pool: db,
      createTableIfMissing: true
    })
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Routes

// app.get("/", async (req, res) => {
//   console.log(req.user);
//   try {
//     const categories = await db.query("SELECT * FROM categories");
//     const products = await db.query("SELECT * FROM products");
//     res.render("index.ejs", {
//       categories: categories.rows,
//       products: products.rows,
//       user: req.user,
//     });
//   } catch (err) {
//     console.log(err);
//   }
// });

app.get("/", async (req, res) => {
  try {
    const categories = await db.query("SELECT * FROM categories");

    const data = {
      categories: categories.rows,
    };

    if (req.isAuthenticated()) {
      data.userId = req.user.id;
      data.userName = `${req.user.first_name} ${req.user.last_name}`;
    }

    res.render("home.ejs", data);
  } catch (err) {
    console.log(err);
    res.status(500).send("Internal server error");
  }
});


app.get("/login", async (req, res) => {
  try {
    const categories = await db.query(`SELECT * FROM categories`);
    const errorMessage = req.flash("error");
    res.render("login.ejs", { categories: categories.rows, errorMessage });
  } catch (err) {
    console.log(err);
  }
});

app.get("/category/:categoryId", async (req, res) => {
  const categoryId = req.params.categoryId;
  try {
    const categories = await db.query(`SELECT * FROM categories`);
    const categoryName = await db.query(`SELECT name FROM categories WHERE id = $1`, [categoryId]);
    const categoryNonSoldProducts = await db.query(`SELECT * FROM products WHERE category_id = $1 AND sold = false`, [categoryId]);
    const products = categoryNonSoldProducts.rows
    res.render("products.ejs", { categories: categories.rows, categoryName: categoryName.rows[0].name, nonSoldProducts: products, categoryId });
  } catch (err) {
    console.log(err);
  }
});

app.get("/sold-category/:categoryId", async (req, res) => {
  const categoryId = req.params.categoryId;
  try {
    const categories = await db.query(`SELECT * FROM categories`);
    const categoryName = await db.query(`SELECT name FROM categories WHERE id = $1`, [categoryId]);
    const categorySoldProducts = await db.query(`SELECT * FROM products WHERE category_id = $1 AND sold = true`, [categoryId]);
    const products = categorySoldProducts.rows
    res.render("soldProducts.ejs", { categories: categories.rows, categoryName: categoryName.rows[0].name, soldProducts: products, categoryId });
  } catch (err) {
    console.log(err);
  }
});

app.get("/category/:categoryId/product/:productId", async (req, res) => {
  const categoryId = req.params.categoryId;
  const productId = req.params.productId;
  try {
    const categories = await db.query(`SELECT * FROM categories`);
    const categoryName = await db.query(`SELECT name FROM categories WHERE id = $1`, [categoryId]);
    const targetedProduct = await db.query(`SELECT * FROM products WHERE id = $1`, [productId]);
    const product = targetedProduct.rows
    res.render("productDetails.ejs", { categories: categories.rows, categoryName: categoryName.rows[0].name, product, categoryId });
  } catch (err) {
    console.log(err);
  }
});

app.get("/category", (req, res) => {
    res.redirect("/");
});

app.get("/sold-category", (req, res) => {
    res.redirect("/");
});

app.get("/post", async (req, res) => {
  if (req.isAuthenticated()) {
      try {
    const categories = await db.query("SELECT * FROM categories");
    res.render("post.ejs", { userId: req.user.id, userName: req.user.first_name + " " + req.user.last_name, categories: categories.rows });
  } catch (err) {
    console.log(err);
  }}
  else {
    res.redirect("/login");
  }
});

app.get("/register", async (req, res) => {
  try {
    const categories = await db.query("SELECT * FROM categories");
    res.render("register.ejs", { categories: categories.rows });
  } catch (err) {
    console.log(err);
  }
});

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

app.get("/profile/:id/profile-picture", async (req, res) => {
  const userId = req.params.id;

  try {
    const result = await db.query("SELECT profile_picture FROM users WHERE id = $1", [userId]);
    if (result.rows.length === 0) return res.status(404).send("User not found");

    const image = result.rows[0].profile_picture;

    if (!image) {
      const defaultImagePath = path.resolve("public/default-profile.png");
      if (fs.existsSync(defaultImagePath)) {
        res.set("Content-Type", "image/webp");
        return res.sendFile(defaultImagePath);
      } else {
        return res.status(500).send("Default image not found");
      }
    }

    res.set("Content-Type", "image/webp");
    res.send(image);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading image");
  }
});

app.get("/image/:id/:slot", async (req, res) => {
  const { id, slot } = req.params;
  if (!["image1", "image2", "image3"].includes(slot)) {
    return res.status(400).send("Invalid image slot");
  }

  try {
    const result = await db.query(`SELECT ${slot} FROM products WHERE id = $1`, [id]);
    const image = result.rows[0]?.[slot];

    if (!image) {
      return res.status(204).send();
    }

    res.set("Content-Type", "image/webp");
    res.send(image);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error retrieving image");
  }
});




app.get("/submit", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("profile.ejs");
  } else {
    res.redirect("/");
  }
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true,
  })
);

app.post("/register", upload.single("profile_picture"), async (req, res) => {
  try {
    const { first_name, last_name, mobile_number, email, password } = req.body;
    const existing = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    const categories = await db.query("SELECT * FROM categories");

    if (existing.rows.length > 0) {
      return res.render("register.ejs", {
        error: "Email address already in use",
        categories: categories.rows,
      });
    }

    let profilePictureBuffer = null;
    if (req.file) {
      profilePictureBuffer = await sharp(req.file.buffer).webp({ quality: 75 }).toBuffer();
    }

    const hash = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      `INSERT INTO users (first_name, last_name, email, password, mobile_number, profile_picture)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [first_name, last_name, email, hash, mobile_number, profilePictureBuffer]
    );

    const user = result.rows[0];
    req.login(user, (err) => {
      if (err) return res.status(500).send("Login failed");
      res.redirect("/");
    });
  } catch (err) {
    if (err.message === "Only image files are allowed!") {
      const categories = await db.query("SELECT * FROM categories");
      return res.render("register.ejs", {
        error: "Invalid file type. Please upload images only.",
        categories: categories.rows,
      });
    }
    console.error(err);
    res.status(500).send("Something went wrong");
  }
});


app.post(
  "/submit",
  upload.fields([
    { name: "photo1", maxCount: 1 },
    { name: "photo2", maxCount: 1 },
    { name: "photo3", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { title, description, category, price, user_id } = req.body;

      const processImage = async (file) => {
        if (!file) return null;
        return await sharp(file.buffer).webp({ quality: 75 }).toBuffer();
      };

      const image1 = await processImage(req.files.photo1?.[0]);
      const image2 = await processImage(req.files.photo2?.[0]);
      const image3 = await processImage(req.files.photo3?.[0]);

      const result = await db.query(
        `INSERT INTO products (owner_id, name, category_id, description, minimum_price, image1, image2, image3)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [Number(user_id), title, Number(category), description, Number(price), image1, image2, image3]
      );

      res.redirect("/");
    } catch (err) {
      if (err.message === "Only image files are allowed!") {
        return res.status(400).send("Invalid file type. Please upload images only.");
      }
      console.error("Error submitting product:", err);
      res.status(500).send("Internal server error");
    }
  }
);


passport.use(
  new Strategy({ usernameField: "email" }, async function verify(email, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
