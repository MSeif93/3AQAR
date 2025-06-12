import express from "express";
import db from "../db/index.js";
import path from "path";
import fs from "fs";

const router = express.Router();

router.get("/profile/:profileId", async (req, res) => {
  const profileId = req.params.profileId;
  try {
    const profileResult = await db.query("SELECT * FROM users WHERE id = $1", [
      profileId,
    ]);
    if (profileResult.rows.length === 0) {
      return res.status(404).send("Profile not found");
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

router.get("/profile/:id/profile-picture", async (req, res) => {
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

export default router;
