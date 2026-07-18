/*==================================================
                SENKU PAY
        ADMIN USER CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const cloudinary = require("../config/cloudinary");

const prisma = new PrismaClient();

/*==================================
        GET USERS
==================================*/

exports.getUsers = async (req, res) => {

    try {

        const users = await prisma.user.findMany({

            orderBy: {
                createdAt: "desc"
            },

            select: {

                id: true,
                username: true,
                email: true,

                balance: true,
                deposited: true,
                withdrawn: true,
                lockedBalance: true,

                status: true,

                createdAt: true

            }

        });

        return res.status(200).json({

            success: true,

            users

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to load users."

        });

    }

};


/*==================================
        ADD BALANCE
==================================*/

exports.addBalance = async (req, res) => {

    try {

        const { id } = req.params;

        const amount = Number(req.body.amount);

        if (amount <= 0) {

            return res.status(400).json({

                success: false,

                message: "Invalid amount."

            });

        }

        const admin = await prisma.admin.findFirst();

        const user = await prisma.user.findUnique({

            where: { id }

        });

        if (!admin) {

            return res.status(404).json({

                success: false,

                message: "Platform account not found."

            });

        }

        if (!user) {

            return res.status(404).json({

                success: false,

                message: "User not found."

            });

        }

        if (Number(admin.balance) < amount) {

            return res.status(400).json({

                success: false,

                message: "Platform balance is insufficient."

            });

        }

        await prisma.$transaction([

            prisma.user.update({

                where: { id },

                data: {

                    balance: {

                        increment: amount

                    }

                }

            }),

            prisma.admin.update({

                where: {

                    id: admin.id

                },

                data: {

                    balance: {

                        decrement: amount

                    }

                }

            })

        ]);

        return res.status(200).json({

            success: true,

            message: "Balance added successfully."

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to add balance."

        });

    }

};


/*==================================
        DEDUCT BALANCE
==================================*/

/*================================
        DEDUCT BALANCE
================================*/

exports.deductBalance = async (req, res) => {

    try {

        const { id } = req.params;

        const amount = Number(req.body.amount);


        /*================================
                VALIDATE AMOUNT
        ================================*/

        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {

            return res.status(400).json({

                success: false,

                message: "Enter a valid amount."

            });

        }


        /*================================
              LOAD USER AND ADMIN
        ================================*/

        const [user, admin] =
            await Promise.all([

                prisma.user.findUnique({

                    where: {
                        id
                    }

                }),

                prisma.admin.findFirst({

                    where: {
                        status: "ACTIVE"
                    }

                })

            ]);


        if (!user) {

            return res.status(404).json({

                success: false,

                message: "User not found."

            });

        }


        if (!admin) {

            return res.status(404).json({

                success: false,

                message: "Active admin account not found."

            });

        }


        if (Number(user.balance) < amount) {

            return res.status(400).json({

                success: false,

                message: "User doesn't have enough balance."

            });

        }


        /*================================
          DEDUCT USER + CREDIT PLATFORM

          Everything succeeds together,
          or everything is rolled back.
        ================================*/

        const result =
            await prisma.$transaction(async (tx) => {

                /*
                 * Conditional update prevents the
                 * balance from becoming negative if
                 * two requests happen simultaneously.
                 */

                const deduction =
                    await tx.user.updateMany({

                        where: {

                            id,

                            balance: {
                                gte: amount
                            }

                        },

                        data: {

                            balance: {
                                decrement: amount
                            }

                        }

                    });


                if (deduction.count !== 1) {

                    throw new Error(
                        "INSUFFICIENT_USER_BALANCE"
                    );

                }


                const updatedAdmin =
                    await tx.admin.update({

                        where: {
                            id: admin.id
                        },

                        data: {

                            balance: {
                                increment: amount
                            }

                        },

                        select: {

                            id: true,
                            balance: true

                        }

                    });


                const transaction =
                    await tx.transaction.create({

                        data: {

                            userId: id,

                            type: "Admin Deducted Balance",

                            amount: -amount,

                            status: "Completed",

                            reference:
                                `ADMIN-DEDUCT-${Date.now()}`,

                            note:
                                "Balance deducted by admin and returned to platform balance."

                        }

                    });


                const updatedUser =
                    await tx.user.findUnique({

                        where: {
                            id
                        },

                        select: {

                            id: true,
                            username: true,
                            balance: true

                        }

                    });


                return {

                    user: updatedUser,

                    admin: updatedAdmin,

                    transaction

                };

            });


        return res.status(200).json({

            success: true,

            message:
                "Balance deducted and added to platform balance successfully.",

            deductedAmount:
                amount,

            userBalance:
                result.user.balance,

            platformBalance:
                result.admin.balance,

            transactionId:
                result.transaction.id

        });

    }

    catch (error) {

        console.error(
            "Admin deduct balance error:",
            error
        );


        if (
            error.message ===
            "INSUFFICIENT_USER_BALANCE"
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "User doesn't have enough balance."

            });

        }


        return res.status(500).json({

            success: false,

            message:
                "Unable to deduct the user's balance."

        });

    }

};


/*==================================
        USER STATUS
==================================*/

exports.updateUserStatus = async (req, res) => {

    try {

        const { id } = req.params;

        const status = String(req.body.status || "").trim();

        await prisma.user.update({

            where: { id },

            data: {

                status

            }

        });

        return res.status(200).json({

            success: true,

            message: "User status updated."

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to update user."

        });

    }

};


/*==================================
        RESET PASSWORD
==================================*/

exports.resetPassword = async (req, res) => {

    try {

        const { id } = req.params;

        const password = String(req.body.password || "");

        if (password.length < 6) {

            return res.status(400).json({

                success: false,

                message: "Password must contain at least 6 characters."

            });

        }

        const hash = await bcrypt.hash(

            password,

            12

        );

        await prisma.user.update({

            where: { id },

            data: {

                password: hash

            }

        });

        return res.status(200).json({

            success: true,

            message: "Password reset successfully."

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to reset password."

        });

    }

};


/*==================================
        USER TRANSACTIONS
==================================*/

exports.getUserTransactions = async (req, res) => {

    try {

        const transactions =

            await prisma.transaction.findMany({

                where: {

                    userId: req.params.id

                },

                orderBy: {

                    createdAt: "desc"

                }

            });

        return res.status(200).json({

            success: true,

            transactions

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to load transactions."

        });

    }

};
/*==================================================
              GET USER KYC
==================================================*/

exports.getUserKyc = async (req, res) => {

    try {

        const userId = req.params.id;

        const user = await prisma.user.findUnique({

            where: {
                id: userId
            },

            select: {

                id: true,
                username: true,
                email: true,

                kycVerification: {

                    include: {

                        documents: {

                            where: {
                                deletedAt: null
                            },

                            orderBy: {
                                uploadedAt: "asc"
                            }

                        },

                        auditLogs: {

                            orderBy: {
                                createdAt: "desc"
                            },

                            include: {

                                admin: {

                                    select: {
                                        id: true,
                                        username: true,
                                        email: true
                                    }

                                }

                            }

                        }

                    }

                }

            }

        });

        if (!user) {

            return res.status(404).json({

                success: false,

                message: "User not found."

            });

        }

        if (!user.kycVerification) {

            return res.status(200).json({

                success: true,

                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                },

                kyc: {
                    status: "NOT_SUBMITTED",
                    source: null,
                    documents: [],
                    auditLogs: []
                }

            });

        }

        const documents =
            user.kycVerification.documents.map(
                (document) => {

                    let viewUrl = null;

                    if (document.cloudinaryPublicId) {

                        viewUrl =
                            cloudinary.url(
                                document.cloudinaryPublicId,
                                {
                                    resource_type:
                                        document.cloudinaryResourceType ||
                                        "image",

                                    type: "authenticated",

                                    sign_url: true,

                                    secure: true,

                                    expires_at:
                                        Math.floor(Date.now() / 1000) +
                                        600
                                }
                            );

                    }

                    return {

                        id: document.id,

                        type: document.type,

                        fileName: document.fileName,

                        mimeType: document.mimeType,

                        fileSize: document.fileSize,

                        uploadedAt:
                            document.uploadedAt,

                        viewUrl

                    };

                }
            );

        return res.status(200).json({

            success: true,

            user: {

                id: user.id,

                username: user.username,

                email: user.email

            },

            kyc: {

                ...user.kycVerification,

                documents

            }

        });

    } catch (error) {

        console.error(
            "Get user KYC error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to load the user's KYC information."

        });

    }

};
/*==================================================
              APPROVE USER KYC
==================================================*/

exports.approveUserKyc = async (req, res) => {

    try {

        const userId = req.params.id;

        const adminId = req.user.id;

        const adminNote =
            String(req.body.adminNote || "")
                .trim() || null;

        const verification =
            await prisma.kycVerification.findUnique({

                where: {
                    userId
                }

            });

        if (!verification) {

            return res.status(404).json({

                success: false,

                message:
                    "This user has not submitted KYC documents."

            });

        }

        if (verification.status !== "PENDING") {

            return res.status(409).json({

                success: false,

                message:
                    `KYC cannot be approved while its status is ${verification.status}.`

            });

        }

        const reviewedAt = new Date();

        const updatedVerification =
            await prisma.$transaction(async (tx) => {

                const updated =
                    await tx.kycVerification.update({

                        where: {
                            id: verification.id
                        },

                        data: {

                            status: "VERIFIED",

                            reviewedAt,

                            verifiedAt: reviewedAt,

                            rejectedAt: null,

                            revokedAt: null,

                            rejectionReason: null,

                            reverificationReason: null,

                            adminNote,

                            verifiedByAdminId: adminId

                        }

                    });

                await tx.kycAuditLog.create({

                    data: {

                        userId,

                        kycVerificationId:
                            verification.id,

                        adminId,

                        action: "VERIFIED",

                        previousStatus:
                            verification.status,

                        newStatus: "VERIFIED",

                        reason:
                            adminNote ||
                            "KYC approved by admin."

                    }

                });

                return updated;

            });

        return res.status(200).json({

            success: true,

            message:
                "The user's KYC was approved successfully.",

            kyc: {

                id: updatedVerification.id,

                status:
                    updatedVerification.status,

                verifiedAt:
                    updatedVerification.verifiedAt,

                reviewedAt:
                    updatedVerification.reviewedAt

            }

        });

    } catch (error) {

        console.error(
            "Approve user KYC error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to approve the user's KYC."

        });

    }

};
/*==================================================
              REJECT USER KYC
==================================================*/

exports.rejectUserKyc = async (req, res) => {

    try {

        const userId = req.params.id;

        const adminId = req.user.id;

        const rejectionReason =
            String(req.body.rejectionReason || "").trim();

        const adminNote =
            String(req.body.adminNote || "").trim() || null;

        if (!rejectionReason) {

            return res.status(400).json({

                success: false,

                message: "Rejection reason is required."

            });

        }

        const verification =
            await prisma.kycVerification.findUnique({

                where: {
                    userId
                }

            });

        if (!verification) {

            return res.status(404).json({

                success: false,

                message: "KYC record not found."

            });

        }

        if (verification.status !== "PENDING") {

            return res.status(409).json({

                success: false,

                message:
                    `KYC cannot be rejected while its status is ${verification.status}.`

            });

        }

        const reviewedAt = new Date();

        const updated =
            await prisma.$transaction(async (tx) => {

                const result =
                    await tx.kycVerification.update({

                        where: {
                            id: verification.id
                        },

                        data: {

                            status: "REJECTED",

                            reviewedAt,

                            rejectedAt: reviewedAt,

                            verifiedAt: null,

                            rejectionReason,

                            adminNote,

                            verifiedByAdminId: adminId

                        }

                    });

                await tx.kycAuditLog.create({

                    data: {

                        userId,

                        kycVerificationId:
                            verification.id,

                        adminId,

                        action: "REJECTED",

                        previousStatus:
                            verification.status,

                        newStatus: "REJECTED",

                        reason: rejectionReason

                    }

                });

                return result;

            });

        return res.status(200).json({

            success: true,

            message: "KYC rejected successfully.",

            kyc: {

                id: updated.id,

                status: updated.status,

                rejectedAt: updated.rejectedAt,

                rejectionReason:
                    updated.rejectionReason

            }

        });

    } catch (error) {

        console.error("Reject KYC error:", error);

        return res.status(500).json({

            success: false,

            message: "Unable to reject KYC."

        });

    }

};
/*==================================================
            OFFLINE VERIFY USER KYC
==================================================*/

exports.offlineVerifyUserKyc = async (req, res) => {

    try {

        const userId = req.params.id;
        const adminId = req.user.id;

        const documentType =
            String(req.body.documentType || "OTHER")
                .trim()
                .toUpperCase();

        const documentCountry =
            String(req.body.documentCountry || "")
                .trim()
                .toUpperCase() || null;

        const adminNote =
            String(req.body.adminNote || "")
                .trim();

        if (!adminNote) {

            return res.status(400).json({

                success: false,

                message:
                    "An admin note describing the offline verification is required."

            });

        }

        const user = await prisma.user.findUnique({

            where: {
                id: userId
            },

            select: {
                id: true
            }

        });

        if (!user) {

            return res.status(404).json({

                success: false,

                message: "User not found."

            });

        }

        const existingVerification =
            await prisma.kycVerification.findUnique({

                where: {
                    userId
                }

            });

        if (existingVerification?.status === "VERIFIED") {

            return res.status(409).json({

                success: false,

                message:
                    "This user's KYC is already verified."

            });

        }

        const verifiedAt = new Date();

        const verification =
            await prisma.$transaction(async (tx) => {

                let result;

                if (existingVerification) {

                    result =
                        await tx.kycVerification.update({

                            where: {
                                id: existingVerification.id
                            },

                            data: {

                                status: "VERIFIED",

                                source: "OFFLINE_ADMIN",

                                documentType,

                                documentCountry,

                                reviewedAt: verifiedAt,

                                verifiedAt,

                                rejectedAt: null,

                                revokedAt: null,

                                rejectionReason: null,

                                reverificationReason: null,

                                adminNote,

                                verifiedByAdminId: adminId

                            }

                        });

                } else {

                    result =
                        await tx.kycVerification.create({

                            data: {

                                userId,

                                status: "VERIFIED",

                                source: "OFFLINE_ADMIN",

                                documentType,

                                documentCountry,

                                reviewedAt: verifiedAt,

                                verifiedAt,

                                adminNote,

                                verifiedByAdminId: adminId

                            }

                        });

                }

                await tx.kycAuditLog.create({

                    data: {

                        userId,

                        kycVerificationId:
                            result.id,

                        adminId,

                        action: "VERIFIED",

                        previousStatus:
                            existingVerification?.status ||
                            "NOT_SUBMITTED",

                        newStatus: "VERIFIED",

                        reason:
                            `Offline verification: ${adminNote}`

                    }

                });

                return result;

            });

        return res.status(200).json({

            success: true,

            message:
                "The user was verified successfully through offline verification.",

            kyc: {

                id: verification.id,

                status: verification.status,

                source: verification.source,

                verifiedAt:
                    verification.verifiedAt

            }

        });

    } catch (error) {

        console.error(
            "Offline KYC verification error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to complete offline KYC verification."

        });

    }

};
/*==================================================
          REQUIRE KYC REVERIFICATION
==================================================*/

exports.requireKycReverification = async (req, res) => {

    try {

        const userId = req.params.id;
        const adminId = req.user.id;

        const reverificationReason =
            String(req.body.reverificationReason || "").trim();

        const adminNote =
            String(req.body.adminNote || "").trim() || null;

        if (!reverificationReason) {

            return res.status(400).json({

                success: false,

                message:
                    "A reason for reverification is required."

            });

        }

        const verification =
            await prisma.kycVerification.findUnique({

                where: {
                    userId
                }

            });

        if (!verification) {

            return res.status(404).json({

                success: false,

                message:
                    "KYC record not found for this user."

            });

        }

        if (verification.status === "REVERIFY_REQUIRED") {

            return res.status(409).json({

                success: false,

                message:
                    "Reverification is already required for this user."

            });

        }

        const reviewedAt = new Date();

        const updated =
            await prisma.$transaction(async (tx) => {

                const result =
                    await tx.kycVerification.update({

                        where: {
                            id: verification.id
                        },

                        data: {

                            status: "REVERIFY_REQUIRED",

                            reviewedAt,

                            verifiedAt: null,

                            rejectedAt: null,

                            revokedAt: null,

                            rejectionReason: null,

                            reverificationReason,

                            adminNote,

                            verifiedByAdminId: adminId

                        }

                    });

                await tx.kycAuditLog.create({

                    data: {

                        userId,

                        kycVerificationId:
                            verification.id,

                        adminId,

                        action: "REVERIFY_REQUIRED",

                        previousStatus:
                            verification.status,

                        newStatus:
                            "REVERIFY_REQUIRED",

                        reason:
                            reverificationReason

                    }

                });

                return result;

            });

        return res.status(200).json({

            success: true,

            message:
                "The user must submit new KYC documents.",

            kyc: {

                id: updated.id,

                status: updated.status,

                reverificationReason:
                    updated.reverificationReason,

                reviewedAt:
                    updated.reviewedAt

            }

        });

    } catch (error) {

        console.error(
            "Require KYC reverification error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to require KYC reverification."

        });

    }

};
/*==================================================
             REVOKE USER KYC
==================================================*/

exports.revokeUserKyc = async (req, res) => {

    try {

        const userId = req.params.id;
        const adminId = req.user.id;

        const revokeReason =
            String(req.body.revokeReason || "").trim();

        const adminNote =
            String(req.body.adminNote || "").trim() || null;

        if (!revokeReason) {

            return res.status(400).json({

                success: false,

                message:
                    "A reason for revoking verification is required."

            });

        }

        const verification =
            await prisma.kycVerification.findUnique({

                where: {
                    userId
                }

            });

        if (!verification) {

            return res.status(404).json({

                success: false,

                message:
                    "KYC record not found for this user."

            });

        }

        if (verification.status !== "VERIFIED") {

            return res.status(409).json({

                success: false,

                message:
                    `KYC cannot be revoked while its status is ${verification.status}.`

            });

        }

        const revokedAt = new Date();

        const updated =
            await prisma.$transaction(async (tx) => {

                const result =
                    await tx.kycVerification.update({

                        where: {
                            id: verification.id
                        },

                        data: {

                            status: "REVERIFY_REQUIRED",

                            reviewedAt: revokedAt,

                            verifiedAt: null,

                            revokedAt,

                            rejectedAt: null,

                            rejectionReason: null,

                            reverificationReason:
                                revokeReason,

                            adminNote,

                            verifiedByAdminId: adminId

                        }

                    });

                await tx.kycAuditLog.create({

                    data: {

                        userId,

                        kycVerificationId:
                            verification.id,

                        adminId,

                        action: "REVOKED",

                        previousStatus:
                            verification.status,

                        newStatus:
                            "REVERIFY_REQUIRED",

                        reason:
                            revokeReason

                    }

                });

                return result;

            });

        return res.status(200).json({

            success: true,

            message:
                "The user's KYC verification was revoked successfully.",

            kyc: {

                id: updated.id,

                status: updated.status,

                revokedAt:
                    updated.revokedAt,

                reverificationReason:
                    updated.reverificationReason

            }

        });

    } catch (error) {

        console.error(
            "Revoke user KYC error:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Unable to revoke the user's KYC verification."

        });

    }

};