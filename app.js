const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cookie_parser = require("cookie-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const multer = require("multer");
const nodemailer = require("nodemailer");
const html_to_pdf = require("html-pdf-node");
const fs = require("fs");
const path = require("path");
const template1 = require("./email-templates/template-1");
const template2 = require("./email-templates/template-2");
const template3 = require("./email-templates/template-3");
const template4 = require("./email-templates/template-4");
const template5 = require("./email-templates/template-5");

const emailId = process.env.EMAIL_ID || "eravend.gmbh@gmail.com";
const emailPass = process.env.EMAIL_PASS || "nskw qncp ovdt gvzi";
const clientDomain = process.env.CLIENT_DOMAIN || "https://invest.eravend.com";
const serverDomain = process.env.SERVER_DOMAIN || "https://api.invest.eravend.com";
const jwtSecret = process.env.JWT_SECRET || "610880b115c7c221542f135f83e7fee2896e808afca4580ddeb1a783e957d12688855270e85b4a4d2fdcc223f4803fdb831e5b6c616e5d9c549921bc0a33f03d";
const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
const port = process.env.PORT || 5987;

// CORS setup
const corsOptions = {
  origin: process.env.CLIENT_DOMAIN || "https://invest.eravend.com",
  methods: "GET, POST, PUT, DELETE, OPTIONS",
  allowedHeaders: "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookie_parser());
app.use(express.static("files/contracts"));
app.use(express.static("files/submitted"));
app.use(express.static("files/verified"));

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const submittedStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'files/submitted/'),
  filename: (req, file, cb) => cb(null, new ObjectId().toString() + path.extname(file.originalname))
});

const verifiedStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'files/verified/'),
  filename: (req, file, cb) => cb(null, new ObjectId().toString() + path.extname(file.originalname))
});

const submittedPdfUpload = multer({ storage: submittedStorage });
const verifiedPdfUpload = multer({ storage: verifiedStorage });

const transporter = nodemailer.createTransport({
  service: "gmail",
  secure: true,
  port: 465,
  auth: { user: emailId, pass: emailPass }
});

// Generate Password
const generatePassword = length => {
  const allChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}|;:,.<>?';
  let password = Array(length).fill(allChars).map(x => x[Math.floor(Math.random() * x.length)]).join('');
  return password;
}

async function run() {
  try {
    await client.connect();
    const database = client.db("eravend");
    const userCollection = database.collection("users");
    const contractCollection = database.collection("contracts");

    // Create user
    const createUser = async (email) => {
      const password = generatePassword(12);
      const hash = await bcrypt.hash(password, 10);
      const document = {
        email: email,
        password: hash,
        role: "investor"
      }
      await userCollection.insertOne(document);
      return password;
    }

    // Login
    app.post("/api/login", async (req, res) => {
      try {
        const user = await userCollection.findOne({ email: req.body.email });
        if (!user) return res.status(404).json({ message: "User not found" });

        const isMatch = await bcrypt.compare(req.body.password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

        const user2 = {
          _id: user._id,
          email: user.email,
          role: user.role
        }
        const token = jwt.sign({ id: user._id }, jwtSecret, { expiresIn: "7d" });
        res.cookie("token", token, {
          maxAge: 7 * 24 * 60 * 60 * 1000
        }).json({ message: "Logged in successfully", user: user2 });
      } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error", error });
      }
    });

    // Verify Login
    app.get("/api/verify-login", (req, res) => {
      try {
        const token = req.cookies.token;
        if (!token) return res.status(401).json({ message: "Unauthorized" });
        jwt.verify(token, jwtSecret, async (error, user) => {
          if (error) return res.status(403).json({ message: "Forbidden" });
          const user2 = await userCollection.findOne({_id: new ObjectId(user.id)});
          const user3 = {_id: user2._id, email: user2.email, role: user2.role};
          res.json({ message: "Logged in successfully", user: user3 });
        });
      } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error", error });
      }
    });

    // Reset Password
    app.post('/api/forgot-password', async (req, res) => {
      const { email } = req.body;
      try {
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }
    
        const token = jwt.sign({ id: user._id }, jwtSecret, { expiresIn: '1h' });
  
        const mailOptions = {
          from: emailId,
          to: user.email,
          subject: 'Reset Password - EraVend',
          html: `
            <h3>You requested a password reset</h3>
            <p>Click the link below to reset your password</p>
            <a href="${clientDomain}/reset-password/${token}">Reset Password</a>
            <p>This link is valid for one hour.</p>
          `,
        };
    
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Error sending email:', error);
          } else {
            console.log('Email sent:', info.response);
          }
        });
    
        res.status(200).json({ message: 'Password reset link sent to your email' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    app.post('/api/reset-password/:token', async (req, res) => {
      const { token } = req.params;
      const { password } = req.body;
    
      try {
        const decoded = jwt.verify(token, jwtSecret);

        const user = await userCollection.findOne({_id: new ObjectId(decoded.id)});
        if (!user) {
          return res.status(404).json({ message: 'Invalid token or user not found' });
        }

        const hash = await bcrypt.hash(password, 10);
        await userCollection.updateOne({_id: new ObjectId(decoded.id)}, {$set: {password: hash}});
    
        res.status(200).json({ message: 'Password updated successfully' });
      } catch (error) {
        res.status(400).json({ message: 'Token expired or invalid' });
      }
    });

    // Logout
    app.get("/api/logout", (req, res) => {
      res.clearCookie("token").json({ message: "Logged out successfully" });
    });

    // Create contract ID
    app.post("/api/contract-id", async (req, res) => {
      try {
        const document = { email: req.body.email };
        const result = await contractCollection.insertOne(document);
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ message: "Error creating contract", error });
      }
    });

    // Get all contracts
    app.get("/api/contracts", async (req, res) => {
      try {
        const result = await contractCollection.find().sort({ _id: -1 }).toArray();
        res.status(200).json(result);
      } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Error fetching contracts", error });
      }
    });

    // Get contracts by user
    app.get("/api/user-contracts", async (req, res) => {
      try {
        const result = await contractCollection.find({ email: req.query.email }).sort({ _id: -1 }).toArray();
        res.status(200).json(result);
      } catch (error) {
        res.status(500).json({ message: "Error fetching user contracts", error });
      }
    });

    // Get contract by ID
    app.get("/api/contract", async (req, res) => {
      try {
        const contract = await contractCollection.findOne({ _id: new ObjectId(req.query.id) });
        if (!contract) return res.status(404).json({ message: "Contract not found" });
        res.status(200).json(contract);
      } catch (error) {
        console.log(error)
        res.status(500).json({ message: "Error fetching contract", error });
      }
    });

    // Create PDF contract
    app.post("/api/contract", async (req, res) => {
      try {
        const options = { format: 'A4', margin: { top: 40, bottom: 40, left: 40, right: 40 } };
        const file = { url: req.body.url };
        const fileName = `${new ObjectId()}.pdf`;
        const pathname = `./files/contracts/${fileName}`;
    
        html_to_pdf.generatePdf(file, options).then(pdfBuffer => {
          fs.writeFile(pathname, pdfBuffer, async err => {
            if (err) {
              console.log("Error writing file:", err);  // Log the file writing error
              return res.status(500).json({ message: "Error writing file", error: err });
            }
    
            try {
              const document = { ...req.body, contract: `${serverDomain}/${fileName}`, status: "pending", date: new Date() };
              await contractCollection.updateOne({ _id: new ObjectId(req.body.id) }, { $set: document });
              res.status(200).json({ url: `${serverDomain}/${fileName}` });
            } catch (dbError) {
              console.log("Error updating contract in database:", dbError);  // Log database update error
              return res.status(500).json({ message: "Error updating contract", error: dbError });
            }
          });
        }).catch(pdfError => {
          console.log("Error generating PDF:", pdfError);  // Log PDF generation error
          return res.status(500).json({ message: "Error generating PDF", error: pdfError });
        });
      } catch (error) {
        console.log("Server error:", error);  // Log server error
        res.status(500).json({ message: "Server Error", error });
      }
    });


    // Submit contract with file upload
    app.post("/api/submit-contract", submittedPdfUpload.single("file"), async (req, res) => {
      try {
        // Validate contract ID
        const isValidId = ObjectId.isValid(req.body.id);
        if (!isValidId) {
          console.log("Invalid contract ID:", req.body.id);
          return res.status(400).json({ message: "Invalid contract ID" });
        }
    
        // Check if the contract exists
        const contract = await contractCollection.findOne({ email: req.body.email, _id: new ObjectId(req.body.id) });
        if (!contract) {
          console.log("Contract not found for ID:", req.body.id);
          return res.status(404).json({ message: "Contract not found" });
        }
    
        // Prepare email content
        let emailContent;
        const user = await userCollection.findOne({ email: req.body.email });
        if (!user) {
          try {
            const password = await createUser(req.body.email);
            emailContent = template1(req.body.id, req.body.email, password);
          } catch (error) {
            console.log("Error creating user and sending email:", error);
            return res.status(500).json({ message: "Error creating user", error });
          }
        } else {
          emailContent = template2(req.body.id);
        }
    
        // Update the contract with the submitted file
        try {
          await contractCollection.updateOne(
            { _id: new ObjectId(req.body.id) },
            { $set: { submitted: `${serverDomain}/${req.file.filename}`, status: "submitted" } }
          );
          res.status(200).json({ message: "Contract submitted" });
        } catch (error) {
          console.log("Error updating contract with submitted file:", error);
          return res.status(500).json({ message: "Error updating contract", error });
        }
    
        // Send emails
        const attachments = [
          {
            filename: `contract-paper${path.extname(req.file.filename)}`,
            path: path.join(__dirname, "files", "submitted", req.file.filename),
          },
        ];
        const mailOptions1 = {
          from: emailId,
          to: req.body.email,
          subject: 'Contract Paper of Eravend',
          html: emailContent,
          attachments,
        };
        const mailOptions2 = {
          from: emailId,
          to: emailId,
          subject: 'Contract Submitted',
          html: template3(req.body.email),
          attachments,
        };
    
        [mailOptions1, mailOptions2].forEach(option => {
          transporter.sendMail(option, (error, info) => {
            if (error) {
              console.error('Error sending email:', error);
            } else {
              console.log('Email sent:', info.response);
            }
          });
        });
      } catch (error) {
        console.log("Error submitting contract:", error);
        res.status(500).json({ message: "Error submitting contract", error });
      }
    });


    // Verify contract with file upload
    app.post("/api/verify-contract", verifiedPdfUpload.single("file"), async (req, res) => {
      try {
        const result = await contractCollection.updateOne({ _id: new ObjectId(req.body.id) }, { $set: { verified: `${serverDomain}/${req.file.filename}`, status: "verified", verifiedDate: new Date() } });
        res.status(200).json(result);

        const attachments = [{ filename: `contract-paper${path.extname(req.file.filename)}`, path: path.join(__dirname, "files", "verified", req.file.filename) }];
        const mailOptions1 = { from: emailId, to: req.body.email, subject: 'Contract Paper Verified by Eravend', html: template4(), attachments };
        const mailOptions2 = { from: emailId, to: emailId, subject: 'Contract Paper Verified', html: template5(req.body.email), attachments };

        [mailOptions1, mailOptions2].forEach(option => transporter.sendMail(option, (error, info) => {
          if (error) console.error('Error sending email:', error);
          else console.log('Email sent:', info.response);
        }));
      } catch (error) {
        res.status(500).json({ message: "Error verifying contract", error });
      }
    });

    console.log("Database connected successfully!");
  } catch (error) {
    console.error("Error connecting to the database", error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("Welcome to Eravend's Server!"));

app.listen(port, () => console.log(`Server is running on port ${port}`));

module.exports = app;
