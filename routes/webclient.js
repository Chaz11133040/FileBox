const express = require("express");
const router = express.Router();
const auth = require("../auth.js");
const seven = require('7zip-min');
const path = require("path");
const fs = require("fs");




const uploadsFolder = path.join(__dirname, '../uploads');
let compressionProgress = {};

// Authentication routes
router.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/login.html"));
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const token = auth.generateAccessToken(username, password);

  if (!token) {
    return res.sendStatus(403);
  }

  res.cookie("token", token, { httpOnly: true, sameSite: "Strict" });
  res.redirect(username === "admin" ? "/admin" : "/");
});

router.get("/logout", auth.authenticateCookie, (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

router.get("/user-info", auth.authenticateCookie, (req, res) => {
  res.json({
    username: req.user.username,
    userType: req.user.admin ? "admin" : "user",
  });
});

// File management routes
router.get("/files", auth.authenticateCookie, (req, res) => {
  const userDir = path.join(uploadsFolder, req.user.username);
  fs.readdir(userDir, (err, files) => {
    if (err) {
      return res.status(500).send("Unable to scan files in directory.");
    }
    res.json(files);
  });
});

router.post("/upload", auth.authenticateCookie, (req, res) => {
  if (!req.files || !req.files.uploadFile) {
    return res.status(400).send("No files were uploaded.");
  }

  const username = req.user.username;
  const userDir = ensureUserDir(username);
  const file = req.files.uploadFile;
  const uploadPath = path.join(userDir, file.name);

  file.mv(uploadPath, (err) => {
    if (err) {
      return res.status(500).send(err.message);
    }
    startCompression(uploadPath, username);
    res.status(200).send('File uploaded, compression started.');
  });
});

router.delete("/delete/:fileName", auth.authenticateCookie, (req, res) => {
  const filePath = path.join(uploadsFolder, req.user.username, req.params.fileName);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send("File not found.");
    }

    fs.unlink(filePath, (err) => {
      if (err) {
        return res.status(500).send("Unable to delete file.");
      }
      res.status(200).send("File deleted.");
    });
  });
});

router.get("/compression-status", auth.authenticateCookie, (req, res) => {
    const username = req.user.username;
    res.json(compressionProgress[username] || { status: 'not started', progress: 0 });
  });
  

// Admin routes
router.get("/admin", auth.authenticateCookie, (req, res) => {
  if (!req.user.admin) {
    return res.status(403).send("Access denied.");
  }
  res.sendFile(path.join(__dirname, "../public/admin.html"));
});

router.get("/admin/files", auth.authenticateCookie, (req, res) => {
  if (!req.user.admin) {
    return res.status(403).send("Access denied.");
  }

  fs.readdir(uploadsFolder, (err, userDirs) => {
    if (err) {
      return res.status(500).send("Unable to scan directories.");
    }

    const allFiles = [];
    let directoriesProcessed = 0;
    const totalDirectories = userDirs.length;

    if (totalDirectories === 0) {
      return res.json(allFiles);
    }

    userDirs.forEach(userDir => {
      const fullDir = path.join(uploadsFolder, userDir);
      fs.readdir(fullDir, (err, files) => {
        if (err) {
          console.error(`Error reading directory ${fullDir}:`, err);
        } else {
          files.forEach(file => {
            allFiles.push({ userDir, file });
          });
        }

        if (++directoriesProcessed === totalDirectories) {
          res.json(allFiles);
        }
      });
    });
  });
});

router.delete("/admin/delete/:userDir/:fileName", auth.authenticateCookie, (req, res) => {
  if (!req.user.admin) {
    return res.status(403).send("Access denied.");
  }

  const { userDir, fileName } = req.params;
  const filePath = path.join(uploadsFolder, userDir, fileName);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send("File not found.");
    }

    fs.unlink(filePath, (err) => {
      if (err) {
        return res.status(500).send("Unable to delete file.");
      }
      res.status(200).send("File deleted.");
    });
  });
});

// Helper functions
function ensureUserDir(username) {
  const userDir = path.join(uploadsFolder, username);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir);
  }
  return userDir;
}


function startCompression(filePath, username) {
  console.log(`Starting compression for file: ${filePath}`);
  compressionProgress[username] = { status: 'in progress', progress: 0 };

  const compressedFilePath = filePath + '.7z';

  try {
    seven.pack(filePath, compressedFilePath, (err) => {
      if (err) {
        console.error(`Compression error: ${err}`);
        compressionProgress[username] = { status: 'error', progress: 100 };
        return;
      }

      compressionProgress[username] = { status: 'complete', progress: 100 };
      console.log(`Compression complete for file: ${compressedFilePath}`);

      // Optionally delete the original file after compression
      fs.unlink(filePath, (err) => {
        if (err) console.error(`Error deleting original file: ${err}`);
      });
    });
  } catch (error) {
    console.error(`Error starting compression: ${error}`);
    compressionProgress[username] = { status: 'error', progress: 100 };
  }
}


// Serve static files
router.use("/", auth.authenticateCookie, express.static(path.join(__dirname, "../public")));

module.exports = router;