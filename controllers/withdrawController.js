/*==================================================
                SENKU PAY
        WITHDRAW CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/*==================================
        CREATE WITHDRAW
==================================*/

exports.createWithdraw = async (req, res) => {

    try {

        const {

            amount,

            method,

            account

        } = req.body;

        const withdrawAmount = Number(amount);

        if (

            isNaN(withdrawAmount)

            ||

            withdrawAmount <= 0

        ) {

            return res.status(400).json({

                success: false,

                message: "Invalid withdrawal amount."

            });

        }

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

        if (

            Number(user.balance)

            <

            withdrawAmount

        ) {

            return res.status(400).json({

                success: false,

                message: "Insufficient balance."

            });

        }

        await prisma.$transaction([

            prisma.user.update({

                where: {

                    id: req.user.id

                },

                data: {

                    balance: {

                        decrement: withdrawAmount

                    },

                    lockedBalance: {

                        increment: withdrawAmount

                    }

                }

            }),

            prisma.withdrawRequest.create({

                data: {

                    userId: req.user.id,

                    amount: withdrawAmount,

                    method,

                    account,

                    status: "Pending"

                }

            }),

            prisma.transaction.create({

                data: {

                    userId: req.user.id,

                    type: "Withdrawal",

                    amount: withdrawAmount,

                    status: "Pending"

                }

            })

        ]);

        return res.status(201).json({

            success: true,

            message: "Withdrawal request submitted."

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to create withdrawal."

        });

    }

};

/*==================================
        GET USER WITHDRAWALS
==================================*/

exports.getWithdraws = async (req, res) => {

    try {

        const withdrawals =

            await prisma.withdrawRequest.findMany({

                where: {

                    userId: req.user.id

                },

                orderBy: {

                    createdAt: "desc"

                }

            });

        return res.status(200).json({

            success: true,

            withdrawals

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to load withdrawals."

        });

    }

};