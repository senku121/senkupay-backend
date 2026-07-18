/*==================================================
                SENKU PAY
          CLOUDINARY CONFIGURATION
==================================================*/

const { v2: cloudinary } = require("cloudinary");

const requiredVariables = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET"
];

const missingVariables = requiredVariables.filter(
    (variableName) => !process.env[variableName]
);

if (missingVariables.length > 0) {
    throw new Error(
        `Missing Cloudinary environment variables: ${missingVariables.join(", ")}`
    );
}

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

module.exports = cloudinary;