CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  mobile_number TEXT,
  profile_picture BYTEA
);

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id),
  name TEXT,
  category_id INTEGER REFERENCES categories(id),
  description TEXT,
  minimum_price MONEY,
  image1 BYTEA,
  image2 BYTEA,
  image3 BYTEA,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sold BOOLEAN DEFAULT FALSE
);

-- Function to update the timestamp --
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to invoke the function before any row update --
CREATE TRIGGER trg_update_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();


CREATE TABLE bids (
  product_id INTEGER REFERENCES products(id),
  bidder_id INTEGER REFERENCES users(id),
  bid MONEY NOT NULL,
  bid_time TIMESTAMP,
  PRIMARY KEY (product_id, bidder_id)
);

-- Function to update bid_time on update --
CREATE OR REPLACE FUNCTION update_bid_time()
RETURNS TRIGGER AS $$
BEGIN
  NEW.bid_time = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger that calls the function before any row update --
CREATE TRIGGER trg_update_bid_time
BEFORE UPDATE ON bids
FOR EACH ROW
EXECUTE FUNCTION update_bid_time();

CREATE TABLE sell_off (
  product_id INTEGER UNIQUE REFERENCES products(id),
  buyer_id INTEGER REFERENCES users(id),
  final_price MONEY NOT NULL,
  sold_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
