import express from "express";
import db from "../db/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
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

export default router;
