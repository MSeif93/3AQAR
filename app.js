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

const app = express();
const pgSession = connectPgSimple(session);

const port = process.env.PORT || 3000;
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
  connectionString: process.env.DATABASE_URL,
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
app.use(express.static("public"));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());
// app.use((req, res, next) => {
//   console.log(`${req.method} ${req.url}`);
//   next();
// });

// Get Routes

app.get("/", async (req, res) => {
  try {
    const categories = await db.query("SELECT * FROM categories");

    const data = {
      categories: categories.rows,
      userId: req.isAuthenticated() ? req.user.id : null,
      userName: req.isAuthenticated()
        ? `${req.user.first_name} ${req.user.last_name}`
        : null,
    };

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

app.get("/profile/:profileId", async (req, res) => {
  const profileId = req.params.profileId;
  try {
    const profileResult = await db.query("SELECT * FROM users WHERE id = $1", [
      profileId,
    ]);
    if (profileResult.rows.length === 0) {
      return res
        .status(404)
        .render("not-found.ejs", { message: "Profile not found" });
    }
    const profile = profileResult.rows[0];
    const categories = await db.query("SELECT * FROM categories");
    const soldProducts = await db.query(
      "SELECT * FROM products WHERE owner_id = $1 AND sold = TRUE ORDER BY id ASC",
      [profileId]
    );
    const unsoldProducts = await db.query(
      "SELECT * FROM products WHERE owner_id = $1 AND sold = FALSE ORDER BY id ASC",
      [profileId]
    );
    const buyedProducts = await db.query(
      `
      SELECT products.*
      FROM sell_off
      INNER JOIN products ON sell_off.product_id = products.id
      WHERE sell_off.buyer_id = $1
      ORDER BY products.id ASC
    `,
      [profileId]
    );

    const unbuyedProducts = await db.query(
      `
      SELECT products.*
      FROM bids
      INNER JOIN products ON bids.product_id = products.id
      WHERE bids.bidder_id = $1
      ORDER BY products.id ASC
    `,
      [profileId]
    );

    const data = {
      profileId,
      profileName: `${profile.first_name} ${profile.last_name}`,
      profileEmail: profile.email,
      profileMobile: profile.mobile_number || "N/A",
      categories: categories.rows,
      soldProducts: soldProducts.rows,
      unsoldProducts: unsoldProducts.rows,
      buyedProducts: buyedProducts.rows,
      unbuyedProducts: unbuyedProducts.rows,
      isOwner: req.isAuthenticated() && req.user.id === parseInt(profileId),
      userId: req.isAuthenticated() ? req.user.id : null,
      userName: req.isAuthenticated()
        ? `${req.user.first_name} ${req.user.last_name}`
        : null,
    };

    res.render("profile.ejs", data);
  } catch (err) {
    console.log(err);
    res.status(500).send("Internal server error");
  }
});

app.get("/category/:categoryId", async (req, res) => {
  const categoryId = req.params.categoryId;
  const soldFlag = req.query.sold === "true";
  const limit = 9;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;

  try {
    const categoriesQuery = `SELECT * FROM categories`;
    const categoryNameQuery = `SELECT name FROM categories WHERE id = $1`;
    const productsQuery = `
      SELECT * FROM products 
      WHERE category_id = $1 AND sold = $2 
      ORDER BY id ASC 
      LIMIT $3 OFFSET $4
    `;
    const countQuery = `
      SELECT COUNT(*) FROM products 
      WHERE category_id = $1 AND sold = $2
    `;

    const [categories, categoryName, productsResult, countResult] =
      await Promise.all([
        db.query(categoriesQuery),
        db.query(categoryNameQuery, [categoryId]),
        db.query(productsQuery, [categoryId, soldFlag, limit, offset]),
        db.query(countQuery, [categoryId, soldFlag]),
      ]);

    const totalProducts = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalProducts / limit);

    if (!categoryName.rows[0]) {
      return res
        .status(404)
        .render("not-found.ejs", { message: "Category not found" });
    }

    const data = {
      categoryId,
      categories: categories.rows,
      categoryName: categoryName.rows[0].name,
      products: productsResult.rows,
      isSoldView: soldFlag,
      currentPage: page,
      totalPages,
      userId: req.isAuthenticated() ? req.user.id : null,
      userName: req.isAuthenticated()
        ? `${req.user.first_name} ${req.user.last_name}`
        : null,
    };

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
    const [categoriesResult, productResult, ownerResult, buyerResult] =
      await Promise.all([
        db.query(`SELECT * FROM categories`),
        db.query(
          `
        SELECT products.*, categories.name AS category_name
        FROM products
        INNER JOIN categories ON products.category_id = categories.id
        WHERE products.id = $1
      `,
          [productId]
        ),
        db.query(
          `
        SELECT users.id, users.first_name, users.last_name
        FROM users
        INNER JOIN products ON products.owner_id = users.id
        WHERE products.id = $1
      `,
          [productId]
        ),
        db.query(
          `
        SELECT users.id, users.first_name, users.last_name, sell_off.final_price, sell_off.sold_at
        FROM users
        INNER JOIN sell_off ON sell_off.buyer_id = users.id
        WHERE sell_off.product_id = $1
      `,
          [productId]
        ),
      ]);

    const product = productResult.rows[0];
    const owner = ownerResult.rows[0];
    const buyer = buyerResult.rows[0];

    if (!product) {
      return res
        .status(404)
        .render("not-found.ejs", { message: "Product not found" });
    }

    const data = {
      product,
      categoryId: product.category_id,
      categoryName: product.category_name,
      categories: categoriesResult.rows,
      ownerId: owner.id,
      ownerName: `${owner.first_name} ${owner.last_name}`,
      bids: [],
      isOwner: false,
      isBidder: false,
    };

    if (buyer) {
      data.buyerId = buyer.id;
      data.buyerName = `${buyer.first_name} ${buyer.last_name}`;
      data.finalPrice = buyer.final_price;
      data.soldAt = buyer.sold_at;
    }

    if (req.isAuthenticated()) {
      const userId = req.user.id;
      data.userId = userId;
      data.userName = `${req.user.first_name} ${req.user.last_name}`;
      data.isOwner = userId === product.owner_id;
      const theBid = await db.query(
        `SELECT * FROM bids WHERE product_id = $1 AND bidder_id = $2`,
        [productId, userId]
      );

      if (theBid.rows.length > 0) {
        data.isBidder = true;
        data.userBidPrice = theBid.rows[0].bid;
        data.userBidTime = theBid.rows[0].bid_time;
      } else if (data.isOwner) {
        const bidsResult = await db.query(
          `
          SELECT 
          bids.*,
          users.first_name || ' ' || users.last_name AS username
          FROM bids
          JOIN users ON bids.bidder_id = users.id
          WHERE bids.product_id = $1
          ORDER BY bids.bid DESC
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

    if (bidAmount < parseFloat(product.minimum_price.replace(/[$,]/g, ""))) {
      return res.status(400).json({
        message: `Bid must be at least ${parseFloat(
          product.minimum_price.replace(/[$,]/g, "")
        )}.`,
      });
    }

    if (product.owner_id === userId) {
      return res
        .status(403)
        .json({ message: "You cannot bid on your own product." });
    }

    await db.query(
      `
      INSERT INTO bids (product_id, bidder_id, bid, bid_time)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (product_id, bidder_id)
      DO UPDATE SET bid = EXCLUDED.bid, bid_time = EXCLUDED.bid_time
    `,
      [productId, userId, bidAmount]
    );

    res.json({ message: "Bid submitted successfully." });
  } catch (error) {
    console.error("Error submitting bid:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});

app.post("/product/:productId/accept-bid", async (req, res) => {
  const { productId } = req.params;
  const { bidderId } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).send("Unauthorized");
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const productRes = await client.query(
      `SELECT * FROM products WHERE id = $1`,
      [productId]
    );

    const product = productRes.rows[0];

    if (!product) {
      await client.query("ROLLBACK");
      return res.status(404).send("Product not found");
    }

    if (product.owner_id !== userId) {
      await client.query("ROLLBACK");
      return res.status(403).send("Forbidden: You are not the owner");
    }

    if (product.sold) {
      await client.query("ROLLBACK");
      return res.status(400).send("Product already sold");
    }

    const bidRes = await client.query(
      `SELECT * FROM bids WHERE product_id = $1 AND bidder_id = $2`,
      [productId, bidderId]
    );

    const bid = bidRes.rows[0];

    if (!bid) {
      await client.query("ROLLBACK");
      return res.status(404).send("Bid not found");
    }

    await client.query(`UPDATE products SET sold = TRUE WHERE id = $1`, [
      productId,
    ]);

    await client.query(
      `INSERT INTO sell_off (product_id, buyer_id, final_price)
       VALUES ($1, $2, $3)`,
      [productId, bidderId, bid.bid]
    );

    await client.query(`DELETE FROM bids WHERE product_id = $1`, [productId]);

    await client.query("COMMIT");

    res.redirect(`/product/${productId}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error accepting bid:", err);
    res.status(500).send("Internal Server Error");
  } finally {
    client.release();
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

app.use((req, res, next) => {
  res.status(404).render("not-found.ejs", { message: "Page not found" });
});

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
