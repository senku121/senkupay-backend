/*==================================================
                SENKU PAY
        ADMIN WITHDRAW CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/*==================================
        GET ALL WITHDRAWALS
==================================*/

exports.getAllWithdraws = async (req, res) => {

    try {

        const {

            page = 1,

            limit = 20,

            status

        } = req.query;

        const where = {};

        if (status) {

            where.status = status;

        }

        const skip =
            (Number(page) - 1) *
            Number(limit);

        const [

            total,

            withdrawals

        ] = await Promise.all([

            prisma.withdrawRequest.count({

                where

            }),

            prisma.withdrawRequest.findMany({

                where,

                skip,

                take: Number(limit),

                include: {

                    user: {

                        select: {

                            id: true,

                            username: true,

                            email: true

                        }

                    }

                },

                orderBy: {

                    createdAt: "desc"

                }

            })

        ]);

        return res.status(200).json({

            success: true,

            total,

            page: Number(page),

            pages: Math.ceil(

                total /

                Number(limit)

            ),

            withdrawals

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message:
                "Unable to load withdrawals."

        });

    }

};


/*==================================
        APPROVE WITHDRAW
==================================*/

exports.approveWithdraw = async (req, res) => {

    try {

        const { id } = req.params;

        const request =
            await prisma.withdrawRequest.findUnique({

                where: {
                    id
                }

            });

        if (!request) {

            return res.status(404).json({

                success: false,

                message:
                    "Withdrawal request not found."

            });

        }

        if (request.status !== "Pending") {

            return res.status(400).json({

                success: false,

                message:
                    "Withdrawal has already been processed."

            });

        }

        await prisma.$transaction([

            prisma.user.update({

                where: {

                    id: request.userId

                },

                data: {

                    lockedBalance: {

                        decrement: request.amount

                    },

                    withdrawn: {

                        increment: request.amount

                    }

                }

            }),

            prisma.withdrawRequest.update({

                where: {

                    id

                },

                data: {

                    status: "Approved"

                }

            }),

            prisma.transaction.updateMany({

                where: {

                    userId: request.userId,

                    type: "Withdrawal",

                    status: "Pending"

                },

                data: {

                    status: "Approved"

                }

            })

        ]);

        return res.status(200).json({

            success: true,

            message:
                "Withdrawal approved successfully."

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message:
                "Unable to approve withdrawal."

        });

    }

};


/*==================================
        REJECT WITHDRAW
==================================*/

exports.rejectWithdraw = async (req, res) => {

    try {

        const { id } = req.params;

        const request =
            await prisma.withdrawRequest.findUnique({

                where: {
                    id
                }

            });

        if (!request) {

            return res.status(404).json({

                success: false,

                message:
                    "Withdrawal request not found."

            });

        }

        if (request.status !== "Pending") {

            return res.status(400).json({

                success: false,

                message:
                    "Withdrawal has already been processed."

            });

        }

        await prisma.$transaction([

            prisma.user.update({

                where: {

                    id: request.userId

                },

                data: {

                    balance: {

                        increment: request.amount

                    },

                    lockedBalance: {

                        decrement: request.amount

                    }

                }

            }),

            prisma.withdrawRequest.update({

                where: {

                    id

                },

                data: {

                    status: "Rejected"

                }

            }),

            prisma.transaction.updateMany({

                where: {

                    userId: request.userId,

                    type: "Withdrawal",

                    status: "Pending"

                },

                data: {

                    status: "Rejected"

                }

            })

        ]);

        return res.status(200).json({

            success: true,

            message:
                "Withdrawal rejected successfully."

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message:
                "Unable to reject withdrawal."

        });

    }

};