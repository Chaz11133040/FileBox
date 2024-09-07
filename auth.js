const jwt = require("jsonwebtoken");

// Simple hard-coded username and password for demonstration
const users = {
   alice: {
      password: "password",
      admin: false, // Normal user
   },
   bob: {
      password: "password",
      admin: false, // Normal user
   },
   admin: {
      password: "admin",
      admin: true, // Admin user
   },
};

// Authentication secret (could be stored securely in a secrets manager)
const tokenSecret =
   "e9aae26be08551392be664d620fb422350a30349899fc254a0f37bfa1b945e36ff20d25b12025e1067f9b69e8b8f2ef0f767f6fff6279e5755668bf4bae88588";

// Create a token with username and role (admin or not)
const generateAccessToken = (username, password) => {
   console.log("Login attempt", username, password);
   const user = users[username];

   if (!user || password !== user.password) {
      console.log("Unsuccessful login by user", username);
      return false;
   }

   const userData = { 
      username: username,
      admin: user.admin // Store the admin flag in the token
   };

   console.log("Successful login by user", username);

   return jwt.sign(userData, tokenSecret, { expiresIn: "30m" });
};

// Middleware to authenticate the cookie token and add user info to request
const authenticateCookie = (req, res, next) => {
   console.log(req.cookies);
   const token = req.cookies.token;

   if (!token) {
      console.log("Cookie auth token missing.");
      return res.redirect("/login");
   }

   try {
      const user = jwt.verify(token, tokenSecret);
      console.log(`Cookie token verified for user: ${user.username} at URL ${req.url}`);

      // Add user info to request
      req.user = user;
      next();
   } catch (err) {
      console.log(`JWT verification failed at URL ${req.url}`, err.name, err.message);
      return res.redirect("/login");
   }
};

// Middleware to check if the user is an admin
const authenticateAdmin = (req, res, next) => {
   if (req.user && req.user.admin) {
      return next(); // If user is admin, allow access
   }
   console.log("Admin access required.");
   return res.status(403).send("Access denied.");
};

// Middleware to authenticate the token from Authorization header
const authenticateToken = (req, res, next) => {
   const authHeader = req.headers["authorization"];
   const token = authHeader && authHeader.split(" ")[1];

   if (!token) {
      console.log("JSON web token missing.");
      return res.sendStatus(401);
   }

   try {
      const user = jwt.verify(token, tokenSecret);
      console.log(`authToken verified for user: ${user.username} at URL ${req.url}`);

      req.user = user;
      next();
   } catch (err) {
      console.log(`JWT verification failed at URL ${req.url}`, err.name, err.message);
      return res.sendStatus(401);
   }
};

module.exports = { generateAccessToken, authenticateCookie, authenticateAdmin, authenticateToken };
