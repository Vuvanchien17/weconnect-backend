import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.MY_EMAIL,
    pass: process.env.APP_PASSWORD,
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.log("Config Error Mail:", error);
  } else {
    console.log("Server already send Email!");
  }
});

export default transporter;
