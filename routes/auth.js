import express from "express";
import passport from "../config/passport.js";
import db from "../db/index.js";
import bcrypt from "bcrypt";
import { body, validationResult } from "express-validator";
import sharp from "sharp";
import upload from "../middleware/upload.js";

const router = express.Router();

// Log In

router.get("/login", async (req, res) => {
  try {
    const categories = await db.query(`SELECT * FROM categories`);
    const errorMessage = req.flash("error");
    res.render("login.ejs", { categories: categories.rows, errorMessage });
  } catch (err) {
    console.log(err);
  }
});

router.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true,
  })
);

// Register

const saltRounds = 10;

router.get("/register", async (req, res) => {
  try {
    const categories = await db.query("SELECT * FROM categories");
    res.render("register.ejs", { categories: categories.rows });
  } catch (err) {
    console.log(err);
  }
});

router.post(
  "/register",
  [
    body("email").isEmail().withMessage("Enter a valid email."),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters."),
    body("first_name").notEmpty().withMessage("First name is required."),
    body("last_name").notEmpty().withMessage("Last name is required."),
  ],
  upload.single("profile_picture"),
  async (req, res) => {
    const categories = await db.query("SELECT * FROM categories");
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.render("register.ejs", {
        errors: errors.array(),
        error: null,
        categories: categories.rows,
      });
    }

    try {
      const { first_name, last_name, mobile_number, email, password } =
        req.body;

      const existing = await db.query("SELECT * FROM users WHERE email = $1", [
        email,
      ]);
      if (existing.rows.length > 0) {
        return res.render("register.ejs", {
          errors: [],
          error: "Email address already in use",
          categories: categories.rows,
        });
      }

      let profilePictureBuffer = null;
      if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
          return res.render("register.ejs", {
            errors: [],
            error: "Invalid file type. Please upload images only.",
            categories: categories.rows,
          });
        }

        profilePictureBuffer = await sharp(req.file.buffer)
          .webp({ quality: 75 })
          .toBuffer();
      }

      const hash = await bcrypt.hash(password, saltRounds);

      const result = await db.query(
        `INSERT INTO users (first_name, last_name, email, password, mobile_number, profile_picture)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          first_name,
          last_name,
          email,
          hash,
          mobile_number,
          profilePictureBuffer,
        ]
      );

      const user = result.rows[0];

      req.login(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          return res.status(500).send("Login failed");
        }
        res.redirect("/");
      });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).send("Something went wrong");
    }
  }
);

// Log Out

router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

export default router;
