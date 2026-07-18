/*==================================================
                SENKU PAY
             KYC FILE UPLOAD
==================================================*/

const multer = require("multer");

/*==================================
        ALLOWED FILE TYPES
==================================*/

const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "application/pdf"
]);

/*==================================
        MEMORY STORAGE
==================================*/

/*
 * Files are temporarily held in memory.
 * They are then uploaded to Cloudinary.
 *
 * Nothing is permanently stored on Render.
 */

const storage = multer.memoryStorage();

/*==================================
        FILE FILTER
==================================*/

const fileFilter = (req, file, callback) => {

    if (!allowedMimeTypes.has(file.mimetype)) {

        return callback(
            new Error(
                "Only JPG, JPEG, PNG, and PDF files are allowed."
            )
        );

    }

    callback(null, true);

};

/*==================================
        MULTER CONFIGURATION
==================================*/

const kycUpload = multer({

    storage,

    limits: {

        /*
         * Maximum size for each file:
         * 5 MB
         */

        fileSize: 5 * 1024 * 1024,

        /*
         * Maximum total uploaded files
         * in one request.
         */

        files: 4

    },

    fileFilter

});

/*==================================
        EXPECTED KYC FIELDS
==================================*/

const uploadKycDocuments = kycUpload.fields([

    {
        name: "idFront",
        maxCount: 1
    },

    {
        name: "idBack",
        maxCount: 1
    },

    {
        name: "selfie",
        maxCount: 1
    },

    {
        name: "proofOfAddress",
        maxCount: 1
    }

]);

/*==================================
        MULTER ERROR HANDLER
==================================*/

const handleKycUpload = (req, res, next) => {

    uploadKycDocuments(req, res, (error) => {

        if (!error) {
            return next();
        }

        if (error instanceof multer.MulterError) {

            if (error.code === "LIMIT_FILE_SIZE") {

                return res.status(400).json({

                    success: false,

                    message:
                        "Each KYC document must be 5 MB or smaller."

                });

            }

            if (error.code === "LIMIT_FILE_COUNT") {

                return res.status(400).json({

                    success: false,

                    message:
                        "You can upload a maximum of 4 KYC documents."

                });

            }

            if (error.code === "LIMIT_UNEXPECTED_FILE") {

                return res.status(400).json({

                    success: false,

                    message:
                        "An unexpected KYC document field was submitted."

                });

            }

            return res.status(400).json({

                success: false,

                message:
                    "Unable to process the uploaded KYC documents."

            });

        }

        return res.status(400).json({

            success: false,

            message:
                error.message ||
                "Invalid KYC document upload."

        });

    });

};

module.exports = {

    handleKycUpload

};