const userModel = require("../models/userModel.js");
const { comparePassword, hashPassword } = require("../helpers/authHelper.js");
const JWT = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const orderModel = require("../models/orderModel.js");
const { generateEmailTemplate } = require("../utils/mail.js");

const transporter = () =>
  nodemailer.createTransport({
    service: "gmail",

    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD,
    },
  });

exports.registerController = async (req, res) => {
  try {
    const { name, email, password, phone, address, answer } = req.body;
    // Validations
    if (!name || !email || !password || !phone || !address || !answer) {
      return res.status(400).send({ error: "All fields are required" });
    }
    // Check user
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(400).send({
        success: false,
        message: "Email already registered, please login",
      });
    }
    // Register user
    const hashedPassword = await hashPassword(password);
    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000);
    // Send verification email
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Email Verification",
      html: generateEmailTemplate(verificationCode),
    };
    await transporter().sendMail(mailOptions);
    // Save user
    const user = await new userModel({
      name,
      email,
      phone,
      address,
      password: hashedPassword,
      verificationCode,
      answer,
    });
    await user.save();
    res.status(201).send({
      success: true,
      message:
        "Registration successful, please check your email for verification code",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error in registration",
      error,
    });
  }
};

// POST LOGIN
exports.loginController = async (req, res) => {
  try {
    const { email, password } = req.body;
    // Validation
    if (!email || !password) {
      return res.status(404).send({
        success: false,
        message: "Invalid email or password",
      });
    }
    // Check user
    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(404).send({
        success: false,
        message: "Email is not registered",
      });
    }
    // Check if email is verified
    if (!user.isVerified) {
      return res.status(403).send({
        success: false,
        message: "Email is not verified",
      });
    }
    const match = await comparePassword(password, user.password);
    if (!match) {
      return res.status(200).send({
        success: false,
        message: "Invalid Password",
      });
    }
    // Generate token
    const token = await JWT.sign({ _id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res.status(200).send({
      success: true,
      message: "Login successful",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error in login",
      error,
    });
  }
};

//forgotPasswordController

exports.forgotPasswordController = async (req, res) => {
  try {
    const { email, answer, newPassword } = req.body;
    if (!email) {
      res.status(400).send({ message: "Emai is required" });
    }
    if (!answer) {
      res.status(400).send({ message: "answer is required" });
    }
    if (!newPassword) {
      res.status(400).send({ message: "New Password is required" });
    }
    //check
    const user = await userModel.findOne({ email, answer });
    //validation
    if (!user) {
      return res.status(404).send({
        success: false,
        message: "Wrong Email Or Answer",
      });
    }
    const hashed = await hashPassword(newPassword);
    await userModel.findByIdAndUpdate(user._id, { password: hashed });
    res.status(200).send({
      success: true,
      message: "Password Reset Successfully",
    });

    // Send email
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Password Reset",
      text: "Your password has been reset successfully.",
    };
    await transporter().sendMail(mailOptions);
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Something went wrong",
      error,
    });
  }
};

//test controller
exports.testController = (req, res) => {
  try {
    res.send("Protected Routes");
  } catch (error) {
    console.log(error);
    res.send({ error });
  }
};

exports.updateProfileController = async (req, res) => {
  try {
    const { name, email, password, address, phone } = req.body;
    const user = await userModel.findById(req.user._id);
    //password
    if (password && password.length < 6) {
      return res.json({ error: "Passsword is required and 6 character long" });
    }
    const hashedPassword = password ? await hashPassword(password) : undefined;
    const updatedUser = await userModel.findByIdAndUpdate(
      req.user._id,
      {
        name: name || user.name,
        password: hashedPassword || user.password,
        phone: phone || user.phone,
        address: address || user.address,
      },
      { new: true }
    );
    res.status(200).send({
      success: true,
      message: "Profile Updated SUccessfully",
      updatedUser,
    });
  } catch (error) {
    console.log(error);
    res.status(400).send({
      success: false,
      message: "Error WHile Update profile",
      error,
    });
  }
};

//orders
exports.getOrdersController = async (req, res) => {
  try {
    const orders = await orderModel
      .find({ buyer: req.user._id })
      .populate("products", "-photo")
      .populate("buyer", "name");
    res.json(orders);
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error WHile Geting Orders",
      error,
    });
  }
};
//orders
exports.getAllOrdersController = async (req, res) => {
  try {
    const orders = await orderModel
      .find({})
      .populate("products", "-photo")
      .populate("buyer", "name")
      .sort({ createdAt: "-1" });
    res.json(orders);
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error WHile Geting Orders",
      error,
    });
  }
};

//order status
exports.orderStatusController = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const updatedOrder = await orderModel.findByIdAndUpdate(
      orderId,
      { status },
      { new: true }
    );
    if (status === "Completed") {
      // Retrieve the user's email address, product name, and user's name
      const user = await userModel.findById(updatedOrder.buyer);
      if (user) {
        const userEmail = user.email;
        const userName = user.name;

        // Create an HTML email message
        const htmlMessage = `
      
      <html>
      <head>
        <style>
          /* Styles for the image */
          img {
            display: block;
            margin: 0 auto;
            max-width: 200px; /* Adjust the width as needed */
          }
      
          /* Styles for the email content */
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            background-color: #f5f5f5;
          }
      
          p {
            margin: 10px 0;
          }
      
          strong {
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <img src="https://res.cloudinary.com/dq9wvmljt/image/upload/v1695990834/assume_qbunmv.jpg" alt="EduHomes Logo" />
        <p>Hello ${userName},</p>
        <p>Your order has been completed. Thank you for your order</p>
        <p>Best regards, Ocelle's Crafts</p>
        <p>Handmade with love</p>
      </body>
      </html>
      
      `;

        // Send an email to the user
        const mailOptions = {
          from: process.env.EMAIL,
          to: userEmail,
          subject: "Order Completed",
          html: htmlMessage,
        };

        // Send the email
        transporter().sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error("Error sending email:", error);
          } else {
            console.log("Email sent:", info.response);
          }
        });
      }
      res.json(updatedOrder);
    }
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error While Updateing Order",
      error,
    });
  }
};
