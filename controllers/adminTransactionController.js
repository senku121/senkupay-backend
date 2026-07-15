/*==================================================
                SENKU PAY
      ADMIN TRANSACTION CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/*==================================
        GET ALL TRANSACTIONS
==================================*/

exports.getAllTransactions = async (req, res) => {

    try {

        const {

            page = 1,

            limit = 20,

            type,

            status,

            username

        } = req.query;

        const where = {};

        if (type) {

            where.type = type;

        }

        if (status) {

            where.status = status;

        }

        if (username) {

            where.user = {

                username: {

                    contains: username,

                    mode: "insensitive"

                }

            };

        }

        const skip =

            (Number(page) - 1) *

            Number(limit);

        const [

            total,

            transactions

        ] = await Promise.all([

            prisma.transaction.count({

                where

            }),

            prisma.transaction.findMany({

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

            transactions

        });

    }

    catch (error) {

        console.error(

            "Transaction error:",

            error

        );

        return res.status(500).json({

            success: false,

            message:

                "Unable to load transactions."

        });

    }

};