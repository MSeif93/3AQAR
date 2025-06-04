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
import connectPgSimple from "connect-pg-simple";
import methodOverride from "method-override";

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

// Middlewares

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
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
app.use(methodOverride("_method"));

// Get Routes

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

app.get("/register", async (req, res) => {
  try {
    const categories = await db.query("SELECT * FROM categories");
    res.render("register.ejs", { categories: categories.rows });
  } catch (err) {
    console.log(err);
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

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

app.get("/category/:categoryId", async (req, res) => {
  const categoryId = req.params.categoryId;
  const soldFlag = req.query.sold === "true";

  try {
    const categoriesQuery = `SELECT * FROM categories`;
    const categoryNameQuery = `SELECT name FROM categories WHERE id = $1`;
    const productsQuery = `SELECT * FROM products WHERE category_id = $1 AND sold = $2`;

    const [categories, categoryName, result] = await Promise.all([
      db.query(categoriesQuery),
      db.query(categoryNameQuery, [categoryId]),
      db.query(productsQuery, [categoryId, soldFlag]),
    ]);

    const data = {
      categoryId,
      categories: categories.rows,
      categoryName: categoryName.rows[0]?.name || "Unknown Category",
      products: result.rows,
      isSoldView: soldFlag,
    };

    if (req.isAuthenticated()) {
      data.userId = req.user.id;
      data.userName = `${req.user.first_name} ${req.user.last_name}`;
    }

    res.render("products.ejs", data);
  } catch (err) {
    console.error("Error loading category:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/category", (req, res) => {
  res.redirect("/");
});

app.get("/product/:productId", async (req, res) => {
  const { productId } = req.params;

  try {
    const [categoriesResult, productResult] = await Promise.all([
      db.query(`SELECT * FROM categories`),
      db.query(
        `
        SELECT p.*, c.name AS category_name
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE p.id = $1
      `,
        [productId]
      ),
    ]);

    const product = productResult.rows[0];

    if (!product) {
      return res.status(404).send("Product not found");
    }

    const data = {
      product,
      categoryId: product.category_id,
      categoryName: product.category_name,
      categories: categoriesResult.rows,
      bids: [],
      isOwner: false,
    };

    if (req.isAuthenticated()) {
      const userId = req.user.id;
      data.userId = userId;
      data.userName = `${req.user.first_name} ${req.user.last_name}`;
      data.isOwner = userId === product.owner_id;

      if (data.isOwner) {
        const bidsResult = await db.query(
          `
          SELECT b.*, u.first_name || ' ' || u.last_name AS username, u.profile_picture
          FROM bids b
          JOIN users u ON b.bidder_id = u.id
          WHERE b.product_id = $1
          ORDER BY b.bid DESC
        `,
          [productId]
        );

        data.bids = bidsResult.rows;
      }
    }

    res.render("productDetails.ejs", data);
  } catch (err) {
    console.error("Error fetching product details:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/product", (req, res) => {
  res.redirect("/");
});

app.get("/post", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      const categories = await db.query("SELECT * FROM categories");
      res.render("post.ejs", {
        userId: req.user.id,
        userName: req.user.first_name + " " + req.user.last_name,
        categories: categories.rows,
      });
    } catch (err) {
      console.log(err);
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/product/:productId/edit", async (req, res) => {
  const { productId } = req.params;
  const userId = req.user?.id;
  const userName = req.user
    ? `${req.user.first_name} ${req.user.last_name}`
    : null;

  try {
    const productResult = await db.query(
      "SELECT * FROM products WHERE id = $1",
      [productId]
    );
    const product = productResult.rows[0];
    if (!product) {
      return res.status(404).send("Product not found");
    }

    if (product.owner_id !== userId) {
      return res.status(403).send("Not authorized to edit this product");
    }

    const categoriesResult = await db.query(
      "SELECT * FROM categories ORDER BY name"
    );
    const categories = categoriesResult.rows;

    res.render("post.ejs", {
      product,
      categories,
      userId,
      userName,
    });
  } catch (error) {
    console.error("Error fetching product for edit:", error);
    res.status(500).send("Internal server error");
  }
});

app.get("/profile/:id/profile-picture", async (req, res) => {
  const userId = req.params.id;

  try {
    const result = await db.query(
      "SELECT profile_picture FROM users WHERE id = $1",
      [userId]
    );
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
    const result = await db.query(
      `SELECT ${slot} FROM products WHERE id = $1`,
      [id]
    );
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

// Post Routes

app.post("/register", upload.single("profile_picture"), async (req, res) => {
  try {
    const { first_name, last_name, mobile_number, email, password } = req.body;
    const existing = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const categories = await db.query("SELECT * FROM categories");

    if (existing.rows.length > 0) {
      return res.render("register.ejs", {
        error: "Email address already in use",
        categories: categories.rows,
      });
    }

    let profilePictureBuffer = null;
    if (req.file) {
      profilePictureBuffer = await sharp(req.file.buffer)
        .webp({ quality: 75 })
        .toBuffer();
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
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true,
  })
);

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
        [
          Number(user_id),
          title,
          Number(category),
          description,
          Number(price),
          image1,
          image2,
          image3,
        ]
      );

      res.redirect("/product/" + result.rows[0].id);
    } catch (err) {
      if (err.message === "Only image files are allowed!") {
        return res
          .status(400)
          .send("Invalid file type. Please upload images only.");
      }
      console.error("Error submitting product:", err);
      res.status(500).send("Internal server error");
    }
  }
);

app.post("/product/:productId/bid", async (req, res) => {
  const { productId } = req.params;
  const userId = req.user?.id;
  const bidAmount = parseFloat(req.body.bid);

  if (!userId) {
    return res
      .status(401)
      .json({ message: "You must be logged in to place a bid." });
  }

  if (isNaN(bidAmount) || bidAmount <= 0) {
    return res.status(400).json({ message: "Invalid bid amount." });
  }

  try {
    const productResult = await db.query(
      "SELECT * FROM products WHERE id = $1",
      [productId]
    );
    const product = productResult.rows[0];

    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    if (product.sold) {
      return res
        .status(400)
        .json({ message: "This product has already been sold." });
    }

    if (bidAmount < parseFloat(product.minimum_price)) {
      return res
        .status(400)
        .json({ message: `Bid must be at least ${product.minimum_price}.` });
    }

    if (product.owner_id === userId) {
      return res
        .status(403)
        .json({ message: "You cannot bid on your own product." });
    }

    await db.query(
      `
      INSERT INTO bids (product_id, bidder_id, bid)
      VALUES ($1, $2, $3)
      ON CONFLICT (product_id, bidder_id)
      DO UPDATE SET bid = EXCLUDED.bid, bid_time = CURRENT_TIMESTAMP
    `,
      [productId, userId, bidAmount]
    );

    res.json({ message: "Bid submitted successfully." });
  } catch (error) {
    console.error("Error submitting bid:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.post("/accept-bid", async (req, res) => {
  const { productId, bidderId } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const productRes = await db.query(`SELECT * FROM products WHERE id = $1`, [
      productId,
    ]);

    const product = productRes.rows[0];

    if (!product) {
      return res.status(404).send("Product not found");
    }

    if (product.owner_id !== userId) {
      return res.status(403).send("Forbidden: You are not the owner");
    }

    if (product.sold) {
      return res.status(400).send("Product already sold");
    }

    const bidRes = await db.query(
      `SELECT * FROM bids WHERE product_id = $1 AND bidder_id = $2`,
      [productId, bidderId]
    );

    const bid = bidRes.rows[0];

    if (!bid) {
      return res.status(404).send("Bid not found");
    }

    await db.query(
      `UPDATE products SET sold = TRUE, updated_at = NOW() WHERE id = $1`,
      [productId]
    );

    await db.query(
      `INSERT INTO sell_off (product_id, buyer_id, final_price, sold_at) VALUES ($1, $2, $3, NOW())`,
      [productId, bidderId, bid.bid]
    );

    await db.query(`DELETE FROM bids WHERE product_id = $1`, [productId]);

    res.redirect(`/product/${productId}?message=bid_accepted`);
  } catch (err) {
    console.error("Error accepting bid:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Patch Routes

app.patch(
  "/product/:productId/edit",
  upload.fields([
    { name: "photo1", maxCount: 1 },
    { name: "photo2", maxCount: 1 },
    { name: "photo3", maxCount: 1 },
  ]),
  async (req, res) => {
    const { productId } = req.params;
    const { title, description, category, price, user_id } = req.body;

    try {
      const productResult = await db.query(
        `SELECT owner_id FROM products WHERE id = $1`,
        [productId]
      );
      const product = productResult.rows[0];
      if (!product) {
        return res.status(404).send("Product not found");
      }
      if (product.owner_id !== Number(user_id)) {
        return res.status(403).send("Not authorized to edit this product");
      }

      const processImage = async (file) => {
        if (!file) return null;
        return await sharp(file.buffer).webp({ quality: 75 }).toBuffer();
      };

      const image1 = await processImage(req.files.photo1?.[0]);
      const image2 = await processImage(req.files.photo2?.[0]);
      const image3 = await processImage(req.files.photo3?.[0]);

      let updateImageQuery = "";
      const updateValues = [
        title,
        Number(category),
        description,
        Number(price),
      ];
      let paramIndex = 4;

      if (image1) {
        paramIndex++;
        updateImageQuery += `, image1 = $${paramIndex}`;
        updateValues.push(image1);
      }
      if (image2) {
        paramIndex++;
        updateImageQuery += `, image2 = $${paramIndex}`;
        updateValues.push(image2);
      }
      if (image3) {
        paramIndex++;
        updateImageQuery += `, image3 = $${paramIndex}`;
        updateValues.push(image3);
      }

      paramIndex++;
      updateValues.push(productId);

      const updateQuery = `
        UPDATE products SET
          name = $1,
          category_id = $2,
          description = $3,
          minimum_price = $4
          ${updateImageQuery}
        WHERE id = $${paramIndex}
      `;

      await db.query(updateQuery, updateValues);

      res.redirect(`/product/${productId}`);
    } catch (err) {
      if (err.message === "Only image files are allowed!") {
        return res
          .status(400)
          .send("Invalid file type. Please upload images only.");
      }
      console.error("Error updating product:", err);
      res.status(500).send("Internal server error");
    }
  }
);

// Passport Configurations

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

// Running Port

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
