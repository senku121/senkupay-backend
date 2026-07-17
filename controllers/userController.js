/*==================================================
                SENKU PAY
            USER CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");
const cloudinary = require("../config/cloudinary");
const uploadToCloudinary = require("../utils/uploadToCloudinary");

const prisma = new PrismaClient();

/*==================================
        USER PROFILE
==================================*/

exports.getProfile = async (req, res) => {

    try {

        const user = await prisma.user.findUnique({

            where: {

                id: req.user.id

            }

        });

        if (!user) {

            return res.status(404).json({

                success: false,

                message: "User not found."

            });

        }

        return res.status(200).json({

            success: true,

            profile: {

                id: user.id,

                username: user.username,

                email: user.email,

                firstName: user.firstName,

                lastName: user.lastName,

                phone: user.phone,

                country: user.country,
                emailVerified: user.emailVerified,

                balance: user.balance,

                deposited: user.deposited,

                withdrawn: user.withdrawn,

                lockedBalance: user.lockedBalance,

                status: user.status,

                createdAt: user.createdAt

            }

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to load profile."

        });

    }

};

/*==================================
        DELETE USER ACCOUNT
==================================*/

exports.deleteAccount = async (req, res) => {

    try {

        const userId = req.user.id;
        const confirmation = String(req.body?.confirmation || "").trim().toUpperCase();

        if (confirmation !== "DELETE") {
            return res.status(400).json({
                success: false,
                message: "Type DELETE to confirm account deletion."
            });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                balance: true,
                lockedBalance: true,
                deposits: {
                    where: { status: { in: ["PENDING", "Pending", "pending"] } },
                    select: { id: true },
                    take: 1
                },
                withdrawRequests: {
                    where: { status: { in: ["PENDING", "Pending", "pending", "PROCESSING", "Processing", "processing"] } },
                    select: { id: true },
                    take: 1
                }
            }
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        if (Math.abs(user.balance) > 0.000001 || Math.abs(user.lockedBalance) > 0.000001) {
            return res.status(409).json({
                success: false,
                message: "Your balance and locked balance must be zero before deleting your account."
            });
        }

        if (user.deposits.length > 0 || user.withdrawRequests.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Complete or cancel all pending deposits and withdrawal requests before deleting your account."
            });
        }

        await prisma.user.delete({
            where: { id: userId }
        });

        return res.status(200).json({
            success: true,
            message: "Your Senku Pay account was permanently deleted."
        });

    } catch (error) {

        console.error("Delete account error:", error);

        if (error.code === "P2025") {
            return res.status(404).json({
                success: false,
                message: "User account not found."
            });
        }

        return res.status(500).json({
            success: false,
            message: "Unable to delete your account right now."
        });
    }
};
/*==================================================
                KYC HELPERS
==================================================*/

const KYC_FILE_FIELDS = {
    idFront: "ID_FRONT",
    idBack: "ID_BACK",
    selfie: "SELFIE",
    proofOfAddress: "PROOF_OF_ADDRESS"
};

const deleteCloudinaryAsset = async (document) => {

    if (!document?.cloudinaryPublicId) {
        return;
    }

    try {

        await cloudinary.uploader.destroy(
            document.cloudinaryPublicId,
            {
                resource_type:
                    document.cloudinaryResourceType || "image",

                type: "authenticated",
                invalidate: true
            }
        );

    } catch (error) {

        console.error(
            "Unable to delete Cloudinary KYC asset:",
            error
        );

    }

};


/*==================================================
                GET KYC STATUS
==================================================*/

exports.getKycStatus = async (req, res) => {

    try {

        const verification =
            await prisma.kycVerification.findUnique({

                where: {
                    userId: req.user.id
                },

                select: {

                    id: true,
                    status: true,
                    source: true,

                    documentType: true,
                    documentCountry: true,

                    submittedAt: true,
                    reviewedAt: true,
                    verifiedAt: true,
                    rejectedAt: true,
                    revokedAt: true,

                    rejectionReason: true,
                    reverificationReason: true,

                    createdAt: true,
                    updatedAt: true,

                    documents: {

                        where: {
                            deletedAt: null
                        },

                        select: {
                            id: true,
                            type: true,
                            fileName: true,
                            mimeType: true,
                            fileSize: true,
                            uploadedAt: true
                        },

                        orderBy: {
                            uploadedAt: "asc"
                        }

                    }

                }

            });

        if (!verification) {

            return res.status(200).json({

                success: true,

                kyc: {
                    status: "NOT_SUBMITTED",
                    source: null,
                    submittedAt: null,
                    verifiedAt: null,
                    rejectionReason: null,
                    reverificationReason: null,
                    documents: []
                }

            });

        }

        return res.status(200).json({

            success: true,

            kyc: verification

        });

    } catch (error) {

        console.error("Get KYC status error:", error);

        return res.status(500).json({

            success: false,

            message: "Unable to load KYC status."

        });

    }

};


/*==================================================
                SUBMIT USER KYC
==================================================*/

exports.submitKyc = async (req, res) => {

    const uploadedAssets = [];

    try {

        const userId = req.user.id;

        const documentType =
            String(req.body.documentType || "")
                .trim()
                .toUpperCase();

        const documentCountry =
            String(req.body.documentCountry || "")
                .trim()
                .toUpperCase();

        const allowedDocumentTypes = new Set([
            "NATIONAL_ID",
            "CITIZENSHIP",
            "DRIVING_LICENSE",
            "PASSPORT"
        ]);

        if (!allowedDocumentTypes.has(documentType)) {

            return res.status(400).json({

                success: false,

                message:
                    "Select a valid identity document type."

            });

        }

        if (
            !documentCountry ||
            documentCountry.length < 2 ||
            documentCountry.length > 80
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Enter a valid document country."

            });

        }

        const files = req.files || {};

        const idFront = files.idFront?.[0];
        const idBack = files.idBack?.[0];
        const selfie = files.selfie?.[0];
        const proofOfAddress =
            files.proofOfAddress?.[0];

        if (!idFront) {

            return res.status(400).json({

                success: false,

                message:
                    "The front side of your identity document is required."

            });

        }

        if (!selfie) {

            return res.status(400).json({

                success: false,

                message:
                    "A selfie is required for identity verification."

            });

        }

        if (
            documentType !== "PASSPORT" &&
            !idBack
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "The back side of the identity document is required."

            });

        }

        const existingVerification =
            await prisma.kycVerification.findUnique({

                where: {
                    userId
                },

                include: {

                    documents: {

                        where: {
                            deletedAt: null
                        }

                    }

                }

            });

        if (
            existingVerification?.status === "PENDING"
        ) {

            return res.status(409).json({

                success: false,

                message:
                    "Your KYC submission is already pending review."

            });

        }

        if (
            existingVerification?.status === "VERIFIED"
        ) {

            return res.status(409).json({

                success: false,

                message:
                    "Your identity is already verified."

            });

        }

        const incomingFiles = [];

        for (
            const [fieldName, documentEnum]
            of Object.entries(KYC_FILE_FIELDS)
        ) {

            const file = files[fieldName]?.[0];

            if (file) {

                incomingFiles.push({
                    fieldName,
                    documentEnum,
                    file
                });

            }

        }

        /*
         * Cloudinary uploads happen before the
         * database transaction. Network requests
         * should not be performed inside a Prisma
         * interactive transaction.
         */

        for (const incoming of incomingFiles) {

            const result =
                await uploadToCloudinary(
                    incoming.file,
                    userId,
                    incoming.fieldName
                );

            uploadedAssets.push({
                ...result,
                documentEnum:
                    incoming.documentEnum,
                originalName:
                    incoming.file.originalname,
                mimeType:
                    incoming.file.mimetype,
                fileSize:
                    incoming.file.size
            });

        }

        const result =
            await prisma.$transaction(async (tx) => {

                const previousStatus =
                    existingVerification?.status ||
                    "NOT_SUBMITTED";

                let verification;

                if (existingVerification) {

                    await tx.kycDocument.updateMany({

                        where: {
                            kycVerificationId:
                                existingVerification.id,
                            deletedAt: null
                        },

                        data: {
                            deletedAt: new Date()
                        }

                    });

                    verification =
                        await tx.kycVerification.update({

                            where: {
                                id:
                                    existingVerification.id
                            },

                            data: {

                                status: "PENDING",
                                source: "USER_UPLOAD",

                                documentType,
                                documentCountry,

                                submittedAt: new Date(),

                                reviewedAt: null,
                                verifiedAt: null,
                                rejectedAt: null,
                                revokedAt: null,

                                rejectionReason: null,
                                reverificationReason: null,
                                adminNote: null,
                                verifiedByAdminId: null

                            }

                        });

                } else {

                    verification =
                        await tx.kycVerification.create({

                            data: {

                                userId,

                                status: "PENDING",
                                source: "USER_UPLOAD",

                                documentType,
                                documentCountry,

                                submittedAt: new Date()

                            }

                        });

                }

                await tx.kycDocument.createMany({

                    data: uploadedAssets.map(
                        (asset) => ({

                            userId,

                            kycVerificationId:
                                verification.id,

                            type:
                                asset.documentEnum,

                            fileName:
                                asset.originalName,

                            fileUrl:
                                asset.secure_url,

                            cloudinaryPublicId:
                                asset.public_id,

                            cloudinaryResourceType:
                                asset.resource_type ||
                                "image",

                            mimeType:
                                asset.mimeType,

                            fileSize:
                                asset.fileSize

                        })
                    )

                });

                await tx.kycAuditLog.create({

                    data: {

                        userId,

                        kycVerificationId:
                            verification.id,

                        action:
                            existingVerification
                                ? "RESUBMITTED"
                                : "SUBMITTED",

                        previousStatus,

                        newStatus: "PENDING",

                        reason:
                            existingVerification
                                ? "User submitted new KYC documents."
                                : "User submitted KYC documents."

                    }

                });

                return verification;

            });

        /*
         * Delete the former Cloudinary assets only
         * after the new database submission succeeds.
         */

        if (existingVerification?.documents?.length) {

            await Promise.allSettled(
                existingVerification.documents.map(
                    deleteCloudinaryAsset
                )
            );

        }

        return res.status(201).json({

            success: true,

            message:
                "Your KYC documents were submitted successfully and are awaiting admin review.",

            kyc: {

                id: result.id,
                status: result.status,
                source: result.source,
                submittedAt:
                    result.submittedAt

            }

        });

    } catch (error) {

        console.error("Submit KYC error:", error);

        /*
         * If Cloudinary succeeded but the database
         * operation failed, remove the new assets.
         */

        await Promise.allSettled(

            uploadedAssets.map((asset) =>
                deleteCloudinaryAsset({

                    cloudinaryPublicId:
                        asset.public_id,

                    cloudinaryResourceType:
                        asset.resource_type

                })
            )

        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to submit KYC documents right now."

        });

    }

};