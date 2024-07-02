const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cookie_parser = require("cookie-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const multer = require("multer");
const nodemailer = require("nodemailer");
const html_to_pdf = require("html-pdf-node");
const admin = require("firebase-admin");
const serviceAccount = require("./keys/serviceAccountKey.json");
const fs = require("fs");
const path = require("path");
const template1 = require("./email-templates/template-1");
const template2 = require("./email-templates/template-2");
const template3 = require("./email-templates/template-3");
const template4 = require("./email-templates/template-4");
const template5 = require("./email-templates/template-5");

const emailId = "eravend.gmbh@gmail.com";
const emailPass = "fevr gknz gjby kvvd";
const serverDomain = "https://server.investiereindeinenpizzaautomaten.de";
const jwtSecret = "610880b115c7c221542f135f83e7fee2896e808afca4580ddeb1a783e957d12688855270e85b4a4d2fdcc223f4803fdb831e5b6c616e5d9c549921bc0a33f03d";
const uri = "mongodb://localhost:27017";
const port = process.env.PORT || 5987;

app.use(cors({
  origin: [
    "https://investiereindeinenpizzaautomaten.de",
    "http://localhost:5173"
  ],
  credentials: true
}))
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
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const submittedStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'files/submitted/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = new ObjectId().toString();
    const originalName = file.originalname;
    const extension = path.extname(originalName);
    cb(null, uniqueSuffix + extension);
  }
});
const verifiedStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'files/verified/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = new ObjectId().toString();
    const originalName = file.originalname;
    const extension = path.extname(originalName);
    cb(null, uniqueSuffix + extension);
  }
});
const submittedPdfUpload = multer({storage: submittedStorage});
const verifiedPdfUpload = multer({storage: verifiedStorage});

const transporter = nodemailer.createTransport({
  service: "gmail",
  secure: true,
  port: 465,
  auth: {
    user: emailId,
    pass: emailPass
  }
});

const generatePassword = length => {
  const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowers = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const specials = '!@#$%^&*()_+[]{}|;:,.<>?';
  const allChars = uppers + lowers + digits + specials;

  let password = '';
  password += uppers[Math.floor(Math.random() * uppers.length)];
  password += lowers[Math.floor(Math.random() * lowers.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += specials[Math.floor(Math.random() * specials.length)];

  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  password = password.split('').sort(() => Math.random() - 0.5).join('');
  return password;
}

async function run() {
  try {
    const database = client.db("eravend");
    const userCollection = database.collection("users");
    const contractCollection = database.collection("contracts");

    app.get("/api/user-role", async(req, res) => {
      const user = await userCollection.findOne({email: req.query?.email});
      res.send({role: user?.role});
    })

    app.post("/api/contract-id", async(req, res) => {
      const document = {
        email: req.body?.email
      };
      const result = await contractCollection.insertOne(document);
      res.send(result);
    })
    app.get("/api/contracts", async(req, res) => {
      const result = await contractCollection.find().sort({_id: -1}).toArray();
      res.send(result);
    })
    app.get("/api/user-contracts", async(req, res) => {
      const result = await contractCollection.find({email: req.query?.email}).sort({_id: -1}).toArray();
      res.send(result);
    })
    app.get("/api/contract", async(req, res) => {
      const contract = await contractCollection.findOne({_id: new ObjectId(req.query?.id)});
      res.send(contract);
    })

    app.post("/api/contract", async(req, res) => {
      let options = { format: 'A4', margin: { top: 40, bottom: 40, left: 40, right: 40 } };
      let file = { url: req.body?.url };
      const fileName = `${new ObjectId().toString()}.pdf`;
      const pathname = `./files/contracts/${fileName}`;

      html_to_pdf.generatePdf(file, options).then(pdfBuffer => {
        fs.writeFile(pathname, pdfBuffer, async(err) => {
          if (err) {
            console.log(err);
            res.send(err);
          } else {
            const document = {};
            if (req.body.name) document.name = req.body.name;
            if (req.body.surname) document.surname = req.body.surname;
            document.email = req.body.email;
            if (req.body.company) document.company = req.body.company;
            document.address = req.body.address;
            document.amount = req.body.amount;
            document.numberOfMachines = req.body.numberOfMachines;
            document.nid = req.body.nid;
            document.idDate = req.body.idDate;
            document.idAuthority = req.body.idAuthority;
            document.contract = `${serverDomain}/${fileName}`;
            document.status = "pending";
            document.date = new Date();
            await contractCollection.updateOne({_id: new ObjectId(req.body.id)}, {$set: document});

            res.send({ url: `${serverDomain}/${fileName}` });
          }
        });
      });
    })

    app.post("/api/submit-contract", submittedPdfUpload.single("file"), async(req, res) => {
      try {
        new ObjectId(req.body?.id);
      }
      catch(error) {
        return res.send({status: "wrong id"});
      }

      const validate = await contractCollection.findOne({email: req.body.email, _id: new ObjectId(req.body?.id)});
      if (!validate) {
        return res.send({status: "unmatched"});
      }

      let emailContent;
      const result = await userCollection.findOne({email: req.body?.email});
      if (!result) {
        const password = generatePassword(12);
        await admin.auth().createUser({
          email: req.body.email,
          password: password,
        });

        const user = {
          email: req.body.email,
          role: "investor"
        }
        await userCollection.insertOne(user);

        emailContent = template1(req.body.id, req.body.email, password);
      }
      else {
        emailContent = template2(req.body.id);
      }

      const document = {
        submitted: `${serverDomain}/${req.file.filename}`,
        status: "submitted"
      }
      const result2 = await contractCollection.updateOne({_id: new ObjectId(req.body?.id)}, {$set: document});
      res.send(result2);

      const attachments = [{
        filename: `contract-paper${req.file.filename.substring(req.file.filename.lastIndexOf("."))}`,
        path: path.join(__dirname, "files", "submitted", `${req.file.filename}`)
      }];
      const mailOptions1 = {
        from: emailId,
        to: req.body.email,
        subject: 'Contract Paper of Eravend',
        html: emailContent,
        attachments
      };
      const mailOptions2 = {
        from: emailId,
        to: emailId,
        subject: 'Contract Submitted',
        html: template3(req.body.email),
        attachments
      };

      for (let option of [mailOptions1, mailOptions2]) {
        transporter.sendMail(option, (error, info) => {
          if (error) {
            console.error('Error sending email:', error);
            return;
          }
          console.log('Email sent:', info.response);
        });
      }
    })

    app.post("/api/verify-contract", verifiedPdfUpload.single("file"), async(req, res) => {
      const document = {
        verified: `${serverDomain}/${req.file.filename}`,
        status: "verified",
        verifiedDate: new Date()
      }
      const result = await contractCollection.updateOne({_id: new ObjectId(req.body.id)}, {$set: document});
      res.send(result);
    
      const attachments = [{
        filename: `contract-paper${req.file.filename.substring(req.file.filename.lastIndexOf("."))}`,
        path: path.join(__dirname, "files", "verified", `${req.file.filename}`)
      }];
      const mailOptions1 = {
        from: emailId,
        to: req.body.email,
        subject: 'Contract Paper Verified by Eravend',
        html: template4(),
        attachments
      };
      const mailOptions2 = {
        from: emailId,
        to: emailId,
        subject: 'Contract Paper Verified',
        html: template5(req.body.email),
        attachments
      };
    
      for (let option of [mailOptions1, mailOptions2]) {
        transporter.sendMail(option, (error, info) => {
          if (error) {
            console.error('Error sending email:', error);
            return;
          }
          console.log('Email sent:', info.response);
        });
      }
    })

    await client.db("admin").command({ ping: 1 });
    console.log("Database Connected!");
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to Eravend's Server!");
});

app.listen(port, () => {
  console.log(`Server is running on the ${port} port!`);
})

module.exports = app;
