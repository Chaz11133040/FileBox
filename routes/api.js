const express = require('express');
const router = express.Router();
const auth = require('../auth.js');
const path = require('path');
const fs = require('fs');
const seven = require('7zip-min'); // Assuming 7zip-min is used for compression

const uploadsFolder = path.join(__dirname, '../uploads');
const compressionProgress = {};

// Helper function to ensure user directory exists
function ensureUserDir(username) {
    const userDir = path.join(uploadsFolder, username);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir);
    }
    return userDir;
}

// User login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const token = auth.generateAccessToken(username, password);

    if (!token) {
        return res.sendStatus(403);
    }

    res.json({ authToken: token });
});

// User logout
router.get('/logout', auth.authenticateToken, (req, res) => {
    res.clearCookie('token');
    res.sendStatus(200);
});

// Fetch list of files for the logged-in user
router.get('/files', auth.authenticateToken, (req, res) => {
    const userDir = ensureUserDir(req.user.username);
    fs.readdir(userDir, (err, files) => {
        if (err) {
            return res.status(500).send('Unable to scan files in directory.');
        }
        res.json(files);
    });
});

// Upload a file (only for normal users)
router.post('/upload', auth.authenticateToken, (req, res) => {
    if (req.user.admin) {
        return res.sendStatus(403);  // Admins cannot upload files
    }

    if (!req.files || !req.files.uploadFile) {
        return res.status(400).send('No files were uploaded.');
    }

    const userDir = ensureUserDir(req.user.username);
    const file = req.files.uploadFile;
    const uploadPath = path.join(userDir, file.name);

    file.mv(uploadPath, (err) => {
        if (err) {
            return res.status(500).send(err.message);
        }
        startCompression(uploadPath, req.user.username);
        res.status(200).send('File uploaded, compression started.');
    });
});

// Delete a file (accessible to both normal users and admins)
router.delete('/delete/:fileName', auth.authenticateToken, (req, res) => {
    const filePath = path.join(uploadsFolder, req.user.username, req.params.fileName);

    if (req.user.admin) {
        // If admin, verify file exists and delete
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                return res.status(404).send('File not found.');
            }

            fs.unlink(filePath, (err) => {
                if (err) {
                    return res.status(500).send('Unable to delete file.');
                }
                res.status(200).send('File deleted.');
            });
        });
    } else {
        // If normal user, allow deletion of user's own files
        fs.unlink(filePath, (err) => {
            if (err) {
                return res.status(500).send('Unable to delete file.');
            }
            res.status(200).send('File deleted.');
        });
    }
});

// Fetch list of files for a specific user or all users (admins only)
router.get('/admin/files/:user?', auth.authenticateToken, (req, res) => {
    if (!req.user.admin) {
        return res.sendStatus(403);
    }

    const userDir = req.params.user ? path.join(uploadsFolder, req.params.user) : uploadsFolder;

    fs.readdir(userDir, (err, files) => {
        if (err) {
            return res.status(500).send('Unable to scan directories.');
        }

        if (req.params.user) {
            // If specific user is requested, list files in that user's directory
            res.json(files.map(file => ({ userDir: req.params.user, file })));
        } else {
            // If no specific user, list all files for all users
            const allFiles = [];
            let directoriesProcessed = 0;
            const totalDirectories = files.length;

            if (totalDirectories === 0) {
                return res.json(allFiles);
            }

            files.forEach(userDir => {
                const fullDir = path.join(uploadsFolder, userDir);
                fs.readdir(fullDir, (err, userFiles) => {
                    if (err) {
                        console.error(`Error reading directory ${fullDir}:`, err);
                    } else {
                        userFiles.forEach(file => {
                            allFiles.push({ userDir, file });
                        });
                    }

                    if (++directoriesProcessed === totalDirectories) {
                        res.json(allFiles);
                    }
                });
            });
        }
    });
});

// Download a file (accessible to both normal users and admins)
router.get('/download/:fileName', auth.authenticateToken, (req, res) => {
    const filePath = path.join(uploadsFolder, req.user.username, req.params.fileName);

    if (req.user.admin) {
        // If admin, allow download from any user's directory
        const requestedFilePath = path.join(uploadsFolder, req.query.user || req.user.username, req.params.fileName);
        fs.access(requestedFilePath, fs.constants.F_OK, (err) => {
            if (err) {
                return res.status(404).send('File not found.');
            }

            res.download(requestedFilePath);
        });
    } else {
        // If normal user, allow download of their own files
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                return res.status(404).send('File not found.');
            }

            res.download(filePath);
        });
    }
});

// Start compression
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

module.exports = router;
