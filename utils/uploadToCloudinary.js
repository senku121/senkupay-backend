/*==================================================
                SENKU PAY
         CLOUDINARY BUFFER UPLOADER
==================================================*/

const cloudinary = require("../config/cloudinary");

/**
 * Uploads a Multer memory-buffer file to Cloudinary.
 *
 * @param {Object} file Multer file object
 * @param {string} userId SenkuPay user ID
 * @param {string} documentLabel Document field label
 * @returns {Promise<Object>} Cloudinary upload result
 */
const uploadToCloudinary = (
    file,
    userId,
    documentLabel
) => {

    return new Promise((resolve, reject) => {

        if (!file?.buffer) {

            return reject(
                new Error("The uploaded file buffer is missing.")
            );

        }

        const isPdf =
            file.mimetype === "application/pdf";

        const uploadStream =
            cloudinary.uploader.upload_stream(

                {

                    folder:
                        `senkupay/kyc/${userId}`,

                    public_id:
                        `${documentLabel}-${Date.now()}`,

                    resource_type:
                        isPdf ? "raw" : "image",

                    type:
                        "authenticated",

                    overwrite:
                        false,

                    use_filename:
                        false,

                    unique_filename:
                        true

                },

                (error, result) => {

                    if (error) {
                        return reject(error);
                    }

                    resolve(result);

                }

            );

        uploadStream.end(file.buffer);

    });

};

module.exports = uploadToCloudinary;