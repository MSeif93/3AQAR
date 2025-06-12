import express from "express";
import db from "../db/index.js";

const router = express.Router();

router.get("/category/:categoryId", async (req, res) => {
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

    const data = {
      categoryId,
      categories: categories.rows,
      categoryName: categoryName.rows[0]?.name || "Unknown Category",
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

router.get("/category", (req, res) => {
  res.redirect("/");
});

export default router;
