require("dotenv").config();

module.exports = {
  DB: process.env.DB || "",
  PORT: process.env.PORT || 7730,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",
  AWS_REGION: process.env.AWS_REGION || "",
  JWT_SECRET: process.env.JWT_SECRET || "",
  MONGO_URI: process.env.MONGO_URI || "",
  RESEND_KEY: process.env.RESEND || "",
  BUCKET_NAME: process.env.BUCKET_NAME,
  BUCKET_REGION: process.env.BUCKET_REGION,
  AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
  AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
  BUCKET_URL: process.env.BUCKET_URL,
  CLOUDFRONTID: process.env.CLOUDFRONTID,
  MODEL_API_KEY: process.env.MODEL_API_KEY,
  MODEL_NAME: process.env.MODEL_NAME,
  MODEL_API_POINT: process.env.MODEL_API_POINT,
  RELICS_API_KEY: process.env.RELICS_API_KEY,
};
