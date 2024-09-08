const express = require("express");
const cookieParser = require("cookie-parser");
const fileUpload = require("express-fileupload");
const path = require("path");
const webclientRoutes = require("./routes/webclient");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and URL-encoded form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Use cookie parser middleware
app.use(cookieParser());

// Middleware to handle file uploads (express-fileupload)
app.use(fileUpload());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

// Serve static files from the uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Set routes
app.use("/", webclientRoutes); // Web client routes

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
