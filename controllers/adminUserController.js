/*==================================================
                SENKU PAY
        ADMIN USER CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

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