/*==================================================
                SENKU PAY
          DEPOSIT CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/*==================================
        CREATE DEPOSIT
==================================*/

exports.createDeposit = async (req, res) => {

    try {

        const {

            amount,

            method

        } = req.body;

        const depositAmount = Number(amount);

        if (

            isNaN(depositAmount) ||

            depositAmount <= 0

        ) {

            return res.status(400).json({

                success: false,

                message: "Invalid deposit amount."

            });

        }

        const deposit = await prisma.deposit.create({

            data: {

                userId: req.user.id,

                amount: depositAmount,

                method: method || "Manual",

                status: "PENDING"

            }

        });

        return res.status(201).json({

            success: true,

            message: "Deposit request submitted successfully.",

            deposit

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to create deposit."

        });

    }

};


/*==================================
        USER DEPOSITS
==================================*/

exports.getDeposits = async (req, res) => {

    try {

        const deposits =

            await prisma.deposit.findMany({

                where: {

                    userId: req.user.id

                },

                orderBy: {

                    createdAt: "desc"

                }

            });

        return res.status(200).json({

            success: true,

            deposits

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to load deposits."

        });

    }

};


/*==================================
        COMPLETE DEPOSIT
==================================*/

exports.completeDeposit = async (req, res) => {

    try {

        const {

            depositId

        } = req.body;

        const deposit =

            await prisma.deposit.findUnique({

                where: {

                    id: depositId

                }

            });

        if (!deposit) {

            return res.status(404).json({

                success: false,

                message: "Deposit not found."

            });

        }

        if (deposit.status === "SUCCESS") {

            return res.status(400).json({

                success: false,

                message: "Deposit already completed."

            });

        }

        await prisma.$transaction([

            prisma.user.update({

                where: {

                    id: deposit.userId

                },

                data: {

                    balance: {

                        increment: deposit.amount

                    },

                    deposited: {

                        increment: deposit.amount

                    }

                }

            }),

            prisma.deposit.update({

                where: {

                    id: deposit.id

                },

                data: {

                    status: "SUCCESS"

                }

            }),

            prisma.transaction.create({

                data: {

                    userId: deposit.userId,

                    type: "Deposit",

                    amount: deposit.amount,

                    status: "Completed"

                }

            })

        ]);

        return res.status(200).json({

            success: true,

            message: "Deposit completed successfully."

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to complete deposit."

        });

    }

};